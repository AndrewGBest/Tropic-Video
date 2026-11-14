// Keyboard and remote mapping. IR and Flirc-style remotes arrive as keyboards,
// and HDMI-CEC is translated to key events by an external helper, so this one
// table covers all three.
import type { Action } from '../../shared/actions';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export type Mode = 'browse' | 'player' | 'text';

const SEEK_STEP = 10;

export function keyToAction(e: KeyLike, mode: Mode): Action | null {
  if (e.altKey || e.metaKey) return null;

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
    case 'Enter':
      return mode === 'player' ? { type: 'playPause' } : { type: 'select' };
    case ' ':
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
      return { type: 'back' };
    case '/':
      return { type: 'search' };
    default:
      return null;
  }
}
