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
