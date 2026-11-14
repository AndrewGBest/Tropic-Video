// Main process: one window, one site, a short list of privileges.
import { app, BrowserWindow, ipcMain, powerSaveBlocker, session } from 'electron';
import * as electron from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BridgeMessage, LayerOptions, SpikeEvent } from '../shared/actions';
import { looksLikeSpendUrl } from '../layer/guard/purchase-guard';
import { browserUserAgent, isAllowedUrl } from './hosts';

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
  const boot = encodeURIComponent(JSON.stringify({ options, adapter: loadAdapter() }));
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
  wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (isMainFrame) console.error(`[tropic-video] page failed to load (${code} ${description}): ${url}`);
  });
  wc.on('render-process-gone', (_e, details) => {
    console.error(`[tropic-video] renderer exited: ${details.reason}`);
  });
  const allowed = (url: string): boolean => {
    if (!isAllowedUrl(url, { dev: options.dev })) return false;
    // Automation must never reach a payment or sign-up flow, even by URL.
    if (options.automation && looksLikeSpendUrl(url)) return false;
    return true;
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

  const tvCss = readFileSync(join(__dirname, 'tv.css'), 'utf8');
  wc.on('dom-ready', () => {
    void wc.insertCSS(tvCss, { cssOrigin: 'user' });
  });

  void wc.loadURL(startUrl());
  return win;
}

function wireMessages(): void {
  let blocker: number | undefined;
  ipcMain.on('tropic:msg', (event, msg: BridgeMessage) => {
    // Only the top frame of our own window may talk to the shell.
    if (event.senderFrame !== event.sender.mainFrame) return;
    switch (msg.kind) {
      case 'exit':
        app.quit();
        break;
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
