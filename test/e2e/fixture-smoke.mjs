// End-to-end smoke test with no extra dependencies: launches the real app
// against a local fixture page and drives it over the Chrome DevTools Protocol.
// Run with `npm run e2e` (needs a display; use `xvfb-run -a npm run e2e` headless).
//
// This is also the template for driving the app against the live site from a
// machine that has a signed-in profile: same harness, different start URL.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    '--zoom=1',
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
  ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, '/': 191, Escape: 27,
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
  // The layer's own elements are in a closed shadow root; DevTools can still read them.
  const ringClass = async () => {
    const { root: tree } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const walk = (n) => {
      const i = n.attributes?.indexOf('class') ?? -1;
      if (i >= 0 && /\bring\b/.test(n.attributes[i + 1])) return n.attributes[i + 1];
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    return walk(tree);
  };
  check('and the ring bumps toward the edge as feedback', await ringClass(), 'ring bump-right');
  await press('ArrowDown');
  check('down moves to the next row', await focused(), 'u2');
  await press('Enter');
  check('select clicks the focused card', await evaluate('window.__clicks'), ['u2']);
  check('and the ring gives a press pulse', await ringClass(), 'ring pulse');

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

  // On-screen keyboard: the search key focuses the field and a remote can type into it.
  await press('/');
  await sleep(300);
  check('search key focuses the search field', await evaluate('document.activeElement?.id'), 'search');
  await press('Enter'); // "a"
  await press('ArrowRight');
  await press('ArrowDown');
  await press('Enter'); // "l", under "b"
  await sleep(300);
  check('the on-screen keyboard types into the field', await evaluate('document.getElementById("search").value'), 'al');
  for (let i = 0; i < 3; i++) await press('ArrowDown'); // bottom row: shift
  await press('ArrowRight');
  await press('ArrowRight');
  await press('Enter'); // "space"
  await press('ArrowRight');
  await press('Enter'); // "delete"
  await press('Enter');
  await sleep(300);
  check('space and delete work', await evaluate('document.getElementById("search").value'), 'a');
  // Capitals and symbols: shift then "a", then the symbols face and "@".
  for (let i = 0; i < 3; i++) await press('ArrowLeft');
  await press('Enter'); // shift
  for (let i = 0; i < 4; i++) await press('ArrowUp');
  await press('Enter'); // "B": shift is two columns wide and up goes from its middle
  for (let i = 0; i < 4; i++) await press('ArrowDown');
  await press('ArrowRight');
  await press('Enter'); // symbols face; highlight is on "abc"
  for (let i = 0; i < 3; i++) await press('ArrowUp');
  await press('Enter'); // "@", second key of the second row
  await sleep(300);
  check('capitals and symbols can be typed', await evaluate('document.getElementById("search").value'), 'aB@');
  await press('Escape');
  await press('Escape');
  check('back closes the keyboard and then leaves the field', await evaluate('document.activeElement?.id ?? ""'), '');

  // A field the page focuses by itself (as a sign-in page does) gets the keyboard without a key press.
  await evaluate('document.getElementById("search").value = ""; document.getElementById("search").focus()');
  await sleep(200);
  check('a field the page focused becomes the remote focus', await focused(), 'search');
  await press('Enter'); // "a", on the keyboard that opened by itself
  await sleep(300);
  check('the keyboard is already open on it', await evaluate('document.getElementById("search").value'), 'a');
  await evaluate('document.getElementById("search").value = ""');
  await press('Escape');
  await press('Escape');

  // A pop-up the page opens takes the focus, keeps it, and gives it back.
  for (let i = 0; i < 8 && (await focused()) !== 'info'; i++) await press('ArrowDown');
  check('the pop-up button can be reached', await focused(), 'info');
  await press('Enter');
  await sleep(1200);
  check('focus moves into the pop-up', ['dlg-close', 'dlg-ok'].includes(await focused()), true);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await press(key);
  check('and cannot leave it for the page behind', ['dlg-close', 'dlg-ok'].includes(await focused()), true);
  await press('Escape');
  await sleep(900);
  check('Back closes the pop-up and focus returns to its button', [await evaluate('!!document.getElementById("dialog")'), await focused()], [false, 'info']);

  // A refused navigation must be visible: the page stays, a toast appears, the terminal says why.
  const toastText = async () => {
    const { root: tree } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const walk = (n) => {
      const cls = n.attributes?.[n.attributes.indexOf('class') + 1] ?? '';
      if (n.attributes?.includes('class') && /\btoast\b/.test(cls) && /\bshow\b/.test(cls)) {
        return (n.children ?? []).map((c) => c.nodeValue ?? '').join('');
      }
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
        const hit = walk(c);
        if (hit !== null) return hit;
      }
      return null;
    };
    return walk(tree);
  };
  await evaluate('location.href = "https://example.com/elsewhere?token=SECRET"; 0');
  await sleep(500);
  check('a link to another site does not load', await evaluate('location.protocol'), 'file:');
  check('a blocked navigation shows a toast', await toastText(), 'Blocked: that link goes to another site');
  check('a blocked navigation is logged without its query', [/blocked navigation \(other-site\): example\.com\/elsewhere\n/.test(appLog), appLog.includes('SECRET')], [true, false]);

  // Quit is handled by the main process, so it must work whatever the page is doing.
  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
  const q = { key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81, modifiers: 2 };
  // Not awaited: the app can exit before it answers, and then the reply never comes.
  void cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...q }).catch(() => undefined);
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

