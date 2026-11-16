// DOM side of directional focus: finds candidates, moves focus, activates.
import type { Direction } from '../../shared/actions';
import { pickInitial, pickNext, type Rect } from './geometry';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])',
  // A styled radio or checkbox: the real input is invisible inside its label,
  // so the label is the thing to focus and click. (When the input is visible
  // it wins, because wrappers of another candidate are dropped.)
  'label:has(input[type="radio"])',
  'label:has(input[type="checkbox"])',
  // The same, with the input elsewhere and tied by `for` (checked below).
  'label[for]',
].join(',');

/** For a `label[for]`: the checkbox or radio it stands for, or null when it labels something else. */
function labelledToggle(label: Element): HTMLInputElement | null {
  const id = label.getAttribute('for');
  const target = id ? label.ownerDocument.getElementById(id) : null;
  return target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio') ? target : null;
}

export const FOCUS_ATTR = 'data-tropic-focus';
/** Set on a focused element small enough to grow, as focused cards do on a TV. */
export const ZOOM_ATTR = 'data-tropic-zoom';

/** A focused card grows; a banner, a text field or a slider does not. */
export function shouldZoom(el: Element, view: Window): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return false;
  const r = el.getBoundingClientRect();
  const viewport = view.innerWidth * view.innerHeight;
  return viewport > 0 && (r.width * r.height) / viewport <= 0.2;
}

/**
 * The element to grow for a focused control: the outermost ancestor that
 * occupies the same box. On the live site a card's link is a transparent
 * layer over its picture, so growing the link alone left the picture behind.
 */
export function zoomTarget(el: Element): Element {
  const box = el.getBoundingClientRect();
  const same = (r: DOMRect): boolean =>
    Math.abs(r.left - box.left) <= 6 && Math.abs(r.top - box.top) <= 6 && Math.abs(r.right - box.right) <= 6 && Math.abs(r.bottom - box.bottom) <= 6;
  let target = el;
  for (let node = el.parentElement, i = 0; node && i < 6 && same(node.getBoundingClientRect()); node = node.parentElement, i++) {
    target = node;
  }
  return target;
}

export interface NavigatorOptions {
  /** Extra selectors from the site adapter. */
  extraFocusable?: string[];
  /** Elements the layer itself owns; never candidates. */
  ignoreWithin?: string;
  onFocusChange?: (el: Element | null) => void;
  /** Controls that are never focus targets (carousel arrows the layer presses itself at a row's edge). */
  skip?: string[];
  /** When it returns an element, only candidates inside that element are considered. */
  scope?: () => Element | null;
}

export function isVisible(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = view.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  if (style.opacity === '0') {
    // A transparent link or button laid over a picture is a hit area, not a
    // hidden control. Seen on the live site: each episode's play link is
    // invisible over its thumbnail, and ignores the pointer, until the
    // thumbnail is hovered; activating it directly still works. Only
    // picture-sized ones count; small transparent controls stay hidden.
    const hitArea = el.matches('a[href], button, [role="button"], [role="link"]');
    if (!hitArea || r.width < 48 || r.height < 48) return false;
  }
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  // Opacity is not inherited in the computed style, but a transparent ancestor
  // hides everything in it. Seen on the live site: the slides of a carousel
  // are stacked in one place and all but one sit in a fully transparent wrapper.
  let node = el.parentElement;
  for (let i = 0; node && i < 12; i++, node = node.parentElement) {
    if (view.getComputedStyle(node).opacity === '0') return false;
  }
  return true;
}

/**
 * The sideways-scrolling strip an element sits in, if any: the nearest
 * ancestor that is wider inside than outside and clips or scrolls. Plain
 * grids have none and keep purely geometric movement.
 */
/**
 * The carousel arrow to press when sideways movement runs out: a match for
 * `selectors` in the nearest ancestor of `from` that has one. That ancestor
 * must be no taller than the viewport, so a press in one strip never turns
 * another strip. The arrow only needs to be laid out: on the live site the
 * arrows are transparent until the pointer hovers, and still work.
 */
