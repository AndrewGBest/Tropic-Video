// Keyboard and remote mapping. IR and Flirc-style remotes arrive as keyboards,
// and HDMI-CEC is translated to key events by an external helper, so this one
// table covers all three.
import type { Action } from '../../shared/actions';
import { actionFor, type ActionName } from '../../shared/config';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export type Mode = 'browse' | 'player' | 'text';

const SEEK_STEP = 10;

/**
 * `overrides` are the user's own mappings from the config file; they win over
 * the built-in table. While typing in a text field only non-character keys
 * can be remapped, so a mapping never eats a letter. An override of "none"
 * hands the key to the page untouched.
 */
export function keyToAction(e: KeyLike, mode: Mode, overrides: Readonly<Record<string, ActionName>> = {}): Action | null {
  if (e.altKey || e.metaKey) return null;

  const spec = e.ctrlKey ? `Ctrl+${e.key.length === 1 ? e.key.toLowerCase() : e.key}` : e.key;
  if (Object.hasOwn(overrides, spec) && !(mode === 'text' && !e.ctrlKey && e.key.length === 1)) {
    return actionFor(overrides[spec]!);
  }

  if (e.ctrlKey) {
    switch (e.key.toLowerCase()) {
      case 'q':
        return { type: 'exit' };
      case 'o':
        return { type: 'settings' };
      case 'd':
        return e.shiftKey ? { type: 'diagnostics' } : null;
      default:
        return null;
    }
  }

  // While typing, only navigation-away keys are ours; letters belong to the field.
  if (mode === 'text') {
    switch (e.key) {
      case 'Escape':
      case 'BrowserBack':
        return { type: 'back' };
      case 'ArrowUp':
        return { type: 'move', dir: 'up' };
      case 'ArrowDown':
        return { type: 'move', dir: 'down' };
      default:
        return null;
    }
  }

  switch (e.key) {
    case 'ArrowUp':
      return { type: 'move', dir: 'up' };
    case 'ArrowDown':
      return { type: 'move', dir: 'down' };
    case 'ArrowLeft':
      return mode === 'player' ? { type: 'seek', seconds: -SEEK_STEP } : { type: 'move', dir: 'left' };
    case 'ArrowRight':
      return mode === 'player' ? { type: 'seek', seconds: SEEK_STEP } : { type: 'move', dir: 'right' };
    // A remote's OK button. Remotes differ in what it sends: Enter on most,
    // Space on some, and a few send the dedicated Select or Accept key. All of
    // them select while browsing and play or pause on the picture.
    case 'Enter':
    case ' ':
    case 'Select':
    case 'Accept':
      return mode === 'player' ? { type: 'playPause' } : { type: 'select' };
    case 'MediaPlayPause':
    case 'MediaPlay':
    case 'MediaPause':
      return { type: 'playPause' };
    case 'MediaFastForward':
      return { type: 'seek', seconds: SEEK_STEP };
    case 'MediaRewind':
      return { type: 'seek', seconds: -SEEK_STEP };
    case 'Backspace':
    case 'Escape':
    case 'BrowserBack':
    case 'GoBack':
    case 'MediaStop':
      return { type: 'back' };
    case '/':
    case 'BrowserSearch':
      return { type: 'search' };
    // Menu, info and help buttons on remotes and media keyboards.
    case 'ContextMenu':
    case 'Info':
    case 'Help':
      return { type: 'settings' };
    default:
      return null;
  }
}
