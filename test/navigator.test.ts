// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coveredByScreen, edgeControl, FOCUS_ATTR, openDialog, SpatialNavigator, ZOOM_ATTR } from '../src/layer/spatial/navigator';

// jsdom has no layout engine, so each element's rectangle is read from data-rect="left,top,width,height".
function installLayout(): void {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute('data-rect') ?? '').split(',').map(Number);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
  };
  Element.prototype.scrollIntoView = () => undefined;
}

const card = (id: string, x: number, y: number, extra = ''): string =>
  `<a href="#" id="${id}" data-rect="${x},${y},100,60" ${extra}>x</a>`;

beforeEach(() => {
  installLayout();
  document.body.innerHTML = `
    <nav>${card('home', 0, 0)}${card('store', 120, 0)}</nav>
    <div id="row1">${card('a1', 0, 100)}${card('a2', 120, 100)}${card('a3', 240, 100)}</div>
    <div id="row2">${card('b1', 0, 200)}${card('b2', 120, 200)}</div>
    ${card('hidden', 360, 100, 'style="display:none"')}
    <div aria-hidden="true">${card('inert', 360, 200)}</div>
    <tropic-overlay>${card('ours', 480, 100)}</tropic-overlay>
    <div role="button" id="wrapper" data-rect="0,300,300,80"><button id="inner" data-rect="10,310,80,40">go</button></div>
    <button id="tiny" data-rect="600,0,1,1">.</button>
    <button id="off" disabled data-rect="600,100,100,60">off</button>`;
});

const ids = (els: Element[]): string[] => els.map((e) => e.id).sort();

describe('SpatialNavigator', () => {
  it('collects only visible, enabled, non-layer controls and prefers inner controls', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'tropic-overlay' });
    expect(ids(nav.candidates())).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'home', 'inner', 'store']);
  });

  it('starts at the top-left and walks the grid', () => {
    const seen: string[] = [];
    const nav = new SpatialNavigator(document, { ignoreWithin: 'tropic-overlay', onFocusChange: (el) => seen.push(el?.id ?? '-') });
    nav.move('down');
    nav.move('down');
    nav.move('right');
    nav.move('right');
    nav.move('down');
    nav.move('left');
    expect(seen).toEqual(['home', 'a1', 'a2', 'a3', 'b2', 'b1']);
    expect(document.querySelectorAll(`[${FOCUS_ATTR}]`)).toHaveLength(1);
    expect(document.activeElement?.id).toBe('b1');
  });

  it('stays put at an edge', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'tropic-overlay' });
    nav.move('down');
    expect(nav.move('left')).toBe(false);
    expect(nav.focused?.id).toBe('home');
  });

  it('activates the focused control', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'tropic-overlay' });
    let clicked = 0;
    document.getElementById('home')!.addEventListener('click', (e) => {
      e.preventDefault();
      clicked += 1;
    });
    expect(nav.activate()).toBe(false);
    nav.move('down');
    expect(nav.activate()).toBe(true);
    expect(clicked).toBe(1);
  });

  it('recovers when the focused element is removed', () => {
    const nav = new SpatialNavigator(document, { ignoreWithin: 'tropic-overlay' });
    nav.move('down');
    document.getElementById('home')!.remove();
    expect(nav.focused).toBeNull();
    nav.move('down');
    expect(nav.focused?.id).toBe('store');
  });

  it('uses adapter selectors for extra focusable elements', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="tile" id="tile" data-rect="0,500,100,60"></div>');
    const nav = new SpatialNavigator(document, { extraFocusable: ['.tile'] });
    expect(ids(nav.candidates())).toContain('tile');
  });
});