export function edgeControl(from: Element, selectors: readonly string[], view: Window): { control: Element; container: Element } | null {
  const maxHeight = view.innerHeight * 1.2;
  let node = from.parentElement;
  for (let i = 0; node && i < 14; i++, node = node.parentElement) {
    for (const sel of selectors) {
      try {
        for (const control of node.querySelectorAll(sel)) {
          const r = control.getBoundingClientRect();
          if (r.width < 4 || r.height < 4 || (control as HTMLButtonElement).disabled) continue;
          return node.getBoundingClientRect().height > maxHeight ? null : { control, container: node };
        }
      } catch {
        // A bad selector must never break navigation.
      }
    }
  }
  return null;
}

export function rowOf(el: Element, view: Window): Element | null {
  let node = el.parentElement;
  for (let i = 0; node && i < 8; i++, node = node.parentElement) {
    // A strip, not a page: on the live site a page-sized container also
    // clips sideways, and taking it for a row sent focus to the top of the page.
    if (node.clientHeight > view.innerHeight * 0.9) return null;
    if (node.scrollWidth > node.clientWidth + 8 && view.getComputedStyle(node).overflowX !== 'visible') return node;
  }
  return null;
}

/**
 * The pop-up the page has put in front of everything, if any: the last
 * laid-out modal dialog. While one is open, only its controls can be reached.
 */
export function openDialog(doc: Document): Element | null {
  let found: Element | null = null;
  for (const el of doc.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    // It must really be in front. Seen on the live site: a station's pop-up
    // stays open underneath the player it started. Where the browser cannot
    // say what is on top (no layout), the dialog is taken at its word.
    const top = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) : null;
    if (top && !el.contains(top) && !top.contains(el)) continue;
    found = el;
  }
  return found;
}

/**
 * True for controls in a bar that stays put while the page scrolls (a fixed
 * or sticky header, a pinned tab strip). `cache` avoids restyling shared ancestors.
 */
export function isPinned(el: Element, view: Window, cache: Map<Element, boolean> = new Map()): boolean {
  const path: Element[] = [];
  let pinned = false;
  for (let node: Element | null = el; node && node !== el.ownerDocument.body; node = node.parentElement) {
    const known = cache.get(node);
    if (known !== undefined) {
      pinned = known;
      break;
    }
    path.push(node);
    const position = view.getComputedStyle(node).position;
    if (position === 'fixed' || position === 'sticky') {
      pinned = true;
      break;
    }
  }
  for (const node of path) cache.set(node, pinned);
  return pinned;
}

/** False for something parked far outside the page, a common way to hide a real input. */
function onScreenish(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  return r.right > -2000 && r.left < view.innerWidth + 2000;
}

/** True when `outer` wholly contains `inner` and is at least four times its area. */
function covers(outer: Rect, inner: Rect): boolean {
  if (inner.left < outer.left || inner.right > outer.right || inner.top < outer.top || inner.bottom > outer.bottom) return false;
  const area = (r: Rect): number => (r.right - r.left) * (r.bottom - r.top);
  return area(outer) >= 4 * area(inner);
}

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/**
 * True when something the size of the screen has come up in front of `el`
 * (a player opening over the page, say): what the user selected is no longer
 * what they are looking at.
 */
export function coveredByScreen(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  const top = el.ownerDocument.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  if (!top || el.contains(top)) return false;
  for (let c: Element | null = top; c && !c.contains(el); c = c.parentElement) {
    const b = c.getBoundingClientRect();
    if (b.width >= view.innerWidth * 0.9 && b.height >= view.innerHeight * 0.9) return true;
  }
  return false;
}

const FOOTER = 'footer, [role="contentinfo"]';

/** Moves closer together than this are a held key (or a very quick thumb). */
const RAPID_MS = 220;

export class SpatialNavigator {
  private current: Element | null = null;
  private zoomed: Element | null = null;
  /** Where focus last was in each sideways-scrolling row. */
  private readonly rowMemory = new WeakMap<Element, Element>();
  /** When the last move was made, to tell a held key from single presses. */
  private lastMoveAt = 0;
  private rapid = false;

