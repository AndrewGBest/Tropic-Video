// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { composedParent, deepActiveElement, deepClosest, deepContains, deepQueryAll } from '../src/layer/spatial/deep';
import { SpatialNavigator } from '../src/layer/spatial/navigator';

// A player built the way Steamboat's service builds its own: controls inside
// nested open shadow roots, each real button hidden from assistive technology
// inside a wrapper that carries the role.
function build(): { outer: HTMLElement; play: HTMLElement; mute: HTMLElement } {
  document.body.innerHTML = '<a href="#" id="page" data-rect="0,0,100,60">x</a><div id="player" data-rect="0,0,960,540"><x-ui></x-ui></div>';
  const ui = document.querySelector('x-ui')!;
  const outer = ui.attachShadow({ mode: 'open' });
  outer.innerHTML = '<div id="bar"><x-play></x-play><x-mute></x-mute></div>';
  const make = (host: Element, x: number): HTMLElement => {
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<div role="button" data-rect="${x},460,40,40"><button aria-hidden="true" data-rect="${x},460,40,40">x</button></div>`;
    return root.querySelector('[role="button"]')!;
  };
  return { outer: ui as HTMLElement, play: make(outer.querySelector('x-play')!, 400), mute: make(outer.querySelector('x-mute')!, 500) };
}

beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const [left = 0, top = 0, width = 0, height = 0] = (this.getAttribute('data-rect') ?? '').split(',').map(Number);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
  };
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
});

describe('seeing through open shadow roots', () => {
  it('finds elements in nested roots', () => {
    const { play, mute } = build();
    expect(document.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(deepQueryAll(document, '[role="button"]')).toEqual([play, mute]);
    expect(deepQueryAll(document.getElementById('player')!, '[role="button"]')).toEqual([play, mute]);
  });

  it('walks out through hosts', () => {
    const { outer, play } = build();
    expect(composedParent(play)?.tagName).toBe('X-PLAY');
    expect(deepClosest(play, '#player')).toBe(document.getElementById('player'));
    expect(deepClosest(play, '#nowhere')).toBeNull();
    expect(deepContains(document.getElementById('player')!, play)).toBe(true);
    expect(deepContains(outer, play)).toBe(true);
    expect(deepContains(play, outer)).toBe(false);
    expect(deepContains(document.getElementById('page')!, play)).toBe(false);
  });

  it('reports the element that really has focus', () => {
    const { play } = build();
    play.tabIndex = 0;
    play.focus();
    expect(document.activeElement?.tagName).toBe('X-UI');
    expect(deepActiveElement(document)).toBe(play);
  });
});

describe('navigation into shadow roots', () => {
  it('offers controls inside them, one per wrapper, and moves between them', () => {
    const { play, mute } = build();
    const nav = new SpatialNavigator(document, { scope: () => document.getElementById('player') });
    expect(nav.candidates()).toEqual([play, mute]);
    nav.focus(play);
    expect(nav.move('right')).toBe(true);
    expect(nav.focused).toBe(mute);
    expect(nav.move('left')).toBe(true);
    expect(nav.focused).toBe(play);
  });

  it('leaves out what a hidden ancestor outside the root hides', () => {
    const { outer } = build();
    outer.setAttribute('aria-hidden', 'true');
    const nav = new SpatialNavigator(document);
    expect(nav.candidates().map((el) => el.id)).toEqual(['page']);
  });
});
