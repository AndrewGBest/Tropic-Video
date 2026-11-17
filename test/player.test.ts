// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findMainVideo, isPlayerActive, playerScope, isSeekBar, playerIsOwnPage } from '../src/layer/player';
import { SpatialNavigator } from '../src/layer/spatial/navigator';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo } from '../src/shared/player-keys';

// jsdom has no layout, so each test gives its videos a size by hand.
function video(id: string, w: number, h: number, opts: { muted?: boolean; playing?: boolean } = {}): string {
  return `<video id="${id}" data-w="${w}" data-h="${h}" ${opts.muted ? 'muted' : ''} data-playing="${opts.playing ?? true}"></video>`;
}

function mount(markup: string): void {
  document.body.innerHTML = markup;
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });
  for (const v of document.querySelectorAll('video')) {
    const w = Number(v.dataset['w']);
    const h = Number(v.dataset['h']);
    v.getBoundingClientRect = () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) });
    v.muted = v.hasAttribute('muted');
    const playing = v.dataset['playing'] === 'true';
    Object.defineProperty(v, 'paused', { value: !playing, configurable: true });
    Object.defineProperty(v, 'readyState', { value: 4, configurable: true });
  }
}

describe('findMainVideo', () => {
  beforeEach(() => (document.body.innerHTML = ''));

  it('finds a large unmuted video with no adapter', () => {
    mount(video('main', 1280, 720));
    expect(findMainVideo(document)?.id).toBe('main');
    expect(isPlayerActive(document)).toBe(true);
  });

  it('ignores small videos', () => {
    mount(video('thumb', 320, 180));
    expect(findMainVideo(document)).toBeNull();
  });

  it('does not take a muted full-width background trailer for the player', () => {
    mount(video('trailer', 1280, 660, { muted: true }));
    expect(findMainVideo(document)).toBeNull();
    expect(isPlayerActive(document)).toBe(false);
  });

  // Shape seen on the live site: a title page with an unmuted-able trailer and an empty player container.
  it('with a player root, only videos inside it count', () => {
    mount(`<div class="hero">${video('trailer', 1280, 660)}</div><div id="player">${video('real', 0, 0, { playing: false })}</div>`);
    expect(findMainVideo(document, ['#player'])).toBeNull();
    mount(`<div class="hero">${video('trailer', 1280, 660)}</div><div id="player">${video('real', 1280, 720)}</div>`);
    expect(findMainVideo(document, ['#player'])?.id).toBe('real');
  });

  it('falls back to the generic rule when the adapter selector matches nothing or is invalid', () => {
    mount(video('main', 1280, 720));
    expect(findMainVideo(document, ['#gone', ':::bad'])?.id).toBe('main');
  });
});

describe('player keys', () => {
  it('maps only the known keys', () => {
    expect(playerKeyInfo('playPause')).toEqual({ code: 'Space', domKey: ' ' });
    expect(playerKeyInfo('seekBack')?.code).toBe('Left');
    expect(playerKeyInfo('seekForward')?.code).toBe('Right');
    expect(playerKeyInfo('close')).toEqual({ code: 'Escape', domKey: 'Escape' });
    expect(playerKeyInfo('backspace')?.code).toBe('Backspace');
    expect(playerKeyInfo('enter')).toEqual({ code: 'Enter', domKey: 'Enter', char: '\r' });
    for (const bad of ['Enter', 'toString', '__proto__', '', 5, null, undefined, {}]) {
      expect(playerKeyInfo(bad)).toBeNull();
    }
  });

  it('maps actions to player keys', () => {
    expect(playerKeyFor({ type: 'playPause' })).toBe('playPause');
    expect(playerKeyFor({ type: 'seek', seconds: -10 })).toBe('seekBack');
    expect(playerKeyFor({ type: 'seek', seconds: 10 })).toBe('seekForward');
    expect(playerKeyFor({ type: 'select' })).toBeNull();
  });

  // Found on the live site: handling Space and then pressing Space delivered it twice, so pause undid itself.
  it('recognises a physical key that is already the right one', () => {
    expect(isNativePlayerKey(' ', { type: 'playPause' })).toBe(true);
    expect(isNativePlayerKey('ArrowRight', { type: 'seek', seconds: 10 })).toBe(true);
    expect(isNativePlayerKey('ArrowRight', { type: 'seek', seconds: -10 })).toBe(false);
    expect(isNativePlayerKey('Enter', { type: 'playPause' })).toBe(false);
    expect(isNativePlayerKey('MediaPlayPause', { type: 'playPause' })).toBe(false);
  });

  it('lets an expected key through exactly once', () => {
    const k = new InjectedKeys(1000);
    k.expect(' ', 0);
    expect(k.consume('ArrowLeft', 10)).toBe(false);
    expect(k.consume(' ', 10)).toBe(true);
    expect(k.consume(' ', 20)).toBe(false);
  });

  it('forgets an expected key that never arrived', () => {
    const k = new InjectedKeys(1000);
    k.expect('ArrowRight', 0);
    expect(k.consume('ArrowRight', 1001)).toBe(false);
  });
});

