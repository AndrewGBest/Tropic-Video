// Player control is ordinary input. The layer never calls play(), pause() or
// sets currentTime on the site's video element: doing so goes around the
// site's own player, which is what decides whether a seek is allowed (for
// example during an advertisement). Instead the layer asks the shell to press
// a real key, and the site's player handles it like any other key press.
export type PlayerKey = 'playPause' | 'seekBack' | 'seekForward' | 'close';
/** Keys the on-screen keyboard presses besides typing text. */
export type TextKey = 'backspace' | 'enter';

interface KeyInfo {
  /** Electron accelerator-style key code for `webContents.sendInputEvent`. */
  code: string;
  /** The `KeyboardEvent.key` value the page will see. */
  domKey: string;
  /** Character to send between key down and key up, where the browser acts on the character (Enter submitting a form). */
  char?: string;
}

const KEYS: Record<PlayerKey | TextKey, KeyInfo> = {
  playPause: { code: 'Space', domKey: ' ' },
  seekBack: { code: 'Left', domKey: 'ArrowLeft' },
  seekForward: { code: 'Right', domKey: 'ArrowRight' },
  close: { code: 'Escape', domKey: 'Escape' },
  backspace: { code: 'Backspace', domKey: 'Backspace' },
  enter: { code: 'Enter', domKey: 'Enter', char: '\r' },
};

/** The player key an action stands for, if any. */
export function playerKeyFor(action: { type: string; seconds?: number }): PlayerKey | null {
  if (action.type === 'playPause') return 'playPause';
  if (action.type === 'seek') return (action.seconds ?? 0) < 0 ? 'seekBack' : 'seekForward';
  return null;
}

/**
 * True when a physical key press is already the key the site's player expects
 * for this action. Such a press is left alone: handling it and pressing the
 * same key again would deliver it to the site twice.
 */
export function isNativePlayerKey(domKey: string, action: { type: string; seconds?: number }): boolean {
  const key = playerKeyFor(action);
  return key !== null && KEYS[key].domKey === domKey;
}

/** Validates an untrusted value from the page side; anything else yields null. */
export function playerKeyInfo(key: unknown): KeyInfo | null {
  return typeof key === 'string' && Object.hasOwn(KEYS, key) ? KEYS[key as PlayerKey | TextKey] : null;
}

/**
 * Remembers which key presses the layer itself asked for, so that when they
 * arrive as real key events the layer lets them through to the site instead
 * of handling them again. Time is passed in to keep this testable.
 */
export class InjectedKeys {
  private pending: Array<{ domKey: string; until: number }> = [];

  constructor(private readonly windowMs = 1000) {}

  expect(domKey: string, now: number): void {
    this.pending = this.pending.filter((p) => p.until > now);
    this.pending.push({ domKey, until: now + this.windowMs });
  }

  /** True, once, for a key press that was asked for and has not expired. */
  consume(domKey: string, now: number): boolean {
    this.pending = this.pending.filter((p) => p.until > now);
    const i = this.pending.findIndex((p) => p.domKey === domKey);
    if (i < 0) return false;
    this.pending.splice(i, 1);
    return true;
  }
}
