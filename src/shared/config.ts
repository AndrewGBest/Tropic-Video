// The user's config file: <user data>/config.json. Everything in it is
// optional, and anything invalid is dropped with a note rather than stopping
// the app. Pure, so the rules are unit-tested.
//
//   {
//     "zoom": 2,
//     "hardwareDecode": true,
//     "keys": { "F1": "search", "ContextMenu": "about", "MediaStop": "back", "Ctrl+h": "none" },
//     "buttons": { "8": "about", "9": "playPause" }
//   }
//
// A key is a KeyboardEvent.key value (what a remote sends: "MediaStop",
// "F5", "ContextMenu"...), optionally with "Ctrl+" in front. A mapping here
// wins over the built-in one for that key.
import type { Action } from './actions';

export const ACTION_NAMES = [
  'up', 'down', 'left', 'right', 'select', 'back', 'playPause',
  'seekBack', 'seekForward', 'search', 'about', 'quit', 'none',
] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

export interface UserConfig {
  /** TV scale override; the --zoom option still wins. */
  zoom?: number;
  /** Ask the browser to decode video on the graphics chip. Off unless set; see the README. */
  hardwareDecode?: boolean;
  /** Key (as written by the user, "Ctrl+" normalised) to action. */
  keys: Record<string, ActionName>;
  /** Gamepad button number (standard mapping, 0 to 16) to action. */
  buttons?: Record<string, ActionName>;
}

const MAX_KEYS = 200;

/** "ctrl + H" -> "Ctrl+h"; plain keys keep their case, since "a" and "A" differ. */
export function normaliseKey(spec: string): string | null {
  const parts = spec.split('+').map((p) => p.trim());
  const key = parts.pop() ?? '';
  if (!key || key.length > 40) return null;
  if (parts.length === 0) return key === 'Space' ? ' ' : key;
  if (parts.length === 1 && parts[0]!.toLowerCase() === 'ctrl') return `Ctrl+${key.length === 1 ? key.toLowerCase() : key}`;
  return null; // only Ctrl is supported as a modifier
}

/** Validates untrusted config data. Returns what could be used and a note for each thing that could not. */
export function parseConfig(raw: unknown): { config: UserConfig; problems: string[] } {
  const config: UserConfig = { keys: {} };
  const problems: string[] = [];
  if (raw === undefined || raw === null) return { config, problems };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { config, problems: ['the file must contain a JSON object'] };
  const r = raw as Record<string, unknown>;

  if (r['zoom'] !== undefined) {
    if (typeof r['zoom'] === 'number' && Number.isFinite(r['zoom']) && r['zoom'] > 0) config.zoom = r['zoom'];
    else problems.push('"zoom" must be a positive number');
  }

  if (r['hardwareDecode'] !== undefined) {
    if (typeof r['hardwareDecode'] === 'boolean') config.hardwareDecode = r['hardwareDecode'];
    else problems.push('"hardwareDecode" must be true or false');
  }

  if (r['keys'] !== undefined) {
    if (typeof r['keys'] !== 'object' || r['keys'] === null || Array.isArray(r['keys'])) {
      problems.push('"keys" must be an object of key: action');
    } else {
      for (const [spec, action] of Object.entries(r['keys']).slice(0, MAX_KEYS)) {
        const key = normaliseKey(spec);
        if (!key) problems.push(`key "${spec.slice(0, 40)}" is not understood (use a key name, optionally with Ctrl+)`);
        else if (typeof action !== 'string' || !(ACTION_NAMES as readonly string[]).includes(action)) {
          problems.push(`key "${spec.slice(0, 40)}": unknown action (use one of ${ACTION_NAMES.join(', ')})`);
        } else config.keys[key] = action as ActionName;
      }
    }
  }
  if (r['buttons'] !== undefined) {
    if (typeof r['buttons'] !== 'object' || r['buttons'] === null || Array.isArray(r['buttons'])) {
      problems.push('"buttons" must be an object of button number: action');
    } else {
      const buttons: Record<string, ActionName> = {};
      for (const [spec, action] of Object.entries(r['buttons']).slice(0, MAX_KEYS)) {
        const n = Number(spec);
        if (!/^\d{1,2}$/.test(spec) || n > 31) problems.push(`button "${spec.slice(0, 40)}" must be a number from 0 to 31`);
        else if (typeof action !== 'string' || !(ACTION_NAMES as readonly string[]).includes(action)) {
          problems.push(`button ${n}: unknown action (use one of ${ACTION_NAMES.join(', ')})`);
        } else buttons[String(n)] = action as ActionName;
      }
      config.buttons = buttons;
    }
  }
  for (const name of Object.keys(r)) {
    if (name !== 'zoom' && name !== 'keys' && name !== 'buttons' && name !== 'hardwareDecode') problems.push(`unknown setting "${name.slice(0, 40)}"`);
  }
  return { config, problems };
}

const SEEK_STEP = 10;

/** The action a configured name stands for; `null` for "none" (the key does nothing in the layer). */
export function actionFor(name: ActionName): Action | null {
  switch (name) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return { type: 'move', dir: name };
    case 'select':
      return { type: 'select' };
    case 'back':
      return { type: 'back' };
    case 'playPause':
      return { type: 'playPause' };
    case 'seekBack':
      return { type: 'seek', seconds: -SEEK_STEP };
    case 'seekForward':
      return { type: 'seek', seconds: SEEK_STEP };
    case 'search':
      return { type: 'search' };
    case 'about':
      return { type: 'settings' };
    case 'quit':
      return { type: 'exit' };
    case 'none':
      return null;
  }
}
