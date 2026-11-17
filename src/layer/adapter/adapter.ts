// The site adapter is data, not code: a small JSON file of selectors that can
// be corrected without rebuilding the app. Everything must keep working, in a
// degraded way, when the adapter is empty or wrong.
export interface SiteAdapter {
  id: string;
  schema: 1;
  revision: number;
  verified: boolean;
  note?: string;
  selectors: {
    extraFocusable: string[];
    searchInput: string[];
    /** Controls that reveal the search input when it is hidden. */
    searchOpen: string[];
    /** Carousel arrows: pressed by the layer when left/right runs out, never focus targets themselves. */
    rowPrev: string[];
    rowNext: string[];
    /** Elements the site's player lives in; see findMainVideo. */
    playerRoot: string[];
    playerClose: string[];
    purchaseControls: string[];
  };
}

const KEYS = ['extraFocusable', 'searchInput', 'searchOpen', 'rowPrev', 'rowNext', 'playerRoot', 'playerClose', 'purchaseControls'] as const;

export function emptyAdapter(): SiteAdapter {
  return {
    id: 'none',
    schema: 1,
    revision: 0,
    verified: false,
    selectors: { extraFocusable: [], searchInput: [], searchOpen: [], rowPrev: [], rowNext: [], playerRoot: [], playerClose: [], purchaseControls: [] },
  };
}

function isSafeSelector(sel: unknown, doc?: Document): sel is string {
  if (typeof sel !== 'string' || sel.length === 0 || sel.length > 300) return false;
  if (!doc) return true;
  try {
    doc.querySelector(sel);
    return true;
  } catch {
    return false;
  }
}

/** Validates untrusted adapter data. Invalid selectors are dropped, never thrown on. */
export function parseAdapter(raw: unknown, doc?: Document): SiteAdapter {
  const out = emptyAdapter();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r['schema'] !== 1) return out;
  if (typeof r['id'] === 'string') out.id = r['id'].slice(0, 40);
  if (typeof r['revision'] === 'number' && Number.isFinite(r['revision'])) out.revision = r['revision'];
  out.verified = r['verified'] === true;
  const sels = r['selectors'];
  if (sels && typeof sels === 'object') {
    const s = sels as Record<string, unknown>;
    for (const key of KEYS) {
      const list = s[key];
      if (Array.isArray(list)) {
        out.selectors[key] = list.filter((x): x is string => isSafeSelector(x, doc)).slice(0, 50);
      }
    }
  }
  return out;
}

/**
 * Which adapter to use: the one that came with the app, or one the user put
 * in the app's data folder. The user's file is for the days after the site
 * changes its pages and before a new build exists. It is used only when it is
 * for the same site and newer; an older file left behind must not undo a
 * build's own corrections.
 */
export function chooseAdapter(bundled: unknown, fromUser: unknown): { raw: unknown; source: 'bundled' | 'user'; note?: string } {
  if (fromUser === undefined || fromUser === null) return { raw: bundled, source: 'bundled' };
  const ours = parseAdapter(bundled);
  const theirs = parseAdapter(fromUser);
  const isObject = typeof fromUser === 'object' && (fromUser as Record<string, unknown>)['schema'] === 1;
  if (!isObject) return { raw: bundled, source: 'bundled', note: 'adapter.json is not an adapter file (schema 1); ignored' };
  if (theirs.id !== ours.id) return { raw: bundled, source: 'bundled', note: `adapter.json is for "${theirs.id}", not "${ours.id}"; ignored` };
  if (!(theirs.revision > ours.revision)) {
    return { raw: bundled, source: 'bundled', note: `adapter.json is revision ${theirs.revision}, not newer than this build's ${ours.revision}; ignored` };
  }
  return { raw: fromUser, source: 'user' };
}

/** How many elements each of the adapter's lists matches on this page: a quick sign that the site has changed. */
export function adapterReport(adapter: SiteAdapter, doc: Document): string {
  const counts = KEYS.filter((key) => adapter.selectors[key].length > 0).map((key) => {
    let n = 0;
    for (const sel of adapter.selectors[key]) {
      try {
        n += doc.querySelectorAll(sel).length;
      } catch {
        // counted as no match
      }
    }
    return `${key}=${n}`;
  });
  return `adapter ${adapter.id} revision ${adapter.revision}: ${counts.join(' ') || 'no selectors'}`;
}

export function firstMatch(doc: Document, selectors: readonly string[]): Element | null {
  for (const sel of selectors) {
    try {
      const el = doc.querySelector(sel);
      if (el) return el;
    } catch {
      // A bad selector must never break navigation.
    }
  }
  return null;
}