describe('row memory', () => {
  // Two sideways-scrolling rows and a plain grid row under them. Row A has been scrolled: its first card is off to the left.
  const strip = (id: string, cards: string): string => `<div id="${id}" data-rect="0,0,400,60" style="overflow-x: auto">${cards}</div>`;
  const scrollable = (id: string): void => {
    const el = document.getElementById(id)!;
    Object.defineProperty(el, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  };

  beforeEach(() => {
    document.body.innerHTML =
      strip('rowA', `${card('a0', -130, 100)}${card('a1', 0, 100)}${card('a2', 120, 100)}${card('a3', 240, 100)}`) +
      strip('rowB', `${card('b0', 0, 200)}${card('b1', 120, 200)}${card('b2', 240, 200)}`) +
      `<div id="grid">${card('g0', 0, 300)}${card('g1', 120, 300)}${card('g2', 240, 300)}</div>`;
    scrollable('rowA');
    scrollable('rowB');
  });

  it('enters a fresh row at its first item on screen', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a3'));
    nav.move('down');
    expect(nav.focused?.id).toBe('b0');
  });

  it('returns to where the user was in a row', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a3'));
    nav.move('down');
    nav.move('up');
    expect(nav.focused?.id).toBe('a3');
    nav.move('down');
    nav.move('right');
    nav.move('right');
    nav.move('up');
    nav.move('down');
    expect(nav.focused?.id).toBe('b2');
  });

  it('never enters a row at an item scrolled off its left edge', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('b0'));
    nav.move('up');
    expect(nav.focused?.id).toBe('a1');
  });

  it('does not take a page-sized clipping container for a row', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `<div id="pageBox" style="overflow-x: hidden">${card('top', 0, 0)}${card('g0', 0, 300)}${card('g1', 240, 300)}${card('below', 240, 400)}</div>`;
    const box = document.getElementById('pageBox')!;
    Object.defineProperty(box, 'scrollWidth', { value: 2000, configurable: true });
    Object.defineProperty(box, 'clientWidth', { value: 960, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 2600, configurable: true });
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('below'));
    nav.move('up');
    expect(nav.focused?.id).toBe('g1');
  });

  it('leaves plain grids geometric', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('b2'));
    nav.move('down');
    expect(nav.focused?.id).toBe('g2');
  });

  it('does not interfere with sideways movement inside a row', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('a1'));
    nav.move('right');
    expect(nav.focused?.id).toBe('a2');
  });
});

describe('carousels', () => {
  // Shape seen on the live site: slides stacked in one place, all but one inside a transparent wrapper, with arrows beside the list.
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `
      <nav data-rect="0,0,960,40">${card('home', 0, 0)}</nav>
      <div id="hero" data-rect="0,40,960,360">
        <button id="prev" class="arrow prev" data-rect="0,200,30,30">p</button>
        <ul>
          <li style="opacity: 0"><div>${card('s1', 60, 300)}</div></li>
          <li><div>${card('s2', 60, 300)}${card('s2more', 200, 300)}</div></li>
        </ul>
        <button id="next" class="arrow next" data-rect="925,200,30,30">n</button>
      </div>
      <main id="page" data-rect="0,0,960,3000"><div id="plain">${card('lonely', 0, 500)}</div></main>`;
  });

  it('ignores controls inside a transparent ancestor', () => {
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).not.toContain('s1');
    expect(ids(nav.candidates())).toContain('s2');
  });

  it('ignores a backdrop link stretched behind other controls', () => {
    document.getElementById('hero')!.insertAdjacentHTML('beforeend', '<a href="#" id="backdrop" data-rect="0,40,960,360">x</a>');
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).not.toContain('backdrop');
    expect(ids(nav.candidates())).toContain('s2');
  });

  it('never focuses the arrows when the adapter names them', () => {
    const nav = new SpatialNavigator(document, { skip: ['.arrow', ':::bad'] });
    expect(ids(nav.candidates())).toEqual(['home', 'lonely', 's2', 's2more']);
  });

  it('finds the arrow of the strip the focus is in', () => {
    const hit = edgeControl(document.getElementById('s2more')!, ['.next'], window);
    expect(hit?.control.id).toBe('next');
    expect(hit?.container.id).toBe('hero');
    expect(edgeControl(document.getElementById('s2')!, ['.prev'], window)?.control.id).toBe('prev');
  });

  // Seen on the live site: the arrows sit in a transparent wrapper until hovered, and a tall list lies between the slide and them.
  it('uses an arrow that is laid out but transparent, past a tall ancestor without arrows', () => {
    document.getElementById('next')!.outerHTML = '<span style="opacity: 0"><button id="next" class="arrow next" data-rect="925,200,30,30">n</button></span>';
    document.querySelector('#hero ul')!.setAttribute('data-rect', '0,40,960,1083');
    expect(edgeControl(document.getElementById('s2more')!, ['.next'], window)?.control.id).toBe('next');
  });

  it('does not reach into another strip through a page-sized ancestor', () => {
    document.getElementById('page')!.append(document.getElementById('hero')!);
    expect(edgeControl(document.getElementById('lonely')!, ['.next'], window)).toBeNull();
  });

  it('can focus the first control of the slide now showing', () => {
    const nav = new SpatialNavigator(document, { skip: ['.arrow'] });
    nav.focusFirstIn(document.getElementById('hero')!);
    expect(nav.focused?.id).toBe('s2');
  });
});

