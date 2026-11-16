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

/** A self-contained notice page: no scripts, no remote resources. Every argument is escaped. */
function noticePage(title: string, heading: string, paragraphs: readonly string[], detail?: { label: string; value: string }): string {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Tropic Video: ${escapeHtml(title)}</title>
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
  <h1>${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `  <p>${escapeHtml(p)}</p>`).join('\n')}
${detail ? `  <p>${escapeHtml(detail.label)}: <code>${escapeHtml(detail.value)}</code></p>` : ''}
  <p class="hint">Press Ctrl+Q to quit.</p>
</main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * A page to show when a navigation is refused before anything has loaded, so
 * the window is not left blank.
 */
export function noticePageUrl(reason: BlockReason, url: string): string {
  const why =
    reason === 'automation-spend'
      ? 'The app was started with --automation, which refuses any page that looks like a purchase, subscription or sign-up flow. ' +
        'If nobody is signed in yet, quit, start the app without --automation and sign in by hand.'
      : 'This app only opens the streaming service and its sign-in pages. The address it was sent to is somewhere else.';
  return noticePage('page blocked', 'This page was blocked', [why], { label: 'Blocked address', value: describeBlockedUrl(url) });
}

/**
 * Shown the moment the window opens, while the playback component is made
 * ready (a download on the first run). Without it nothing appears until that
 * finishes, and a slow or blocked download looks like an app that never started.
 */
export function startingPageUrl(): string {
  return noticePage('starting', 'Starting', ['Getting the playback component ready. On the first run this is a download and can take a moment.']);
}

/** Chromium's code for a navigation that was cancelled, which is what a refused navigation looks like. Not a failure. */
const ERR_ABORTED = -3;

/** True when a failed main-frame load should put up the "cannot reach" page and be retried. */
export function isLoadFailure(code: number, url: string): boolean {
  if (code === ERR_ABORTED || code >= 0) return false;
  return !url.startsWith('data:') && url !== 'about:blank';
}

/** Seconds to wait before retry number `attempt` (1, 2, 3...): quick at first, then every half minute. */
export function retryDelaySeconds(attempt: number): number {
  return Math.min(30, 5 * Math.max(1, Math.round(attempt)));
}

/** The page shown while the service cannot be reached. */
export function offlinePageUrl(description: string, nextTrySeconds: number): string {
  return noticePage(
    'cannot connect',
    'Cannot reach the streaming service',
    ['Check the network connection.', `Trying again in ${Math.round(nextTrySeconds)} seconds, and it will keep trying.`],
    { label: 'What the browser reported', value: description.replace(/[^A-Za-z0-9_ :.-]/g, '').slice(0, 60) || 'no details' },
  );
}
