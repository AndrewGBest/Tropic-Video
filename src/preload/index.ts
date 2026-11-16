// Sandboxed preload. The whole TV layer runs here, in the isolated world.
// Nothing is exposed to the page: there is no contextBridge API, so site
// scripts cannot call into the app.
import { ipcRenderer } from 'electron';
import type { BridgeMessage, LayerOptions } from '../shared/actions';
import { parseAdapter } from '../layer/adapter/adapter';
import { startLayer, type Layer } from '../layer/index';

const ARG_PREFIX = '--tropic-boot=';

function readBoot(): { options: LayerOptions; adapter: unknown } {
  const fallback = { options: { dev: false, automation: false, spike: false }, adapter: null };
  const raw = process.argv.find((a) => a.startsWith(ARG_PREFIX));
  if (!raw) return fallback;
  try {
    return JSON.parse(decodeURIComponent(raw.slice(ARG_PREFIX.length))) as { options: LayerOptions; adapter: unknown };
  } catch {
    return fallback;
  }
}

const boot = readBoot();
const send = (msg: BridgeMessage): void => ipcRenderer.send('tropic:msg', msg);

let layer: Layer | undefined;

// From the shell to the layer: a line of text to show. It arrives in
// the isolated world; the page's own scripts never see it.
ipcRenderer.on('tropic:notice', (_event, text: unknown) => {
  if (typeof text === 'string') layer?.notice(text.slice(0, 200));
});

// The window is no longer the one in front.
ipcRenderer.on('tropic:away', () => layer?.away());

const start = (): void => {
  // Only the top frame gets a layer; embedded frames are left alone.
  if (window.top !== window) return;
  layer = startLayer({
    doc: document,
    options: boot.options,
    adapter: parseAdapter(boot.adapter, document),
    send,
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
