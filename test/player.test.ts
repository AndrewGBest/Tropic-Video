// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { findMainVideo, isPlayerActive } from '../src/layer/player';
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
  it('maps only the three known keys', () => {
    expect(playerKeyInfo('playPause')).toEqual({ code: 'Space', domKey: ' ' });
    expect(playerKeyInfo('seekBack')?.code).toBe('Left');
    expect(playerKeyInfo('seekForward')?.code).toBe('Right');
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
