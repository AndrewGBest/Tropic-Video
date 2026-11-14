// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { installPurchaseGuard, isSpendControl, looksLikeSpendUrl } from '../src/layer/guard/purchase-guard';
import { buildOutline, maskIdentifier, sanitizeUrl } from '../src/layer/diagnostics/outline';
import { parseAdapter } from '../src/layer/adapter/adapter';
import { browserUserAgent, isAllowedUrl } from '../src/main/hosts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aboutTitle, NOTICE } from '../src/shared/about';

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.body;
}

describe('purchase guard', () => {
  it.each([
    '<button id="t">Rent HD $4.99</button>',
    '<button id="t">Buy movie</button>',
    '<button id="t">Go ad free</button>',
    '<a id="t" href="/x">Start your free trial</a>',
    '<button><span id="t">Subscribe</span></button>',
    '<div role="button" id="t" aria-label="Pre-order now"></div>',
    '<a id="t" href="/gp/buy/spc/handlers/display.html">Continue</a>',
    '<input id="t" type="submit" value="Place your order">',
    '<form action="/checkout/confirm"><button id="t">Continue</button></form>',
  ])('blocks %s', (markup) => {
    html(markup);
    expect(isSpendControl(document.getElementById('t')!)).toBe(true);
  });

  it.each([
    '<button id="t">Play</button>',
    '<button id="t">Resume Episode 3</button>',
    '<a id="t" href="/detail/abc">More details</a>',
    '<button id="t">Add to Watchlist</button>',
    '<button id="t">Subtitles</button>',
  ])('allows %s', (markup) => {
    html(markup);
    expect(isSpendControl(document.getElementById('t')!)).toBe(false);
  });

  it('honours adapter selectors', () => {
    html('<div class="offer"><button id="t">Continue</button></div>');
    expect(isSpendControl(document.getElementById('t')!, ['.offer'])).toBe(true);
  });

  it('stops a click before the page sees it', () => {
    html('<button id="buy">Buy now</button><button id="play">Play</button>');
    const blocked = vi.fn();
    const pageHandler = vi.fn();
    document.getElementById('buy')!.addEventListener('click', pageHandler);
    document.getElementById('play')!.addEventListener('click', pageHandler);
    const stop = installPurchaseGuard(document, [], blocked);
    document.getElementById('buy')!.click();
    expect(pageHandler).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledTimes(1);
    document.getElementById('play')!.click();
    expect(pageHandler).toHaveBeenCalledTimes(1);
    stop();
    document.getElementById('buy')!.click();
    expect(pageHandler).toHaveBeenCalledTimes(2);
  });

  it('flags spend URLs and refuses unparseable ones', () => {
    expect(looksLikeSpendUrl('https://www.example.com/gp/buy/thing')).toBe(true);
    expect(looksLikeSpendUrl('https://www.example.com/detail/123')).toBe(false);
    expect(looksLikeSpendUrl('http://[bad')).toBe(true);
  });
});

describe('identifier masking', () => {
  it('keeps ordinary structural identifiers', () => {
    for (const id of ['card', 'pv-nav-home', 'dp-atf-play-button', 'thumbUpOutlined', 'DVWebNode-detail-wrapper', 'ep-title-episode-3']) {
      expect(maskIdentifier(id)).toBe(id);
    }
  });

  // Found on the live site: a test id of the form active-profile-<profile name>.
  it.each([
    ['active-profile-Jane Doe', 'active-profile-:text'],
    ['active-profile-jane', 'active-profile-:text'],
    ['profile-avatar', 'profile-:text'],
    ['nav-merch-BlackVoices', 'nav-merch-:text'],
    ['greeting Jane', ':text'],
    ['Jane Doe', ':text'],
    ['user_jdoe', 'user-:text'],
  ])('masks %s', (input, expected) => {
    expect(maskIdentifier(input)).toBe(expected);
  });

  it('still masks id-like tokens', () => {
    expect(maskIdentifier('0ABCD12345XYZ')).toBe(':id');
    expect(maskIdentifier('card-0ABCD12345XYZ Jane')).toBe(':text');
  });

  it('is applied to ids and test ids in the outline', () => {
    const out = buildOutline(
      html('<div id="active-profile-Jane" data-testid="active-profile-Jane Doe" data-automation-id="account-jdoe"></div>'),
    );
    expect(out).not.toMatch(/Jane|Doe|jdoe/);
    expect(out).toContain('[data-testid="active-profile-:text"]');
  });
});