describe('focus zoom', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML =
      card('small', 0, 0) +
      '<a href="#" id="banner" data-rect="0,100,960,300">x</a>' +
      '<input id="field" type="search" data-rect="0,420,200,40">';
  });

  it('marks a focused card and unmarks it when focus moves on or is cleared', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('small'));
    expect(document.getElementById('small')!.hasAttribute(ZOOM_ATTR)).toBe(true);
    nav.focus(document.getElementById('banner'));
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
    nav.focus(document.getElementById('small'));
    nav.clear();
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
  });

  it('grows the whole card when the focused link is a layer over it', () => {
    document.body.innerHTML = '<section data-rect="0,0,960,200"><article id="cardbox" data-rect="10,10,200,113"><img data-rect="10,10,200,113"><a href="#" id="layer" data-rect="10,10,200,113">x</a></article></section>';
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('layer'));
    expect(document.getElementById('cardbox')!.hasAttribute(ZOOM_ATTR)).toBe(true);
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(1);
    nav.clear();
    expect(document.querySelectorAll(`[${ZOOM_ATTR}]`)).toHaveLength(0);
  });

  it('does not grow banners or text fields', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('banner'));
    expect(document.getElementById('banner')!.hasAttribute(ZOOM_ATTR)).toBe(false);
    nav.focus(document.getElementById('field'));
    expect(document.getElementById('field')!.hasAttribute(ZOOM_ATTR)).toBe(false);
  });
});

describe('scrolling to the focused control', () => {
  it('goes to the top of the page for anything on the first screenful, and centres rows below it', () => {
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    document.body.innerHTML = card('inBanner', 40, 300) + card('lower', 40, 900);
    const calls: string[] = [];
    window.scrollTo = ((opts: ScrollToOptions) => calls.push(`top:${opts.top}`)) as typeof window.scrollTo;
    Element.prototype.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean): void {
      calls.push(`${this.id}:${typeof opts === 'object' ? opts.block : ''}`);
    };
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('inBanner'));
    nav.focus(document.getElementById('lower'));
    expect(calls).toEqual(['top:0', 'lower:center']);
  });
});

