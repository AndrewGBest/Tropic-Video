// The layer's own on-screen elements: focus ring and toast. They live in a
// closed shadow root so the site's styles cannot affect them and ours cannot
// leak out. Styles use a constructed stylesheet, which page CSP does not block.
import type { OskKey } from '../../shared/osk';

export const HOST_TAG = 'tropic-overlay';

const CSS = `
:host {
  all: initial; position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible;
  pointer-events: none; z-index: 2147483647;
}
.ring {
  position: absolute; box-sizing: border-box; border: 4px solid #fff; border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(0,0,0,.85), 0 0 24px 4px rgba(255,255,255,.35);
  display: none;
}
.ring.bump-left { animation: bump-left .18s ease-out; }
.ring.bump-right { animation: bump-right .18s ease-out; }
.ring.bump-up { animation: bump-up .18s ease-out; }
.ring.bump-down { animation: bump-down .18s ease-out; }
.ring.pulse { animation: pulse .16s ease-out; }
@keyframes bump-left { 50% { transform: translateX(-1.4vh); } }
@keyframes bump-right { 50% { transform: translateX(1.4vh); } }
@keyframes bump-up { 50% { transform: translateY(-1.4vh); } }
@keyframes bump-down { 50% { transform: translateY(1.4vh); } }
@keyframes pulse { 50% { transform: scale(.96); } }
.about {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: none; width: 76vw; max-height: 84vh; overflow: hidden; box-sizing: border-box;
  padding: 4vh 5vh; border-radius: 2vh; background: rgba(12,14,18,.97); color: #f2f2f2;
  font: 2.9vh/1.45 system-ui, sans-serif; box-shadow: 0 1vh 6vh rgba(0,0,0,.7);
}
.about.show { display: block; }
.about h1 { font-size: 4.6vh; margin: 0 0 2vh; }
.about p { margin: 0 0 2.4vh; color: #c9ccd1; }
.about dl { display: grid; grid-template-columns: max-content 1fr; gap: .8vh 3vh; margin: 0 0 2.4vh; }
.about dt { font-weight: 700; }
.about dd { margin: 0; color: #c9ccd1; }
.about .hint { color: #8f949c; margin: 0; }
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
  private readonly aboutEl: HTMLElement;
  private readonly host: HTMLElement;
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
    this.aboutEl = doc.createElement('div');
    this.aboutEl.className = 'about';
    this.aboutEl.setAttribute('role', 'dialog');
    root.append(this.ring, this.toastEl, this.oskEl, this.aboutEl);
    doc.documentElement.append(host);
    this.host = host;
    // When the site puts its player in fullscreen, only that element and the
    // browser's top layer are drawn, so the ring and keyboard would vanish.
    // A manual popover lives in the top layer; showing it again after each
    // fullscreen change puts it back in front.
    if (typeof host.showPopover === 'function') {
      host.setAttribute('popover', 'manual');
      this.raise();
      doc.addEventListener('fullscreenchange', () => this.raise());
    }
  }

  private raise(): void {
    try {
      if (this.host.matches(':popover-open')) this.host.hidePopover();
      this.host.showPopover();
    } catch {
      // Not connected yet, or no popover support: the overlay still works outside fullscreen.
    }
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
      // In page coordinates: the host sits at the page's origin and scrolls
      // with it, so while the page scrolls the browser moves the ring with
      // its target in the same frame. Placed by script alone it trailed a
      // frame behind and seemed to bounce.
      this.ring.style.left = `${r.left + view.scrollX - pad}px`;
      this.ring.style.top = `${r.top + view.scrollY - pad}px`;
      this.ring.style.width = `${r.width + pad * 2}px`;
      this.ring.style.height = `${r.height + pad * 2}px`;
      this.raf = view.requestAnimationFrame(step);
    };
    step();
  }

  /** Shows the About and help panel; `null` hides it. */
  about(content: { title: string; notice: string; help: readonly (readonly [string, string])[] } | null): void {
    if (!content) {
      this.aboutEl.classList.remove('show');
      return;
    }
    const el = (tag: string, text: string, cls?: string): HTMLElement => {
      const node = this.doc.createElement(tag);
      node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const list = this.doc.createElement('dl');
    for (const [keys, what] of content.help) list.append(el('dt', keys), el('dd', what));
    this.aboutEl.replaceChildren(el('h1', content.title), el('p', content.notice), list, el('p', 'Press Back to close.', 'hint'));
    this.aboutEl.classList.add('show');
  }

  /**
   * A quick movement of the ring as feedback: a nudge toward an edge that
   * cannot be passed, or a squeeze when the focused control is pressed.
   */
  feedback(kind: 'left' | 'right' | 'up' | 'down' | 'press'): void {
    const name = kind === 'press' ? 'pulse' : `bump-${kind}`;
    const classes = this.ring.classList;
    classes.remove('bump-left', 'bump-right', 'bump-up', 'bump-down', 'pulse');
    // Reading a layout property restarts the animation when the same one repeats.
    void this.ring.offsetWidth;
    classes.add(name);
  }

  /** Draws the on-screen keyboard with one key highlighted; `null` hides it. */
  keyboard(rows: readonly (readonly OskKey[])[] | null, active?: { row: number; index: number }, submitLabel?: string): void {
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
        el.textContent = key.kind === 'submit' && submitLabel ? submitLabel : key.label;
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