  constructor(
    private readonly doc: Document,
    private readonly opts: NavigatorOptions = {},
  ) {}

  get focused(): Element | null {
    if (this.current && !this.current.isConnected) this.current = null;
    return this.current;
  }

  /**
   * Everything focus can go to. With `near`, only what is within a few
   * screens above or below: far down a long page the full list takes long
   * enough to build that held keys queue up.
   */
  candidates(near = false): Element[] {
    const view = this.doc.defaultView;
    if (!view) return [];
    const above = -2 * view.innerHeight;
    const below = 3 * view.innerHeight;
    const selector = [FOCUSABLE, ...(this.opts.extraFocusable ?? [])].join(',');
    const scope = this.opts.scope?.() ?? null;
    const skip = this.skipSelector();
    const seen = new Set<Element>();
    for (const el of (scope ?? this.doc).querySelectorAll(selector)) {
      if (this.opts.ignoreWithin && el.closest(this.opts.ignoreWithin)) continue;
      if (skip && el.matches(skip)) continue;
      if (near) {
        const r = el.getBoundingClientRect();
        if (r.bottom < above || r.top > below) continue;
      }
      if (!isVisible(el, view)) continue;
      seen.add(el);
    }
    // A label tied to a toggle by `for` stands in for it only when the toggle
    // itself cannot be focused.
    for (const el of [...seen]) {
      if (!(el instanceof HTMLLabelElement) || !el.hasAttribute('for') || el.querySelector('input')) continue;
      const toggle = labelledToggle(el);
      if (!toggle || (seen.has(toggle) && onScreenish(toggle, view))) seen.delete(el);
    }
    // Nothing parked far outside the page is a target. When it is a toggle,
    // its label is what the user sees and is used instead, even if the label
    // is hidden from assistive technology. Seen on the live site: a season
    // list opened by a label whose checkbox sits 100,000 pixels to the left.
    for (const el of [...seen]) {
      if (onScreenish(el, view)) continue;
      seen.delete(el);
      if (!(el instanceof HTMLInputElement) || (el.type !== 'checkbox' && el.type !== 'radio')) continue;
      for (const label of el.labels ?? []) {
        const r = label.getBoundingClientRect();
        const style = view.getComputedStyle(label);
        if (r.width >= 4 && r.height >= 4 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0') seen.add(label);
      }
    }
    // Drop wrappers that contain another candidate, so a card and the link
    // inside it do not both receive focus.
    const inner = [...seen].filter((el) => ![...seen].some((other) => other !== el && el.contains(other)));
    // Drop backdrops too: a link stretched over a whole banner, with the
    // banner's real buttons lying on top of it. Seen on the live site, where
    // such a link swallowed sideways movement.
    const rects = inner.map(toRect);
    const front = inner.filter((_, i) => !rects.some((other, j) => j !== i && covers(rects[i]!, other)));
    // One target per spot: when several controls occupy the same box (a card's
    // link and a transparent button over it), keep the one that can be seen,
    // and a link before anything else.
    const bySpot = new Map<string, Element>();
    const rank = (el: Element): number => (view.getComputedStyle(el).opacity === '0' ? 0 : 2) + (el.matches('a[href]') ? 1 : 0);
    for (const el of front) {
      const r = el.getBoundingClientRect();
      const spot = [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v / 6)).join(',');
      const held = bySpot.get(spot);
      if (!held || rank(el) > rank(held)) bySpot.set(spot, el);
    }
    return front.filter((el) => [...bySpot.values()].includes(el));
  }

  private skipSelector(): string | null {
    const valid = (this.opts.skip ?? []).filter((sel) => {
      try {
        this.doc.querySelector(sel);
        return true;
      } catch {
        return false;
      }
    });
    return valid.length ? valid.join(',') : null;
  }

