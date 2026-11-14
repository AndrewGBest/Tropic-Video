// The layer's own on-screen elements: focus ring and toast. They live in a
// closed shadow root so the site's styles cannot affect them and ours cannot
// leak out. Styles use a constructed stylesheet, which page CSP does not block.
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
`;

export class Overlay {
  private readonly ring: HTMLElement;
  private readonly toastEl: HTMLElement;
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
    root.append(this.ring, this.toastEl);
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

  toast(message: string, ms = 2500): void {
    const view = this.doc.defaultView;
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    if (this.toastTimer !== undefined) view?.clearTimeout(this.toastTimer);
    this.toastTimer = view?.setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
