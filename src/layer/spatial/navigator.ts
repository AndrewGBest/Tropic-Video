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
}

function isVisible(el: Element, view: Window): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const style = view.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  return true;
}

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export class SpatialNavigator {
  private current: Element | null = null;

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
    const seen = new Set<Element>();
    for (const el of this.doc.querySelectorAll(selector)) {
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
    return this.focus(others[i] ?? null);
  }

  focus(el: Element | null): boolean {
    if (!el) return false;
    this.current?.removeAttribute(FOCUS_ATTR);
    this.current = el;
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