  /** Focuses the candidate whose centre is nearest to a point, for picking up where a vanished control was. */
  focusNearest(point: { x: number; y: number }, pool: readonly Element[] = this.candidates()): boolean {
    let best: Element | null = null;
    let bestDistance = Infinity;
    for (const el of pool) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot((r.left + r.right) / 2 - point.x, (r.top + r.bottom) / 2 - point.y);
      if (d < bestDistance) {
        best = el;
        bestDistance = d;
      }
    }
    return this.focus(best);
  }

  /** True when the focused control is entirely outside the window (the page was scrolled away from it). */
  focusIsOffScreen(): boolean {
    const el = this.focused;
    const view = this.doc.defaultView;
    if (!el || !view) return false;
    const r = el.getBoundingClientRect();
    return r.bottom <= 0 || r.top >= view.innerHeight || r.right <= 0 || r.left >= view.innerWidth;
  }

  /** Focuses the first page control wholly on screen, reading order; pinned bars only if there is nothing else. */
  focusFirstOnScreen(allowPinned = true): boolean {
    const view = this.doc.defaultView;
    if (!view) return false;
    const onScreen = this.candidates().filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= view.innerHeight && r.left >= 0 && r.right <= view.innerWidth;
    });
    const cache = new Map<Element, boolean>();
    const flowing = onScreen.filter((el) => !isPinned(el, view, cache));
    const pool = flowing.length || !allowPinned ? flowing : onScreen;
    return this.focus(pool[pickInitial(pool.map(toRect))] ?? null);
  }

  /** Focuses the first candidate inside `container`, reading order. */
  focusFirstIn(container: Element): boolean {
    const inside = this.candidates().filter((el) => container.contains(el));
    return this.focus(inside[pickInitial(inside.map(toRect))] ?? null);
  }

  move(dir: Direction): boolean {
    // Measured from the end of the last move: on a long page a move takes
    // time itself, and that must not make a held key look like single presses.
    this.rapid = Date.now() - this.lastMoveAt < RAPID_MS;
    // First among what is near the screen, which is quick; the whole page
    // only when nothing near lies that way.
    const moved = this.step(dir, this.candidates(true)) ?? this.step(dir, this.candidates()) ?? false;
    this.lastMoveAt = Date.now();
    return moved;
  }

  /** One attempt at a move among `all`. Null when nothing lies in that direction. */
  private step(dir: Direction, all: Element[]): boolean | null {
    const from = this.focused;
    const view = this.doc.defaultView;
    if (!from) {
      // Focus was lost part-way down a page (what had it was replaced as
      // more of the page loaded): carry on from what is on screen, not from the top.
      // If nothing is on screen yet, keep scrolling the way the key points
      // rather than jumping to the bar at the top.
      if (view && view.scrollY > view.innerHeight / 2) {
        if (!this.focusFirstOnScreen(false) && (dir === 'up' || dir === 'down')) {
          view.scrollBy({ top: (dir === 'down' ? 0.8 : -0.8) * view.innerHeight, behavior: 'instant' });
        }
        return true;
      }
      const i = pickInitial(all.map(toRect));
      return this.focus(all[i] ?? null);
    }
    let others = all.filter((el) => el !== from);
    // Up and down follow the page. A bar pinned to the screen is always
    // "nearest" once the page has scrolled under it, and focusing it jumps
    // the page back to where the bar lives; so from page content it is only
    // a target when there is no page content left in that direction.
    if (view && (dir === 'up' || dir === 'down')) {
      const cache = new Map<Element, boolean>();
      if (!isPinned(from, view, cache)) {
        const flowing = others.filter((el) => !isPinned(el, view, cache));
        if (pickNext(toRect(from), flowing.map(toRect), dir) !== -1) others = flowing;
      }
    }
    const i = pickNext(toRect(from), others.map(toRect), dir);
    if (i === -1) return null;
    let target = others[i] ?? null;
    if (target && (dir === 'up' || dir === 'down')) target = this.rowEntry(target, from, others);
    // A held key stops at the last row and does not run on into the page's
    // footer: more rows may be about to load in front of it, and the footer
    // would carry the focus away from them. A single press still goes there.
    if (target && this.rapid && dir === 'down' && target.closest(FOOTER) && !from.closest(FOOTER)) return true;
    // A held key must not run ahead of a page that loads more as it scrolls:
    // a target far outside the screen may only be the next thing loaded so
    // far (the footer, with rows still to come before it). Scroll toward it
    // and let the next repeat decide again.
    if (target && view && this.rapid && (dir === 'up' || dir === 'down')) {
      const r = target.getBoundingClientRect();
      const far = dir === 'down' ? r.top > view.innerHeight : r.bottom < 0;
      if (far) {
        view.scrollBy({ top: (dir === 'down' ? 0.8 : -0.8) * view.innerHeight, behavior: 'instant' });
        return true;
      }
    }
    return this.focus(target);
  }

  /**
   * Entering a sideways-scrolling row from above or below goes to where the
   * user last was in that row, or to its first item on screen, instead of to
   * whichever item happens to be nearest after the rows were scrolled.
   */
  private rowEntry(target: Element, from: Element, candidates: readonly Element[]): Element {
    const view = this.doc.defaultView;
    if (!view) return target;
    const row = rowOf(target, view);
    if (!row || row === rowOf(from, view)) return target;
    const inRow = candidates.filter((el) => row.contains(el));
    const remembered = this.rowMemory.get(row);
    if (remembered && inRow.includes(remembered)) return remembered;
    const rowLeft = row.getBoundingClientRect().left;
    let first = target;
    for (const el of inRow) {
      const r = el.getBoundingClientRect();
      if (r.left >= rowLeft - 4 && r.left < first.getBoundingClientRect().left) first = el;
    }
    return first;
  }

  /**
   * Moves from a point on screen rather than from the focused element. With
   * nothing in that direction it takes the control nearest the point (a live
   * station's player has its bottom controls disabled; landing on the far
   * corner's Close button there would be a surprise).
   */
  moveFrom(point: { x: number; y: number }, dir: Direction): boolean {
    const all = this.candidates();
    const from: Rect = { left: point.x, top: point.y, right: point.x, bottom: point.y };
    const i = pickNext(from, all.map(toRect), dir);
    if (i !== -1) return this.focus(all[i] ?? null);
    // Not a slider when there is anything else: arriving on the volume control is no use to anyone.
    const plain = all.filter((el) => !(el instanceof HTMLInputElement && el.type === 'range'));
    return this.focusNearest(point, plain.length ? plain : all);
  }

  focus(el: Element | null): boolean {
    if (!el) return false;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.zoomed?.removeAttribute(ZOOM_ATTR);
    this.zoomed = null;
    this.current = el;
    const view = this.doc.defaultView;
    const row = view ? rowOf(el, view) : null;
    if (row) this.rowMemory.set(row, el);
    el.setAttribute(FOCUS_ATTR, '');
    if (view && shouldZoom(el, view)) {
      this.zoomed = zoomTarget(el);
      this.zoomed.setAttribute(ZOOM_ATTR, '');
    }
    if (el instanceof HTMLElement || 'focus' in el) {
      (el as HTMLElement).focus({ preventScroll: true });
    }
    // Anything on the first screenful (the bar and the banner under it) is
    // shown with the page at the very top, so the banner is seen whole and
    // not half under the bar. Further down, the focused row is centred.
    const top = view ? el.getBoundingClientRect().top + view.scrollY : Infinity;
    const bottom = view ? top + el.getBoundingClientRect().height : Infinity;
    if (view && bottom <= view.innerHeight) {
      // Only this: a second scroll request would replace it and stop short of the top.
      view.scrollTo({ top: 0, behavior: this.rapid ? 'instant' : 'smooth' });
    } else {
      // With a key held, a smooth scroll is restarted by every repeat and never arrives.
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: this.rapid ? 'instant' : 'smooth' });
    }
    this.opts.onFocusChange?.(el);
    return true;
  }

  activate(): boolean {
    const el = this.focused;
    if (!el) return false;
    (el as HTMLElement).click();
    return true;
  }

  clear(): void {
    this.current?.removeAttribute(FOCUS_ATTR);
    this.zoomed?.removeAttribute(ZOOM_ATTR);
    this.zoomed = null;
    this.current = null;
    this.opts.onFocusChange?.(null);
  }
}