describe('diagnostics outline', () => {
  const SECRET = 'The Secret Show Title';
  const markup = `
    <main data-testid="home">
      <section aria-label="${SECRET} row">
        <a href="/detail/0ABCD12345XYZ/ref=${SECRET}" class="card amzn1-dv-gti-abc123456">
          <img src="https://img.example/${SECRET}.jpg" alt="${SECRET}">
          <span>${SECRET}</span>
        </a>
        <button role="button" aria-expanded="false" title="${SECRET}">Play ${SECRET}</button>
        <input type="search" placeholder="${SECRET}" value="${SECRET}" name="q">
      </section>
      <script>var x = "${SECRET}"</script>
      <div id="profile-JaneDoe-9988776655">Jane Doe</div>
    </main>`;

  it('never includes text, labels, links, image sources or values', () => {
    const out = buildOutline(html(markup));
    expect(out).not.toContain('Secret');
    expect(out).not.toContain('Jane');
    expect(out).not.toContain('img.example');
    expect(out).not.toContain('0ABCD12345XYZ');
    expect(out).not.toContain('9988776655');
    expect(out).not.toContain('script');
  });

  it('keeps the structure needed to write selectors', () => {
    const out = buildOutline(html(markup));
    expect(out).toContain('main[data-testid="home"]');
    expect(out).toContain('a.card.:id[href:');
    expect(out).toContain('button[role="button"][aria-expanded="false"]');
    expect(out).toContain('input[type="search"]');
    expect(out).toMatch(/\{text:\d+\}/);
  });

  it('reduces URLs to a path shape', () => {
    expect(sanitizeUrl('https://www.primevideo.com/detail/0ABCD12345XYZ/ref=x?autoplay=1&t=99')).toBe(
      'https://<host>/detail/:id/ref=x',
    );
  });
});

describe('adapter parsing', () => {
  it('drops invalid selectors and unknown schemas', () => {
    const a = parseAdapter(
      { schema: 1, id: 'x', revision: 3, verified: true, selectors: { extraFocusable: ['.ok', '>>bad<<', 42, ''] } },
      document,
    );
    expect(a.selectors.extraFocusable).toEqual(['.ok']);
    expect(a.revision).toBe(3);
    expect(parseAdapter({ schema: 2, selectors: { extraFocusable: ['.x'] } }).selectors.extraFocusable).toEqual([]);
    expect(parseAdapter(null).id).toBe('none');
  });
});

describe('navigation allowlist', () => {
  it('allows the service and its account pages over https only', () => {
    expect(isAllowedUrl('https://www.primevideo.com/')).toBe(true);
    expect(isAllowedUrl('https://www.amazon.ca/ap/signin')).toBe(true);
    expect(isAllowedUrl('http://www.primevideo.com/')).toBe(false);
  });

  it('rejects look-alikes and other sites', () => {
    expect(isAllowedUrl('https://primevideo.com.evil.example/')).toBe(false);
    expect(isAllowedUrl('https://evilprimevideo.com/')).toBe(false);
    expect(isAllowedUrl('https://user:pw@www.primevideo.com/')).toBe(false);
    expect(isAllowedUrl('https://example.com/')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
  });

  it('allows local fixtures only in dev mode', () => {
    expect(isAllowedUrl('file:///tmp/fixture.html', { dev: true })).toBe(true);
    expect(isAllowedUrl('http://localhost:5173/', { dev: true })).toBe(true);
    expect(isAllowedUrl('http://example.com/', { dev: true })).toBe(false);
  });
});

describe('user agent', () => {
  it('removes app tokens and keeps the real engine and OS', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) tropic-video/0.0.1 Chrome/146.0.0.0 Electron/44.10.1 Safari/537.36';
    expect(browserUserAgent(ua)).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    );
  });
});

describe('about panel', () => {
  const flat = (text: string): string => text.replace(/^> ?/gm, '').replace(/\s+/g, ' ');

  it('carries the required notice, word for word as in the guardrails and the README', () => {
    for (const file of ['docs/LEGAL-GUARDRAILS.md', 'README.md']) {
      expect(flat(readFileSync(join(__dirname, '..', file), 'utf8'))).toContain(NOTICE);
    }
  });

  it('shows the version when it has one', () => {
    expect(aboutTitle('0.0.1')).toBe('Tropic Video 0.0.1');
    expect(aboutTitle(undefined)).toBe('Tropic Video');
  });
});
