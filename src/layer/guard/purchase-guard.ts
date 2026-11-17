// Automation safety net. When the app is being driven by a test harness or an
// AI agent, no click may reach a control that could spend money or start a
// subscription. Ordinary users are never affected: this is only installed in
// automation mode.
/**
 * Account matters an agent or script has no business in: leaving the account,
 * or changing who is on it. The words are here so the guard does not rest on
 * the site keeping its markup.
 */
const ACCOUNT_WORDS = /\b(log ?out|sign ?out|(add|edit|delete|manage) profiles?|account( settings)?|billing|payment (method|details)|cancel (subscription|membership|plan))\b/i;

const SPEND_WORDS =
  /\b(buy|rent|purchase|pre-?order|subscribe|subscription|free trial|start (your )?trial|join prime|sign up|upgrade|(go )?ad[- ]free|add to (cart|basket)|place (your )?order|pay now|checkout|1-click)\b/i;

/** URL fragments that indicate a payment or sign-up flow. Heuristic until confirmed on the live site. */
const SPEND_URL = /(checkout|\/buy\b|\/gp\/buy|purchase|signup|sign-up|\/offers?\b|subscribe|payment)/i;

export function looksLikeSpendUrl(url: string): boolean {
  try {
    const u = new URL(url, 'https://invalid.example');
    return SPEND_URL.test(u.pathname + u.search);
  } catch {
    return true; // Unparseable target: refuse rather than guess.
  }
}

function describe(el: Element): string {
  const parts = [
    el.textContent ?? '',
    el.getAttribute('aria-label') ?? '',
    el.getAttribute('title') ?? '',
    el.getAttribute('value') ?? '',
  ];
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** True when activating `target` could plausibly spend money. Errs toward blocking. */
export function isSpendControl(target: Element, extraSelectors: readonly string[] = []): boolean {
  const control =
    target.closest('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"]') ??
    target;
  for (const sel of extraSelectors) {
    if (control.closest(sel)) return true;
  }
  const text = describe(control);
  // Long text means we climbed to a container, not a button; judge only real controls.
  if (text.length <= 80 && (SPEND_WORDS.test(text) || ACCOUNT_WORDS.test(text))) return true;
  const href = control.getAttribute('href');
  if (href && looksLikeSpendUrl(href)) return true;
  if (control.closest('form[action]')) {
    const action = control.closest('form[action]')?.getAttribute('action') ?? '';
    if (looksLikeSpendUrl(action)) return true;
  }
  return false;
}

export function installPurchaseGuard(
  doc: Document,
  extraSelectors: readonly string[],
  onBlocked: (el: Element) => void,
): () => void {
  const handler = (e: Event): void => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (isSpendControl(t, extraSelectors)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      onBlocked(t);
    }
  };
  const submit = (e: Event): void => {
    const form = e.target;
    if (form instanceof HTMLFormElement && looksLikeSpendUrl(form.getAttribute('action') ?? '')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      onBlocked(form);
    }
  };
  // Capture phase on window so we run before any page handler.
  const view = doc.defaultView;
  const events = ['click', 'pointerdown', 'mousedown', 'mouseup', 'pointerup', 'keydown'] as const;
  const keyFilter = (e: Event): void => {
    if (e.type === 'keydown') {
      const k = (e as KeyboardEvent).key;
      if (k !== 'Enter' && k !== ' ') return;
    }
    handler(e);
  };
  for (const name of events) view?.addEventListener(name, keyFilter, true);
  view?.addEventListener('submit', submit, true);
  return () => {
    for (const name of events) view?.removeEventListener(name, keyFilter, true);
    view?.removeEventListener('submit', submit, true);
  };
}
