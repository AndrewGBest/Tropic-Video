// Main process: one window, one site, a short list of privileges.
import { app, BrowserWindow, ipcMain, powerSaveBlocker, session } from 'electron';
import * as electron from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BridgeMessage, LayerOptions, SpikeEvent } from '../shared/actions';
import { parseConfig, type UserConfig } from '../shared/config';
import { typableText } from '../shared/osk';
import { playerKeyInfo } from '../shared/player-keys';
import { browserUserAgent, isAllowedUrl } from './hosts';
import { hoverPoint, tvZoom } from './zoom';
import {
  blockReason,
  blockedMessage,
  describeBlockedUrl,
  isLoadFailure,
  noticePageUrl,
  offlinePageUrl,
  retryDelaySeconds,
} from './navigation';

const HOME_URL = 'https://www.primevideo.com/';
const argv = process.argv.slice(1);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const value = (name: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const options: LayerOptions = {
  dev: flag('dev'),
  automation: flag('automation'),
  spike: flag('spike'),
};

// castLabs builds add `components` (the Widevine component updater). Stock
// Electron lacks it, and then protected playback cannot work.
interface Components {
  whenReady(): Promise<unknown>;
  status(): unknown;
}
const components = (electron as unknown as { components?: Components }).components;

interface SpikeReport {
  startedAt: string;
  versions: NodeJS.ProcessVersions;
  userAgent: string;
  widevineComponent: unknown;
  events: Array<SpikeEvent & { at: string; url: string }>;
}
let spikeReport: SpikeReport | undefined;

function saveSpikeReport(): void {
  if (!spikeReport) return;
  const file = join(app.getPath('userData'), 'spike-report.json');
  writeFileSync(file, JSON.stringify(spikeReport, null, 2));
}

/** Reads <user data>/config.json. A missing file is normal; a broken one is reported and ignored. */
function loadConfig(): UserConfig {
  const file = join(app.getPath('userData'), 'config.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[tropic-video] config.json could not be read: ${String(err).slice(0, 200)}`);
    return { keys: {} };
  }
  const { config, problems } = parseConfig(raw);
  for (const problem of problems) console.error(`[tropic-video] config.json: ${problem}`);
  return config;
}
let userConfig: UserConfig = { keys: {} };

function loadAdapter(): unknown {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'adapters', 'primevideo.json'), 'utf8'));
  } catch {
    return null;
  }
}

function startUrl(): string {
  const override = value('url');
  if (override && options.dev && isAllowedUrl(override, { dev: true })) return override;
  return HOME_URL;
}

function createWindow(): BrowserWindow {
  const boot = encodeURIComponent(
    JSON.stringify({ options: { ...options, version: app.getVersion(), keys: userConfig.keys, buttons: userConfig.buttons ?? {} }, adapter: loadAdapter() }),
  );
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    // The spike is a diagnostic run: keep it windowed so the desktop stays reachable.
    fullscreen: flag('fullscreen') || (!options.dev && !options.spike),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'Tropic Video',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: [`--tropic-boot=${boot}`],
    },
  });
  win.removeMenu();

  const wc = win.webContents;

  // Quit must work even when the page never loads and the layer is not
  // running, otherwise a fullscreen window with a blank page traps the user.
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && !input.alt && !input.meta && input.key.toLowerCase() === 'q') {
      event.preventDefault();
      app.quit();
    }
  });
  // A page that cannot be reached (no network, service down): say so and keep
  // trying, instead of leaving a blank window.
  let retryTimer: NodeJS.Timeout | undefined;
  let retryAttempt = 0;
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || !isLoadFailure(code, url)) return;
    console.error(`[tropic-video] page failed to load (${code} ${description}): ${describeBlockedUrl(url)}`);
    if (blockReason(url, options)) return;
    retryAttempt += 1;
    const wait = retryDelaySeconds(retryAttempt);
    clearTimeout(retryTimer);
    void wc.loadURL(offlinePageUrl(description, wait));
    retryTimer = setTimeout(() => {
      if (!wc.isDestroyed()) void wc.loadURL(url);
    }, wait * 1000);
  });
  wc.on('did-navigate', (_e, url) => {
    if (!url.startsWith('data:') && url !== 'about:blank') retryAttempt = 0;
  });
  wc.on('render-process-gone', (_e, details) => {
    console.error(`[tropic-video] renderer exited: ${details.reason}`);
  });

  // True once a real page has been shown. Until then a refused navigation
  // would leave the window blank, so a notice page is loaded instead.
  let pageShown = false;
  wc.on('did-navigate', (_e, url) => {
    if (!url.startsWith('data:') && url !== 'about:blank') pageShown = true;
  });

  /** Returns true when `url` may load. A refusal is always logged and shown, never silent. */
  const allowed = (url: string): boolean => {
    const reason = blockReason(url, options);
    if (!reason) return true;
    console.error(`[tropic-video] blocked navigation (${reason}): ${describeBlockedUrl(url)}`);
    if (pageShown) {
      wc.send('tropic:notice', blockedMessage(reason));
    } else {
      // Deferred so the refused navigation is fully cancelled first.
      setImmediate(() => {
        if (!wc.isDestroyed() && !pageShown) void wc.loadURL(noticePageUrl(reason, url));
      });
    }
    return false;
  };

  wc.on('will-navigate', (e, url) => {
    if (!allowed(url)) e.preventDefault();
  });
  wc.on('will-redirect', (e, url) => {
    if (!allowed(url)) e.preventDefault();
  });
  // No pop-ups: an allowed link opens in the one window, anything else is dropped.
  wc.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) void wc.loadURL(url);
    return { action: 'deny' };
  });

  // TV scaling: ordinary page zoom, chosen from the window's height (see zoom.ts).
  const applyZoom = (): void => {
    if (win.isDestroyed()) return;
    const [width = 0, height = 0] = win.getContentSize();
    const zoom = tvZoom({ width, height }, value('zoom') ?? (userConfig.zoom === undefined ? undefined : String(userConfig.zoom)));
    if (Math.abs(wc.getZoomFactor() - zoom) > 0.001) wc.setZoomFactor(zoom);
  };
  wc.on('did-navigate', applyZoom);
  win.on('resize', applyZoom);
  win.on('enter-full-screen', applyZoom);
  win.on('leave-full-screen', applyZoom);

  const tvCss = readFileSync(join(__dirname, 'tv.css'), 'utf8');
  wc.on('dom-ready', () => {
    void wc.insertCSS(tvCss, { cssOrigin: 'user' });
  });

  void wc.loadURL(startUrl());
  return win;
}

