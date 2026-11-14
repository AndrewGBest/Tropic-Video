// Why a navigation was refused, and what to tell the person at the screen.
// Pure: no Electron imports, so every rule here is unit-tested.
import { looksLikeSpendUrl } from '../layer/guard/purchase-guard';
import { isAllowedUrl } from './hosts';

export type BlockReason = 'other-site' | 'automation-spend';

export function blockReason(url: string, opts: { dev: boolean; automation: boolean }): BlockReason | null {
  if (!isAllowedUrl(url, { dev: opts.dev })) return 'other-site';
  // Automation must never reach a payment or sign-up flow, even by URL.
  if (opts.automation && looksLikeSpendUrl(url)) return 'automation-spend';
  return null;
}

const MAX_DESCRIPTION = 80;

/** Host and path only. Queries and fragments can carry tokens, so they are never shown or logged. */
export function describeBlockedUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return '(unreadable address)';
  }
  if (!u.host) return `(${u.protocol} address)`;
  const text = u.host + u.pathname;
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION)}…` : text;
}

/** One line, shown as a toast over the page that stays on screen. */
export function blockedMessage(reason: BlockReason): string {
  return reason === 'automation-spend'
    ? 'Blocked: automation mode never opens purchase or sign-up pages'
    : 'Blocked: that link goes to another site';
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A page to show when a navigation is refused before anything has loaded, so
 * the window is not left blank. Self-contained: no scripts, no remote resources.
 */
export function noticePageUrl(reason: BlockReason, url: string): string {
  const why =
    reason === 'automation-spend'
      ? 'The app was started with --automation, which refuses any page that looks like a purchase, subscription or sign-up flow. ' +
        'If nobody is signed in yet, quit, start the app without --automation and sign in by hand.'
      : 'This app only opens the streaming service and its sign-in pages. The address it was sent to is somewhere else.';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tropic Video: page blocked</title>
<style>
  html, body { height: 100%; margin: 0; background: #000; color: #eee; font: 3.6vh/1.5 system-ui, sans-serif; }
  main { box-sizing: border-box; height: 100%; max-width: 80vw; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; gap: 2vh; }
  h1 { font-size: 6vh; margin: 0; }
  p { margin: 0; }
  code { font: 3.2vh ui-monospace, monospace; color: #9fd8c0; overflow-wrap: anywhere; }
  .hint { color: #aaa; }
</style>
</head>
<body>
<main>
  <h1>This page was blocked</h1>
  <p>${escapeHtml(why)}</p>
  <p>Blocked address: <code>${escapeHtml(describeBlockedUrl(url))}</code></p>
  <p class="hint">Press Ctrl+Q to quit.</p>
</main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