describe('styled radios and checkboxes', () => {
  // Shape seen in the live site's player menus: an invisible input inside a visible label.
  beforeEach(() => {
    document.body.innerHTML = `
      <label id="optA" data-rect="600,100,240,32"><input type="radio" name="s" id="rA" style="opacity: 0" data-rect="600,108,13,13"><div>x</div></label>
      <label id="optB" data-rect="600,140,240,32"><input type="radio" name="s" id="rB" style="opacity: 0" data-rect="600,148,13,13"><div>x</div></label>
      <label id="plain" data-rect="600,180,240,32"><input type="checkbox" id="visibleBox" data-rect="600,188,13,13"> x</label>
      <label id="textLabel" data-rect="600,220,240,32">not a control</label>`;
  });

  it('focuses the label when its input is invisible, and the input when it is not', () => {
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['optA', 'optB', 'visibleBox']);
  });

  // Shape seen on the live site's season selector.
  it('focuses a label tied by "for" to a toggle parked off screen, and not labels for other things', () => {
    document.body.innerHTML = `
      <input type="checkbox" id="parked" data-rect="-99955,100,13,13">
      <label for="parked" id="seasons" aria-hidden="true" data-rect="44,100,141,48">x</label>
      <input type="checkbox" id="real" data-rect="300,100,20,20">
      <label for="real" id="besideReal" data-rect="330,100,100,20">x</label>
      <input type="search" id="q" data-rect="500,100,200,30">
      <label for="q" id="forText" data-rect="500,60,100,20">x</label>
      <label for="missing" id="dangling" data-rect="700,100,100,20">x</label>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['q', 'real', 'seasons']);
    nav.focus(document.getElementById('seasons'));
    nav.activate();
    expect((document.getElementById('parked') as HTMLInputElement).checked).toBe(true);
  });

  it('selects the option when its label is activated', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('optB'));
    nav.activate();
    expect((document.getElementById('rB') as HTMLInputElement).checked).toBe(true);
  });

  it('can pick up focus nearest to a point', () => {
    const nav = new SpatialNavigator(document);
    nav.focusNearest({ x: 700, y: 150 });
    expect(nav.focused?.id).toBe('optB');
  });
});

describe('moving from a point', () => {
  // A player whose bottom controls are disabled: only the top bar can be reached.
  const bar = `
    <button id="close" data-rect="20,16,40,40">x</button>
    <button id="subs" data-rect="710,16,40,40">s</button>
    <input type="range" id="volume" data-rect="500,65,30,150">
    <button id="pause" disabled data-rect="455,470,50,50">p</button>`;

  it('goes to the control in that direction when there is one', () => {
    document.body.innerHTML = bar + '<button id="next" data-rect="820,485,110,30">n</button>';
    const nav = new SpatialNavigator(document);
    nav.moveFrom({ x: 480, y: 270 }, 'down');
    expect(nav.focused?.id).toBe('next');
  });

  it('takes the nearest button, not the first control or a slider, when nothing lies that way', () => {
    document.body.innerHTML = bar;
    const nav = new SpatialNavigator(document);
    expect(nav.moveFrom({ x: 480, y: 270 }, 'down')).toBe(true);
    expect(nav.focused?.id).toBe('subs');
  });
});

describe('transparent hit areas', () => {
  it('keeps one target where a link and a transparent button share a box', () => {
    document.body.innerHTML = `
      <div><a href="#" id="cardLink" data-rect="10,10,217,122">x</a><button id="ghostButton" style="opacity: 0" data-rect="10,11,217,122">x</button></div>
      <div><button id="onlyGhost" style="opacity: 0" data-rect="300,10,217,122">x</button></div>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['cardLink', 'onlyGhost']);
  });

  it('focuses a picture-sized transparent link, but not transparent inputs, small ones or ones in a hidden container', () => {
    document.body.innerHTML = `
      <a href="#" id="overlay" style="opacity: 0" data-rect="0,0,275,155">x</a>
      <a href="#" id="hoverOnly" style="opacity: 0; pointer-events: none" data-rect="0,200,275,155">x</a>
      <a href="#" id="speck" style="opacity: 0" data-rect="300,0,30,30">x</a>
      <input id="ghost" type="checkbox" style="opacity: 0" data-rect="300,200,40,40">
      <div style="opacity: 0"><a href="#" id="inHidden" data-rect="0,400,275,155">x</a></div>`;
    const nav = new SpatialNavigator(document);
    expect(ids(nav.candidates())).toEqual(['hoverOnly', 'overlay']);
  });
});

describe('pinned bars', () => {
  // The page has scrolled: a sticky tab strip sits at the top of the screen, and the row above is partly off screen.
  beforeEach(() => {
    document.body.innerHTML = `
      <div style="position: sticky">${card('tab', 40, 60)}</div>
      ${card('rowAbove', 40, -30)}
      ${card('here', 40, 240)}
      ${card('rowBelow', 40, 400)}`;
  });

  it('goes to page content above rather than the pinned bar', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('here'));
    nav.move('up');
    expect(nav.focused?.id).toBe('rowAbove');
  });

  it('reaches the pinned bar when no page content is left above', () => {
    document.getElementById('rowAbove')!.remove();
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('here'));
    nav.move('up');
    expect(nav.focused?.id).toBe('tab');
  });

  it('leaves the pinned bar normally', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('tab'));
    nav.move('down');
    expect(nav.focused?.id).toBe('here');
  });
});

describe('following a jump', () => {
  it('knows when focus is off screen and can pick the first page control on screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 540, configurable: true });
    document.body.innerHTML = `
      <div style="position: sticky">${card('pinnedTab', 40, 0)}</div>
      ${card('leftBehind', 40, -1600)}
      ${card('cutOff', 40, 500)}
      ${card('second', 300, 200)}
      ${card('first', 40, 200)}`;
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('leftBehind'));
    expect(nav.focusIsOffScreen()).toBe(true);
    nav.focusFirstOnScreen();
    expect(nav.focused?.id).toBe('first');
    expect(nav.focusIsOffScreen()).toBe(false);
  });
});

