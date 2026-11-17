// Gamepad handling. The state machine is pure (time is passed in) so repeat
// behaviour is unit-tested; `startPolling` is the thin browser wrapper.
import type { Action } from '../../shared/actions';
import { actionFor, type ActionName } from '../../shared/config';
import type { Mode } from './keys';

// Standard Gamepad mapping button indices.
export const Btn = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  Select: 8,
  Start: 9,
  L3: 10,
  R3: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const;

// Left-stick directions are folded into virtual buttons past the real ones.
const STICK_UP = 100;
const STICK_DOWN = 101;
const STICK_LEFT = 102;
const STICK_RIGHT = 103;

export const AXIS_THRESHOLD = 0.5;
export const REPEAT_DELAY_MS = 500;
export const REPEAT_INTERVAL_MS = 100;
const SEEK_STEP = 10;

const REPEATABLE = new Set<number>([
  Btn.Up, Btn.Down, Btn.Left, Btn.Right,
  STICK_UP, STICK_DOWN, STICK_LEFT, STICK_RIGHT,
  Btn.LB, Btn.RB,
]);

/** `overrides` are the user's own mappings from the config file, by button number; they win over the built-in table. */
export function buttonToAction(button: number, mode: Mode, overrides: Readonly<Record<string, ActionName>> = {}): Action | null {
  if (Object.hasOwn(overrides, String(button))) return actionFor(overrides[String(button)]!);
  switch (button) {
    case Btn.Up:
    case STICK_UP:
      return { type: 'move', dir: 'up' };
    case Btn.Down:
    case STICK_DOWN:
      return { type: 'move', dir: 'down' };
    case Btn.Left:
    case STICK_LEFT:
      return mode === 'player' ? { type: 'seek', seconds: -SEEK_STEP } : { type: 'move', dir: 'left' };
    case Btn.Right:
    case STICK_RIGHT:
      return mode === 'player' ? { type: 'seek', seconds: SEEK_STEP } : { type: 'move', dir: 'right' };
    case Btn.A:
      return mode === 'player' ? { type: 'playPause' } : { type: 'select' };
    case Btn.B:
      return { type: 'back' };
    case Btn.X:
      return { type: 'playPause' };
    case Btn.Y:
      return { type: 'search' };
    case Btn.LB:
      return { type: 'seek', seconds: -SEEK_STEP };
    case Btn.RB:
      return { type: 'seek', seconds: SEEK_STEP };
    case Btn.R3:
      return { type: 'settings' };
    default:
      return null;
  }
}

export interface PadSnapshot {
  buttons: readonly boolean[];
  axes: readonly number[];
}

/** Buttons currently held, including stick directions as virtual buttons. */
export function heldButtons(pad: PadSnapshot): Set<number> {
  const held = new Set<number>();
  pad.buttons.forEach((pressed, i) => {
    if (pressed) held.add(i);
  });
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (x <= -AXIS_THRESHOLD) held.add(STICK_LEFT);
  if (x >= AXIS_THRESHOLD) held.add(STICK_RIGHT);
  if (y <= -AXIS_THRESHOLD) held.add(STICK_UP);
  if (y >= AXIS_THRESHOLD) held.add(STICK_DOWN);
  return held;
}

/** Turns successive snapshots into button presses, with key-repeat for directions. */
export class RepeatTracker {
  private readonly nextFire = new Map<number, number>();

  /** Returns the buttons that should fire at time `now` (milliseconds). */
  update(held: ReadonlySet<number>, now: number): number[] {
    const fired: number[] = [];
    for (const b of [...this.nextFire.keys()]) {
      if (!held.has(b)) this.nextFire.delete(b);
    }
    for (const b of held) {
      const due = this.nextFire.get(b);
      if (due === undefined) {
        fired.push(b);
        this.nextFire.set(b, REPEATABLE.has(b) ? now + REPEAT_DELAY_MS : Infinity);
      } else if (now >= due) {
        fired.push(b);
        this.nextFire.set(b, now + REPEAT_INTERVAL_MS);
      }
    }
    return fired;
  }

  reset(): void {
    this.nextFire.clear();
  }
}

// Steam Input presents one virtual pad; when present it is the only one we read,
// otherwise a physical pad and its Steam twin would both fire.
const STEAM_VIRTUAL_PAD = /Vendor: 28de Product: 11ff/i;

export function startPolling(
  view: Window,
  getMode: () => Mode,
  dispatch: (a: Action) => void,
  overrides: Readonly<Record<string, ActionName>> = {},
): () => void {
  const trackers = new Map<number, RepeatTracker>();
  let stopped = false;
  let focused = true;
  const onFocus = (): void => { focused = true; };
  const onBlur = (): void => {
    focused = false;
    trackers.forEach((t) => t.reset());
  };
  view.addEventListener('focus', onFocus);
  view.addEventListener('blur', onBlur);

  // The loop runs only while a pad is connected. Without one there is
  // nothing to read, and a callback every frame for as long as the app is
  // open is work a small TV box should not be doing.
  let running = false;
  const tick = (): void => {
    if (stopped) return;
    const pads = [...view.navigator.getGamepads()].filter((p): p is Gamepad => !!p && p.connected);
    if (pads.length === 0) {
      running = false;
      trackers.clear();
      return;
    }
    if (focused) {
      const steam = pads.find((p) => STEAM_VIRTUAL_PAD.test(p.id));
      for (const pad of steam ? [steam] : pads) {
        let tracker = trackers.get(pad.index);
        if (!tracker) {
          tracker = new RepeatTracker();
          trackers.set(pad.index, tracker);
        }
        const held = heldButtons({ buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes });
        for (const b of tracker.update(held, view.performance.now())) {
          const action = buttonToAction(b, getMode(), overrides);
          if (action) dispatch(action);
        }
      }
    }
    view.requestAnimationFrame(tick);
  };
  const start = (): void => {
    if (running || stopped) return;
    running = true;
    view.requestAnimationFrame(tick);
  };
  // The browser announces a pad when one of its buttons is first pressed.
  view.addEventListener('gamepadconnected', start);
  // One may already be known to this page (the layer starts again on every page).
  start();

  return () => {
    stopped = true;
    view.removeEventListener('gamepadconnected', start);
    view.removeEventListener('focus', onFocus);
    view.removeEventListener('blur', onBlur);
  };
}
