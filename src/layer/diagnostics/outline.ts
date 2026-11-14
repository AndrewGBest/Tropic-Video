// Produces a structural outline of the current page for writing site-adapter
// selectors. The outline must be safe to share: it carries NO text content,
// no titles, no names, no image or link targets, and no cookies or storage.
// Only tag names, a small allowlist of structural attributes, and lengths.

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'HEAD', 'PATH', 'DEFS', 'G']);

/** Attributes copied verbatim. All are structural, none carry user content. */
const VERBATIM = new Set([
  'role',
  'type',
  'tabindex',
  'data-testid',
  'data-test-id',
  'data-automation-id',
  'aria-hidden',
  'aria-expanded',
  'aria-selected',
  'aria-checked',
  'aria-pressed',
  'aria-disabled',
  'aria-haspopup',
  'aria-current',
  'aria-orientation',
  'disabled',
  'hidden',
  'inert',
  'autocomplete',
  'inputmode',
]);

/** Attributes whose presence and length are noted but whose value is withheld. */
const REDACTED = new Set(['aria-label', 'aria-labelledby', 'aria-describedby', 'title', 'alt', 'placeholder', 'name', 'href', 'src', 'value']);

const MAX_NODES = 4000;
const MAX_DEPTH = 40;
const MAX_CLASS_CHARS = 120;

// Identifiers that look like content or session ids are masked, so an id or
// class cannot leak which title or account was on screen.
function maskToken(token: string): string {
  if (token.length > 24) return ':id';
  if (/\d{4,}/.test(token)) return ':id';
  if (/^[A-Z0-9]{8,}$/.test(token)) return ':id';
  if (/^[0-9a-f]{8,}$/i.test(token)) return ':id';
  if (/^amzn|^B0[0-9A-Z]{6,}/i.test(token)) return ':id';
  return token;
}

/** Attributes that hold a single identifier. Seen on the live site: an identifier can embed a profile name. */
const IDENTIFIERS = new Set(['data-testid', 'data-test-id', 'data-automation-id']);

/** Identifier segments after which the rest is likely to be about a person. */
const PERSONAL = /^(profile|profiles|user|username|account|customer|name|email)$/i;

/**
 * Masks an identifier such as a test id. Identifiers are one token made of
 * lower-case segments; anything that looks like embedded free text (a space,
 * a capitalised later segment, whatever follows "profile") is replaced by
 * `:text`. Over-masking is fine; leaking a name is not.
 */
export function maskIdentifier(value: string): string {
  const trimmed = value.trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  const hadSpace = first.length !== trimmed.length;
  const segments = first.split(/([-_:.])/); // keeps separators at odd indices
  const kept: string[] = [];
  let cut = false;
  for (let i = 0; i < segments.length; i += 2) {
    const seg = segments[i] ?? '';
    if (i > 0 && /^[A-Z]/.test(seg)) {
      cut = true;
      break;
    }
    kept.push(seg, segments[i + 1] ?? '');
    if (PERSONAL.test(seg) && i + 2 < segments.length) {
      cut = true;
      break;
    }
  }
  if (!cut) return hadSpace ? ':text' : maskToken(first); // free text with spaces is not an identifier at all
  const head = kept.join('').replace(/[-_:.]$/, '');
  return head && maskToken(head) === head ? `${head}-:text` : ':text';
}

function maskList(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(maskToken)
    .join(' ')
    .slice(0, MAX_CLASS_CHARS);
}

function describe(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];
  if (el.id) parts.push(`#${maskIdentifier(el.id)}`);
  const cls = el.getAttribute('class');
  if (cls) parts.push(`.${maskList(cls).replace(/ /g, '.')}`);
  for (const attr of el.attributes) {
    const name = attr.name.toLowerCase();
    if (IDENTIFIERS.has(name)) {
      parts.push(`[${name}="${maskIdentifier(attr.value)}"]`);
    } else if (VERBATIM.has(name)) {
      parts.push(`[${name}="${maskList(attr.value)}"]`);
    } else if (REDACTED.has(name)) {
      parts.push(`[${name}:${attr.value.length}]`);
    }
  }
  let ownText = 0;
  for (const node of el.childNodes) {
    if (node.nodeType === 3) ownText += (node.nodeValue ?? '').trim().length;
  }
  if (ownText > 0) parts.push(`{text:${ownText}}`);
  return parts.join('');
}

export function buildOutline(root: Element): string {
  const lines: string[] = [];
  let count = 0;
  const walk = (el: Element, depth: number): void => {
    if (count >= MAX_NODES || depth > MAX_DEPTH) return;
    if (SKIP_TAGS.has(el.tagName.toUpperCase())) return;
    count += 1;
    lines.push(`${'  '.repeat(depth)}${describe(el)}`);
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(root, 0);
  if (count >= MAX_NODES) lines.push(`… truncated at ${MAX_NODES} nodes`);
  return lines.join('\n');
}

/** Path shape only: host and query are dropped and id-like segments masked. */
export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname
      .split('/')
      .map((seg) => (seg ? maskToken(seg) : seg))
      .join('/');
    return `${u.protocol}//<host>${path}`;
  } catch {
    return '<unparseable>';
  }
}