describe('pop-ups', () => {
  it('ignores a dialog that something else covers', () => {
    document.body.innerHTML = `<div role="dialog" aria-modal="true" id="under" data-rect="250,40,460,500">${card('x', 300, 100)}</div><div id="playerOnTop"></div>`;
    const original = document.elementFromPoint;
    document.elementFromPoint = () => document.getElementById('playerOnTop');
    expect(openDialog(document)).toBeNull();
    document.elementFromPoint = () => document.getElementById('x');
    expect(openDialog(document)?.id).toBe('under');
    document.elementFromPoint = original;
  });

  it('finds an open modal dialog and ignores closed or non-modal ones', () => {
    document.body.innerHTML = `
      ${card('behind', 0, 0)}
      <div role="dialog" aria-modal="true" id="closed" data-rect="0,0,0,0"></div>
      <div role="dialog" id="notModal" data-rect="10,10,300,300"></div>
      <div role="dialog" aria-modal="true" id="open" data-rect="250,40,460,500">${card('close', 600, 60)}${card('action', 300, 400)}</div>`;
    expect(openDialog(document)?.id).toBe('open');
    const nav = new SpatialNavigator(document, { scope: () => openDialog(document) });
    expect(ids(nav.candidates())).toEqual(['action', 'close']);
    document.getElementById('open')!.remove();
    expect(openDialog(document)).toBeNull();
    expect(ids(nav.candidates())).toEqual(['behind']);
  });
});

describe('a held key on a page that loads more as it scrolls', () => {
  // Two rows loaded so far, then a long gap, then the footer.
  const page = `
    <a href="#" id="r1" data-rect="0,100,100,60">x</a>
    <a href="#" id="r2" data-rect="0,300,100,60">x</a>
    <a href="#" id="footer" data-rect="0,2500,100,30">x</a>`;
  let scrolled: number[];
  beforeEach(() => {
    document.body.innerHTML = page;
    scrolled = [];
    window.scrollBy = ((o: ScrollToOptions) => void scrolled.push(o.top ?? 0)) as typeof window.scrollBy;
    window.scrollTo = (() => undefined) as typeof window.scrollTo;
  });
  afterEach(() => vi.restoreAllMocks());

  const at = (ms: number): void => void vi.spyOn(Date, 'now').mockReturnValue(ms);

  it('scrolls toward a far target instead of jumping to it', () => {
    const nav = new SpatialNavigator(document);
    at(10_000);
    nav.focus(document.getElementById('r1'));
    nav.move('down');
    at(10_050);
    expect(nav.move('down')).toBe(true);
    expect(nav.focused?.id).toBe('r2');
    expect(scrolled).toEqual([0.8 * window.innerHeight]);
  });

  it('still jumps on a single press', () => {
    const nav = new SpatialNavigator(document);
    at(10_000);
    nav.focus(document.getElementById('r2'));
    at(20_000);
    nav.move('down');
    expect(nav.focused?.id).toBe('footer');
    expect(scrolled).toEqual([]);
  });

  it('carries on from what is on screen when the focused element is replaced part-way down', () => {
    const nav = new SpatialNavigator(document);
    nav.focus(document.getElementById('r2'));
    document.getElementById('r2')!.remove();
    // The page is scrolled down: the first row is above the screen.
    document.getElementById('r1')!.setAttribute('data-rect', '0,-900,100,60');
    document.body.insertAdjacentHTML('beforeend', '<a href="#" id="fresh" data-rect="0,320,100,60">x</a>');
    Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true });
    at(30_000);
    nav.move('down');
    expect(nav.focused?.id).toBe('fresh');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});

describe('coveredByScreen', () => {
  const setup = (topId: string): Element => {
    document.body.innerHTML = `
      <div id="page" data-rect="0,0,1024,3000"><a href="#" id="play" data-rect="30,360,400,60"><span id="label" data-rect="60,370,100,20">x</span></a>
        <div id="badge" data-rect="30,360,60,20">new</div></div>
      <div id="player" data-rect="0,0,1024,768"><div id="spinner" data-rect="480,350,60,60">o</div></div>`;
    document.elementFromPoint = () => document.getElementById(topId);
    return document.getElementById('play')!;
  };

  it('is false while the control itself, or a small thing on it, is in front', () => {
    expect(coveredByScreen(setup('label'), window)).toBe(false);
    expect(coveredByScreen(setup('badge'), window)).toBe(false);
  });

  it('is true once something screen-sized is in front, or a part of it', () => {
    expect(coveredByScreen(setup('player'), window)).toBe(true);
    expect(coveredByScreen(setup('spinner'), window)).toBe(true);
  });
});