function wireMessages(): void {
  let blocker: number | undefined;
  let nudge = false;
  ipcMain.on('tropic:msg', (event, msg: BridgeMessage) => {
    // Only the top frame of our own window may talk to the shell.
    if (event.senderFrame !== event.sender.mainFrame) return;
    switch (msg.kind) {
      case 'exit':
        app.quit();
        break;
      case 'playerKey': {
        // An ordinary key press, delivered to the page like one from a keyboard.
        const info = playerKeyInfo(msg.key);
        if (info) {
          event.sender.sendInputEvent({ type: 'keyDown', keyCode: info.code });
          if (info.char) event.sender.sendInputEvent({ type: 'char', keyCode: info.char });
          event.sender.sendInputEvent({ type: 'keyUp', keyCode: info.code });
        }
        break;
      }
      case 'typeText': {
        const text = typableText(msg.text);
        if (text) void event.sender.insertText(text);
        break;
      }
      case 'revealControls': {
        // An ordinary pointer movement across the middle of the picture. One
        // step is not enough on the live site, and steps sent together are
        // merged into one, so it is a short sweep spread over time, in
        // alternating directions so every call is a real movement.
        const size = BrowserWindow.fromWebContents(event.sender)?.getContentSize();
        if (size) {
          nudge = !nudge;
          const [w = 0, h = 0] = size;
          const steps = nudge ? [0, 20, 40, 60] : [60, 40, 20, 0];
          const wc = event.sender;
          steps.forEach((dx, i) => {
            setTimeout(() => {
              if (wc.isDestroyed()) return;
              const x = Math.round(w / 2) + dx;
              const y = Math.round(h / 2);
              // A real pointer reports how far it moved; some players ignore a move that reports zero.
              wc.sendInputEvent({ type: 'mouseMove', x, y, globalX: x, globalY: y, movementX: nudge ? 20 : -20, movementY: 0 });
            }, i * 40);
          });
        }
        break;
      }
      case 'hover': {
        // An ordinary pointer movement to a point the layer names. Page
        // coordinates are CSS pixels; input events are in window pixels.
        const size = BrowserWindow.fromWebContents(event.sender)?.getContentSize();
        const point = hoverPoint(msg, event.sender.getZoomFactor(), size);
        if (point) {
          const wc = event.sender;
          // Two steps: a single event is not always treated as movement.
          wc.sendInputEvent({ type: 'mouseMove', x: Math.max(0, point.x - 3), y: point.y, movementX: 0, movementY: 0 });
          setTimeout(() => {
            if (!wc.isDestroyed()) wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y, movementX: 3, movementY: 0 });
          }, 40);
        }
        break;
      }
      case 'playback':
        if (msg.playing && blocker === undefined) {
          blocker = powerSaveBlocker.start('prevent-display-sleep');
        } else if (!msg.playing && blocker !== undefined) {
          powerSaveBlocker.stop(blocker);
          blocker = undefined;
        }
        break;
      case 'diagnostics': {
        const dir = join(app.getPath('userData'), 'diagnostics');
        mkdirSync(dir, { recursive: true });
        const name = `outline-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        writeFileSync(join(dir, name), `# ${String(msg.url).slice(0, 300)}\n${String(msg.outline).slice(0, 2_000_000)}\n`);
        break;
      }
      case 'spike':
        if (spikeReport) {
          spikeReport.events.push({ ...msg.event, at: new Date().toISOString(), url: new URL(event.sender.getURL()).pathname.slice(0, 40) });
          saveSpikeReport();
        }
        break;
    }
  });
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();
  app.userAgentFallback = browserUserAgent(app.userAgentFallback);

  let widevine: unknown = 'unavailable: not a castLabs Electron build';
  if (components) {
    try {
      await components.whenReady();
      widevine = components.status();
    } catch (err) {
      widevine = `component error: ${String(err)}`;
    }
  }
  console.log('[tropic-video] widevine component:', JSON.stringify(widevine));

  if (options.spike) {
    spikeReport = {
      startedAt: new Date().toISOString(),
      versions: process.versions,
      userAgent: app.userAgentFallback,
      widevineComponent: widevine,
      events: [],
    };
    saveSpikeReport();
    console.log('[tropic-video] spike report:', join(app.getPath('userData'), 'spike-report.json'));
  }

  // Grant only what playback needs; refuse camera, microphone, location, notifications and the rest.
  const GRANTED = new Set(['fullscreen', 'mediaKeySystem']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(GRANTED.has(permission));
  });

  userConfig = loadConfig();
  wireMessages();
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', saveSpikeReport);
}

void main();