// Second launch: the start page itself redirects somewhere automation refuses,
// as the live site does for a signed-out visitor. The window must explain
// itself instead of staying blank.
{
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(302, { location: '/offers/landing?token=SECRET' }).end();
    } else {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>should never load</title>');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port2 = port + 1;
  const userData2 = mkdtempSync(join(tmpdir(), 'tropic-video-e2e-'));
  let log2 = '';
  const child2 = spawn(
    electronPath,
    [
      root,
      '--dev',
      '--automation',
      '--zoom=1',
    '--zoom=1',
      `--url=http://127.0.0.1:${server.address().port}/`,
      `--remote-debugging-port=${port2}`,
      `--user-data-dir=${userData2}`,
      '--no-sandbox',
      '--disable-gpu',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child2.stdout.on('data', (d) => (log2 += d));
  child2.stderr.on('data', (d) => (log2 += d));
  try {
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port2}/json/list`)).json();
        page = targets.find((t) => t.type === 'page' && t.url.startsWith('data:'));
      } catch {
        // not listening yet
      }
      if (!page) await sleep(200);
    }
    check('a blocked start page is replaced by a notice page', !!page, true);
    if (page) {
      const cdp = await connect(page.webSocketDebuggerUrl);
      // The target can be listed before the page has rendered; wait for its text.
      let text = '';
      // The window opens on a "Starting" notice; wait for the one under test.
      for (let i = 0; i < 100 && (!text || text.startsWith('Starting')); i++) {
        try {
          const r = await cdp.send('Runtime.evaluate', { expression: 'document.body?.innerText ?? ""', returnByValue: true });
          text = typeof r.result.value === 'string' ? r.result.value : '';
        } catch {
          // The notice page is still being put in place; ask again.
        }
        if (!text || text.startsWith('Starting')) await sleep(100);
      }
      check(
        'the notice names the blocked address, the cause and the way out, and no query',
        [text.includes('/offers/landing'), text.includes('--automation'), text.includes('Ctrl+Q'), text.includes('SECRET')],
        [true, true, true, false],
      );
      cdp.close();
    }
    check('the blocked start page is logged', /blocked navigation \(automation-spend\): 127\.0\.0\.1:\d+\/offers\/landing\n/.test(log2), true);
    if (failures) appLog += `\n--- second launch ---\n${log2}`;
  } catch (err) {
    failures += 1;
    console.error(String(err));
  } finally {
    child2.kill();
    server.close();
    await sleep(300);
    rmSync(userData2, { recursive: true, force: true });
  }
}

// Third launch: a made-up player. Player control must reach the page as real
// key presses, exactly once each, and the page's own controls must be usable.
{
  const playerFixture = pathToFileURL(join(root, 'test/fixtures/player.html')).href;
  const port3 = port + 2;
  const userData3 = mkdtempSync(join(tmpdir(), 'tropic-video-e2e-'));
  // A user config file: one remapped key, one mistake that must be reported and ignored.
  writeFileSync(join(userData3, 'config.json'), JSON.stringify({ keys: { F2: 'playPause', F3: 'explode' } }));
  let log3 = '';
  const child3 = spawn(
    electronPath,
    [root, '--dev', '--automation', '--zoom=1', `--url=${playerFixture}`, `--remote-debugging-port=${port3}`, `--user-data-dir=${userData3}`, '--no-sandbox', '--disable-gpu'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child3.stdout.on('data', (d) => (log3 += d));
  child3.stderr.on('data', (d) => (log3 += d));
  const before = failures;
  try {
    let page;
    for (let i = 0; i < 100 && !page; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port3}/json/list`)).json();
        page = targets.find((t) => t.type === 'page' && t.url.startsWith('file:'));
      } catch {
        // not listening yet
      }
      if (!page) await sleep(200);
    }
    const cdp = await connect(page.webSocketDebuggerUrl);
    const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    const VK = { ' ': 32, Enter: 13, ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Escape: 27, F2: 113 };
    const press = async (key, wait = 400) => {
      const base = { key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] };
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(wait);
    };
    const focusId = () => evaluate('document.querySelector("[data-tropic-focus]")?.id ?? null');
    await sleep(1500);
    check('the fixture player is playing', await evaluate('!document.getElementById("v").paused && document.getElementById("v").currentTime > 0'), true);

    await press(' ');
    check('a physical Space reaches the player once and pauses', await evaluate('[__p.space, document.getElementById("v").paused]'), [1, true]);
    await press('Enter');
    check('Enter becomes one Space key press and resumes', await evaluate('[__p.space, document.getElementById("v").paused]'), [2, false]);
    await press('F2');
    await press('F2');
    check('a key remapped in config.json works, and a bad entry is reported', [await evaluate('__p.space'), /config\.json: key "F3": unknown action/.test(log3)], [4, true]);
    await press('ArrowRight');
    await press('ArrowLeft');
    check('seek keys reach the player once each', await evaluate('[__p.left, __p.right]'), [1, 1]);
    check('the layer did not move the picture itself', await evaluate('document.querySelector("[data-tropic-focus]") === null'), true);

    await press('ArrowDown', 900);
    check('down reveals the player controls and focuses one', [await focusId(), (await evaluate('__p.moves')) > 0, await evaluate('document.hasFocus()')], ['pp', true, true]);
    await sleep(3000);
    check('the controls stay up while one has focus', await focusId(), 'pp');
    await press('ArrowRight');
    check('arrows move between controls instead of seeking', [await focusId(), await evaluate('__p.right')], ['more', 1]);
    await press('Enter', 900);
    await press('ArrowUp');
    check('a styled option in the opened menu takes focus', ['optA', 'optB'].includes(await focusId()), true);
    await press('Enter');
    check('and can be chosen', ['A', 'B'].includes(await evaluate('__p.option')), true);
    check('the page behind the player was never focused', await evaluate('document.activeElement?.id !== "behind"'), true);

    await press('Escape');
    check('first Back returns to the picture', [await focusId(), await evaluate('__p.closed')], [null, 0]);
    await press('Escape', 600);
    check('second Back closes the open menu', await evaluate('[__p.escape, __p.closed]'), [1, 0]);
    await press('Escape', 600);
    check('third Back closes the player and stays on the page', await evaluate('[__p.closed, location.pathname.endsWith("player.html")]'), [1, true]);
    cdp.close();
  } catch (err) {
    failures += 1;
    console.error(String(err));
  } finally {
    if (failures > before) appLog += `\n--- player launch ---\n${log3}`;
    child3.kill();
    await sleep(300);
    rmSync(userData3, { recursive: true, force: true });
  }
}

