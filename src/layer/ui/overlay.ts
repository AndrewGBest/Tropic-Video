// The layer's own on-screen elements: focus ring and toast. They live in a
// closed shadow root so the site's styles cannot affect them and ours cannot
// leak out. Styles use a constructed stylesheet, which page CSP does not block.
import type { OskKey } from '../../shared/osk';

export const HOST_TAG = 'tropic-overlay';

const CSS = `
:host { all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
.ring {
  position: fixed; box-sizing: border-box; border: 4px solid #fff; border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(0,0,0,.85), 0 0 24px 4px rgba(255,255,255,.35);
  transition: left .09s ease-out, top .09s ease-out, width .09s ease-out, height .09s ease-out;
  display: none;
}
.toast {
  position: fixed; left: 50%; bottom: 8vh; transform: translateX(-50%);
  background: rgba(16,16,16,.94); color: #fff; font: 600 3.4vh/1.3 system-ui, sans-serif;
  padding: 2vh 3.4vh; border-radius: 1.4vh; max-width: 80vw; text-align: center; opacity: 0; transition: opacity .2s;
}
.toast.show { opacity: 1; }
.osk {
  position: fixed; left: 50%; bottom: 4vh; transform: translateX(-50%);
  display: none; grid-template-columns: repeat(10, 7.2vh); gap: 1vh;
  padding: 2.2vh; border-radius: 2vh; background: rgba(12,14,18,.96);
  box-shadow: 0 1vh 6vh rgba(0,0,0,.7);
}
.osk.show { display: grid; }
.osk .key {
  height: 7.2vh; border-radius: 1.2vh; background: #2a2f38; color: #f2f2f2;
  font: 600 3.6vh/7.2vh system-ui, sans-serif; text-align: center;
}
.osk .key.wide { font-size: 3vh; }
.osk .key.on { background: #fff; color: #111; box-shadow: 0 0 0 .5vh rgba(255,255,255,.35); }
`;

export class Overlay {
  private readonly ring: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly oskEl: HTMLElement;
  private target: Element | null = null;
  private toastTimer: number | undefined;
  private raf = 0;

  constructor(private readonly doc: Document) {
    const host = doc.createElement(HOST_TAG);
    const root = host.attachShadow({ mode: 'closed' });
    const view = doc.defaultView;
    const Sheet = view && 'CSSStyleSheet' in view ? (view as unknown as { CSSStyleSheet: typeof CSSStyleSheet }).CSSStyleSheet : undefined;
    if (Sheet && 'adoptedStyleSheets' in root) {
      const sheet = new Sheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    }
    this.ring = doc.createElement('div');
    this.ring.className = 'ring';
    this.toastEl = doc.createElement('div');
    this.toastEl.className = 'toast';
    this.toastEl.setAttribute('role', 'status');
    this.oskEl = doc.createElement('div');
    this.oskEl.className = 'osk';
    this.oskEl.setAttribute('role', 'group');
    this.oskEl.setAttribute('aria-label', 'On-screen keyboard');
    root.append(this.ring, this.toastEl, this.oskEl);
    doc.documentElement.append(host);
  }

  track(el: Element | null): void {
    this.target = el;
    const view = this.doc.defaultView;
    if (!view) return;
    view.cancelAnimationFrame(this.raf);
    const step = (): void => {
      const t = this.target;
      if (!t || !t.isConnected) {
        this.ring.style.display = 'none';
        return;
      }
      const r = t.getBoundingClientRect();
      const pad = 6;
      this.ring.style.display = 'block';
      this.ring.style.left = `${r.left - pad}px`;
      this.ring.style.top = `${r.top - pad}px`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
      this.raf = view.requestAnimationFrame(step);
    };
    step();
  }

  /** Draws the on-screen keyboard with one key highlighted; `null` hides it. */
  keyboard(rows: readonly (readonly OskKey[])[] | null, active?: { row: number; index: number }): void {
    if (!rows) {
      this.oskEl.classList.remove('show');
      return;
    }
    const keys: HTMLElement[] = [];
    rows.forEach((row, r) =>
      row.forEach((key, i) => {
        const el = this.doc.createElement('div');
        el.className = `key${key.span > 1 ? ' wide' : ''}${active && active.row === r && active.index === i ? ' on' : ''}`;
        el.style.gridColumn = `span ${key.span}`;
        el.textContent = key.label;
        keys.push(el);
      }),
    );
    this.oskEl.replaceChildren(...keys);
    this.oskEl.classList.add('show');
  }

  toast(message: string, ms = 2500): void {
    const view = this.doc.defaultView;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== undefined) view?.clearTimeout(this.toastTimer);
    this.toastTimer = view?.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
