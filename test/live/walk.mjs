// Remote coverage walk for the live site. Presses one key repeatedly in an
// app that is already running, and prints where the focus ring goes after
// each press: structure and position only, never titles or text.
//
// Start the app first, with the purchase guard on (Hard rule 10):
//   npx electron . --dev --automation --remote-debugging-port=9222
// then, for example:
//   node test/live/walk.mjs ArrowDown 20
//   node test/live/walk.mjs ArrowRight 6 --port=9222
//
// Things to look for: NONE (focus was lost), OFFSCREEN (the ring is not
// visible), an early "stopped" (a trap), or a jump in the scroll position
// that skips part of the page. Record what you find in docs/STATUS.md.
const args = process.argv.slice(2);
const key = args[0];
const max = Number(args[1] ?? 20);
const port = Number(args.find((a) => a.startsWith('--port='))?.slice(7) ?? 9222);
const VK = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
if (!(key in VK) || !Number.isFinite(max)) {
  console.error('usage: node test/live/walk.mjs <ArrowUp|ArrowDown|ArrowLeft|ArrowRight> [presses] [--port=9222]');
  process.exit(2);
}

let targets;
try {
  targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
} catch {
  console.error(`No app is listening on port ${port}. Start it with --automation --remote-debugging-port=${port}.`);
  process.exit(2);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  pending.get(d.id)?.(d);
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    pending.set(++id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
await new Promise((resolve) => (ws.onopen = resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs in the page. Reports the focused element's tag, role, test id (with
// anything id-like or personal masked), box and the scroll position.
const probe = `(() => {
  const e = document.querySelector('[data-tropic-focus]');
  if (!e) return 'NONE';
  const r = e.getBoundingClientRect();
  const raw = e.getAttribute('data-testid') || e.getAttribute('data-automation-id') || e.closest('[data-testid]')?.getAttribute('data-testid') || '';
  const name = raw.replace(/profile.*/i, 'profile-*').replace(/[0-9A-Z]{8,}/g, ':id').replace(/\\s.*/, '').slice(0, 34);
  const on = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const role = e.getAttribute('role');
  return [
    e.tagName.toLowerCase() + (role ? '[' + role + ']' : ''),
    name,
    Math.round(r.left) + ',' + Math.round(r.top),
    Math.round(r.width) + 'x' + Math.round(r.height) + (on ? '' : ' OFFSCREEN'),
    'scroll ' + Math.round(scrollY) + '/' + Math.round(document.documentElement.scrollHeight - innerHeight),
  ].join(' ');
})()`;

let last = '';
let same = 0;
for (let i = 1; i <= max; i++) {
  const base = { key, code: key, windowsVirtualKeyCode: VK[key], nativeVirtualKeyCode: VK[key] };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(650);
  const value = (await send('Runtime.evaluate', { expression: probe, returnByValue: true })).result?.result?.value ?? 'ERROR';
  console.log(String(i).padStart(2), value);
  same = value === last ? same + 1 : 0;
  last = value;
  if (same >= 2) {
    console.log('   stopped: no further movement');
    break;
  }
}
process.exit(0);