// Fourth launch: the service cannot be reached at first. The window must say
// so, keep trying, and load the page once it is there.
{
  // Find a free port, then leave it closed for now.
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const sitePort = probe.address().port;
  await new Promise((r) => probe.close(r));
  const port4 = port + 3;
  const userData4 = mkdtempSync(join(tmpdir(), 'tropic-video-e2e-'));
  let log4 = '';
  const child4 = spawn(
    electronPath,
    [root, '--dev', '--automation', '--zoom=1', `--url=http://127.0.0.1:${sitePort}/`, `--remote-debugging-port=${port4}`, `--user-data-dir=${userData4}`, '--no-sandbox', '--disable-gpu'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child4.stdout.on('data', (d) => (log4 += d));
  child4.stderr.on('data', (d) => (log4 += d));
  const before = failures;
  let site;
  try {
    const pageWhere = async (test) => {
      for (let i = 0; i < 100; i++) {
        try {
          const targets = await (await fetch(`http://127.0.0.1:${port4}/json/list`)).json();
          const hit = targets.find((t) => t.type === 'page' && test(t.url));
          if (hit) return hit;
        } catch {
          // not listening yet
        }
        await sleep(200);
      }
      return null;
    };
    const notice = await pageWhere((url) => url.startsWith('data:'));
    check('an unreachable start page is replaced by a notice', !!notice, true);
    if (notice) {
      const cdp = await connect(notice.webSocketDebuggerUrl);
      let text = '';
      // The window opens on a "Starting" notice; wait for the one under test.
      for (let i = 0; i < 100 && (!text || text.startsWith('Starting')); i++) {
        try {
          const r = await cdp.send('Runtime.evaluate', { expression: 'document.body?.innerText ?? ""', returnByValue: true });
          text = typeof r.result.value === 'string' ? r.result.value : '';
        } catch {
          // The notice page is still being put in place; ask again.
        }
        if (!text || text.startsWith('Starting')) await sleep(100);
      }
      check('the notice says the service cannot be reached and that it will retry', [text.includes('Cannot reach'), /Trying again in \d+ seconds/.test(text)], [true, true]);
      cdp.close();
    }
    site = createServer((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>back</title><p id="up">up</p>'));
    await new Promise((r) => site.listen(sitePort, '127.0.0.1', r));
    const loaded = await pageWhere((url) => url.startsWith(`http://127.0.0.1:${sitePort}`));
    check('the page loads by itself once the service is reachable', !!loaded, true);
  } catch (err) {
    failures += 1;
    console.error(String(err));
  } finally {
    if (failures > before) appLog += `\n--- unreachable launch ---\n${log4}`;
    child4.kill();
    site?.close();
    await sleep(300);
    rmSync(userData4, { recursive: true, force: true });
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed\n--- app log ---\n${appLog}`);
  process.exit(1);
}
console.log('\nall end-to-end checks passed');
