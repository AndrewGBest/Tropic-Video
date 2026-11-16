import { describe, expect, it } from 'vitest';
import { keyToAction } from '../src/layer/input/keys';
import {
  Btn,
  buttonToAction,
  heldButtons,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  RepeatTracker,
} from '../src/layer/input/gamepad';

describe('keyToAction', () => {
  it('maps arrows to movement while browsing', () => {
    expect(keyToAction({ key: 'ArrowLeft' }, 'browse')).toEqual({ type: 'move', dir: 'left' });
    expect(keyToAction({ key: 'Enter' }, 'browse')).toEqual({ type: 'select' });
  });

  it('maps left/right to seeking in the player', () => {
    expect(keyToAction({ key: 'ArrowRight' }, 'player')).toEqual({ type: 'seek', seconds: 10 });
    expect(keyToAction({ key: 'Enter' }, 'player')).toEqual({ type: 'playPause' });
    expect(keyToAction({ key: 'ArrowUp' }, 'player')).toEqual({ type: 'move', dir: 'up' });
  });

  it('knows the usual remote and media-keyboard buttons', () => {
    for (const key of ['GoBack', 'MediaStop', 'BrowserBack']) expect(keyToAction({ key }, 'player')).toEqual({ type: 'back' });
    expect(keyToAction({ key: 'BrowserSearch' }, 'browse')).toEqual({ type: 'search' });
    for (const key of ['ContextMenu', 'Info', 'Help']) expect(keyToAction({ key }, 'browse')).toEqual({ type: 'settings' });
    expect(keyToAction({ key: 'MediaPlayPause' }, 'browse')).toEqual({ type: 'playPause' });
  });

  it('takes whatever a remote sends for OK: select while browsing, play or pause on the picture', () => {
    for (const key of ['Enter', ' ', 'Select', 'Accept']) {
      expect(keyToAction({ key }, 'browse'), key).toEqual({ type: 'select' });
      expect(keyToAction({ key }, 'player'), key).toEqual({ type: 'playPause' });
    }
  });

  it('leaves typing alone in text mode', () => {
    expect(keyToAction({ key: 'a' }, 'text')).toBeNull();
    expect(keyToAction({ key: ' ' }, 'text')).toBeNull();
    expect(keyToAction({ key: 'Backspace' }, 'text')).toBeNull();
    expect(keyToAction({ key: 'ArrowLeft' }, 'text')).toBeNull();
    expect(keyToAction({ key: 'Escape' }, 'text')).toEqual({ type: 'back' });
  });

  it('handles shortcuts and ignores other modifier combos', () => {
    expect(keyToAction({ key: 'q', ctrlKey: true }, 'browse')).toEqual({ type: 'exit' });
    expect(keyToAction({ key: 'D', ctrlKey: true, shiftKey: true }, 'browse')).toEqual({ type: 'diagnostics' });
    expect(keyToAction({ key: 'ArrowLeft', altKey: true }, 'browse')).toBeNull();
    expect(keyToAction({ key: 'c', ctrlKey: true }, 'text')).toBeNull();
  });
});

describe('gamepad', () => {
  it('maps buttons by mode', () => {
    expect(buttonToAction(Btn.A, 'browse')).toEqual({ type: 'select' });
    expect(buttonToAction(Btn.A, 'player')).toEqual({ type: 'playPause' });
    expect(buttonToAction(Btn.B, 'browse')).toEqual({ type: 'back' });
    expect(buttonToAction(Btn.RB, 'browse')).toEqual({ type: 'seek', seconds: 10 });
    expect(buttonToAction(Btn.Select, 'browse')).toBeNull();
  });

  it('turns stick deflection into virtual buttons', () => {
    const held = heldButtons({ buttons: [], axes: [0.9, -0.2] });
    expect([...held]).toHaveLength(1);
    expect(buttonToAction([...held][0]!, 'browse')).toEqual({ type: 'move', dir: 'right' });
    expect(heldButtons({ buttons: [], axes: [0.3, 0.3] }).size).toBe(0);
  });

  it('fires once, then repeats directions after the delay', () => {
    const t = new RepeatTracker();
    const held = new Set<number>([Btn.Right]);
    expect(t.update(held, 0)).toEqual([Btn.Right]);
    expect(t.update(held, REPEAT_DELAY_MS - 1)).toEqual([]);
    expect(t.update(held, REPEAT_DELAY_MS)).toEqual([Btn.Right]);
    expect(t.update(held, REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1)).toEqual([]);
    expect(t.update(held, REPEAT_DELAY_MS + REPEAT_INTERVAL_MS)).toEqual([Btn.Right]);
  });

  it('never repeats select or back', () => {
    const t = new RepeatTracker();
    const held = new Set<number>([Btn.A, Btn.B]);
    expect(t.update(held, 0).sort()).toEqual([Btn.A, Btn.B]);
    expect(t.update(held, 10_000)).toEqual([]);
  });

  it('fires again after release', () => {
    const t = new RepeatTracker();
    expect(t.update(new Set([Btn.A]), 0)).toEqual([Btn.A]);
    expect(t.update(new Set(), 16)).toEqual([]);
    expect(t.update(new Set([Btn.A]), 32)).toEqual([Btn.A]);
  });
});
