// Every input device is reduced to one of these actions before anything else
// sees it. Adding a device means writing a mapper to Action, nothing more.
export type Direction = 'up' | 'down' | 'left' | 'right';

export type Action =
  | { type: 'move'; dir: Direction }
  | { type: 'select' }
  | { type: 'back' }
  | { type: 'playPause' }
  | { type: 'seek'; seconds: number }
  | { type: 'search' }
  | { type: 'settings' }
  | { type: 'diagnostics' }
  | { type: 'exit' };

export type ActionType = Action['type'];

/** Messages the page-side layer may send to the main process. Keep this list short. */
export type BridgeMessage =
  | { kind: 'exit' }
  | { kind: 'playback'; playing: boolean }
  | { kind: 'diagnostics'; outline: string; url: string }
  | { kind: 'spike'; event: SpikeEvent };

export type SpikeEvent =
  | { name: 'eme-access'; ok: boolean; detail: string }
  | { name: 'video'; event: string; width: number; height: number; currentTime: number; protected: boolean }
  | { name: 'video-error'; code: number; message: string };

export interface LayerOptions {
  dev: boolean;
  automation: boolean;
  spike: boolean;
}
