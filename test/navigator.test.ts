// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { FOCUS_ATTR, SpatialNavigator } from '../src/layer/spatial/navigator';

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