describe('player scope', () => {
  const size = (el: Element, w: number, h: number, left = 0, top = 0): void => {
    el.getBoundingClientRect = () => ({ width: w, height: h, left, top, right: left + w, bottom: top + h, x: left, y: top, toJSON: () => ({}) });
  };

  it('is the adapter root when the video is inside it', () => {
    mount(`<div id="player"><div>${video('real', 1280, 720)}</div></div>`);
    const v = document.getElementById('real') as HTMLVideoElement;
    expect(playerScope(v, ['#player']).id).toBe('player');
  });

  it('without an adapter, climbs to the highest ancestor that fits the viewport', () => {
    mount(`<main id="page"><div id="shell"><div id="inner">${video('real', 1280, 720)}</div></div></main>`);
    size(document.getElementById('inner')!, 1280, 720);
    size(document.getElementById('shell')!, 1280, 720);
    size(document.getElementById('page')!, 1280, 3000);
    const v = document.getElementById('real') as HTMLVideoElement;
    expect(playerScope(v).id).toBe('shell');
  });

  it('keeps navigation inside the scope and can start from a point', () => {
    mount(`<a href="#x" id="behind">x</a><div id="player"><button id="left">a</button><button id="mid">b</button></div>`);
    size(document.getElementById('behind')!, 100, 40, 600, 300);
    size(document.getElementById('left')!, 40, 40, 100, 650);
    size(document.getElementById('mid')!, 40, 40, 620, 650);
    Element.prototype.scrollIntoView = () => undefined; // jsdom has none
    const nav = new SpatialNavigator(document, { scope: () => document.getElementById('player') });
    expect(nav.candidates().map((e) => e.id)).toEqual(['left', 'mid']);
    expect(nav.moveFrom({ x: 640, y: 360 }, 'down')).toBe(true);
    expect(nav.focused?.id).toBe('mid');
    nav.move('left');
    expect(nav.focused?.id).toBe('left');
  });
});

describe('playerIsOwnPage', () => {
  it('is true when the player has an address of its own', () => {
    expect(playerIsOwnPage('https://example.com/browse/title-1', 'https://example.com/play/abc')).toBe(true);
  });
  it('is false for a player laid over the page it was started from', () => {
    expect(playerIsOwnPage('https://example.com/detail/1?x=1', 'https://example.com/detail/1?autoplay=1#t')).toBe(false);
  });
  it('is false when nothing was browsed first, or an address cannot be read', () => {
    expect(playerIsOwnPage(null, 'https://example.com/play/abc')).toBe(false);
    expect(playerIsOwnPage('nonsense', 'https://example.com/play/abc')).toBe(false);
  });
});

describe('isSeekBar', () => {
  const sized = (markup: string, width: number): Element => {
    document.body.innerHTML = markup;
    const el = document.body.firstElementChild!;
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 20, width, height: 20, x: 0, y: 0, toJSON: () => ({}) });
    return el;
  };
  it('is a slider that spans most of the screen', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    expect(isSeekBar(sized('<div role="slider"></div>', 900), window)).toBe(true);
    expect(isSeekBar(sized('<input type="range">', 700), window)).toBe(true);
  });
  it('is not a volume slider or a wide button', () => {
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    expect(isSeekBar(sized('<div role="slider"></div>', 80), window)).toBe(false);
    expect(isSeekBar(sized('<button></button>', 900), window)).toBe(false);
  });
});
