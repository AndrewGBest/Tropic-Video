// End-to-end smoke test with no extra dependencies: launches the real app
// against a local fixture page and drives it over the Chrome DevTools Protocol.
// Run with `npm run e2e` (needs a display; use `xvfb-run -a npm run e2e` headless).
//
// This is also the template for driving the app against the live site from a
// machine that has a signed-in profile: same harness, different start URL.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const electronPath = createRequire(import.meta.url)('electron');
const port = 9300 + Math.floor(Math.random() * 500);
const fixture = pathToFileURL(join(root, 'test/fixtures/home.html')).href;
const userData = mkdtempSync(join(tmpdir(), 'tropic-video-e2e-'));

const child = spawn(
  electronPath,
  [
    root,
    '--dev',
    '--automation',
    `--url=${fixture}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    '--no-sandbox',
    '--disable-gpu',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let appLog = '';
child.stdout.on('data', (d) => (appLog += d));
child.stderr.on('data', (d) => (appLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file:'));
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not listening yet
    }
    await sleep(200);
  }
  throw new Error(`app did not expose a page.\n${appLog}`);
}

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : ok(msg.result);
      }
    };
    ws.onerror = () => rej(new Error('CDP socket error'));
    ws.onopen = () =>
      res({
        send: (method, params = {}) =>
          new Promise((resolve2, reject) => {
            pending.set(++id, { resolve: resolve2, reject });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        close: () => ws.close(),
      });
  });
}

const KEYS = {
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13,
};

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`}`);
}

try {
  const cdp = await connect(await findPage());
  const evaluate = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const press = async (key) => {
    const base = { key, code: key, windowsVirtualKeyCode: KEYS[key], nativeVirtualKeyCode: KEYS[key] };
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(150);
  };
  const focused = () => evaluate('document.querySelector("[data-tropic-focus]")?.id ?? null');

  await sleep(800);
  check('layer overlay is present', await evaluate('!!document.querySelector("tropic-overlay")'), true);
  check('page cannot see any app API', await evaluate('typeof window.require + typeof window.tropicVideo + typeof window.electron'), 'undefinedundefinedundefined');

  await press('ArrowDown');
  check('first press focuses the top-left control', await focused(), 'nav-home');
  await press('ArrowDown');
  check('down enters the first row', await focused(), 't1');
  await press('ArrowRight');
  await press('ArrowRight');
  check('right walks the row', await focused(), 't3');
  await press('ArrowRight');
  check('right at the end of a row stays put', await focused(), 't3');
  await press('ArrowDown');
  check('down moves to the next row', await focused(), 'u2');
  await press('Enter');
  check('select clicks the focused card', await evaluate('window.__clicks'), ['u2']);

  await press('ArrowDown');
  check('down reaches the nearest button', await focused(), 'rent');
  await press('Enter');
  check('rent is never delivered in automation mode', await evaluate('window.__clicks'), ['u2']);
  await press('ArrowLeft');
  check('left moves along the button row', await focused(), 'play');
  await press('Enter');
  check('play is delivered', await evaluate('window.__clicks'), ['u2', 'play']);
  await press('ArrowRight');
  await press('ArrowRight');
  check('right never jumps diagonally out of a row', await focused(), 'rent');

  const ua = await evaluate('navigator.userAgent');
  check('user agent hides nothing but the app tokens', /Electron|tropic-video/i.test(ua) === false && /Linux/.test(ua) && /Chrome\//.test(ua), true);

  // Quit is handled by the main process, so it must work whatever the page is doing.
  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
  const q = { key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81, modifiers: 2 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...q }).catch(() => undefined);
  check('Ctrl+Q quits the app', await Promise.race([exited, sleep(4000).then(() => false)]), true);

  cdp.close();
} catch (err) {
  failures += 1;
  console.error(String(err));
} finally {
  child.kill();
  await sleep(300);
  rmSync(userData, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} check(s) failed\n--- app log ---\n${appLog}`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
