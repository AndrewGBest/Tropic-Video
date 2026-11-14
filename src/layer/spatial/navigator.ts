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
].join(',');

export const FOCUS_ATTR = 'data-tropic-focus';

export interface NavigatorOptions {
  /** Extra selectors from the site adapter. */
  extraFocusable?: string[];
  /** Elements the layer itself owns; never candidates. */
  ignoreWithin?: string;
  onFocusChange?: (el: Element | null) => void;
  /** When it returns an element, only candidates inside that element are considered. */
  scope?: () => Element | null;
}

export function isVisible(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = view.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  return true;
}

/**
 * The sideways-scrolling strip an element sits in, if any: the nearest
 * ancestor that is wider inside than outside and clips or scrolls. Plain
 * grids have none and keep purely geometric movement.
 */
export function rowOf(el: Element, view: Window): Element | null {
  let node = el.parentElement;
  for (let i = 0; node && i < 8; i++, node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth + 8 && view.getComputedStyle(node).overflowX !== 'visible') return node;
  }
  return null;
}

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export class SpatialNavigator {
  private current: Element | null = null;
  /** Where focus last was in each sideways-scrolling row. */
  private readonly rowMemory = new WeakMap<Element, Element>();

  constructor(
    private readonly doc: Document,
    private readonly opts: NavigatorOptions = {},
  ) {}

  get focused(): Element | null {
    if (this.current && !this.current.isConnected) this.current = null;
    return this.current;
  }

  candidates(): Element[] {
    const view = this.doc.defaultView;
    if (!view) return [];
    const selector = [FOCUSABLE, ...(this.opts.extraFocusable ?? [])].join(',');
    const scope = this.opts.scope?.() ?? null;
    const seen = new Set<Element>();
    for (const el of (scope ?? this.doc).querySelectorAll(selector)) {
      if (this.opts.ignoreWithin && el.closest(this.opts.ignoreWithin)) continue;
      if (!isVisible(el, view)) continue;
      seen.add(el);
    }
    // Drop wrappers that contain another candidate, so a card and the link
    // inside it do not both receive focus.
    return [...seen].filter((el) => ![...seen].some((other) => other !== el && el.contains(other)));
  }

  move(dir: Direction): boolean {
    const all = this.candidates();
    const from = this.focused;
    if (!from) {
      const i = pickInitial(all.map(toRect));
      return this.focus(all[i] ?? null);
    }
    const others = all.filter((el) => el !== from);
    const i = pickNext(toRect(from), others.map(toRect), dir);
    if (i === -1) return false;
    let target = others[i] ?? null;
    if (target && (dir === 'up' || dir === 'down')) target = this.rowEntry(target, from, others);
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

  /** Moves from a point on screen rather than from the focused element. Falls back to the first candidate. */
  moveFrom(point: { x: number; y: number }, dir: Direction): boolean {
    const all = this.candidates();
    const from: Rect = { left: point.x, top: point.y, right: point.x, bottom: point.y };
    const i = pickNext(from, all.map(toRect), dir);
    return this.focus(all[i === -1 ? pickInitial(all.map(toRect)) : i] ?? null);
  }

  focus(el: Element | null): boolean {
    if (!el) return false;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.current = el;
    const view = this.doc.defaultView;
    const row = view ? rowOf(el, view) : null;
    if (row) this.rowMemory.set(row, el);
    el.setAttribute(FOCUS_ATTR, '');
    if (el instanceof HTMLElement || 'focus' in el) {
      (el as HTMLElement).focus({ preventScroll: true });
    }
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
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
    this.current = null;
    this.opts.onFocusChange?.(null);
  }
}
