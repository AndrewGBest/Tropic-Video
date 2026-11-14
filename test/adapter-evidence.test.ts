// @vitest-environment jsdom
// Hard rule 7: every selector in the adapter must be shown by an outline
// captured from the live site. This test rebuilds a DOM from the trimmed
// outlines in test/fixtures/outlines/ and checks each selector against it.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAdapter } from '../src/layer/adapter/adapter';
import { isSpendControl } from '../src/layer/guard/purchase-guard';

const DIR = join(__dirname, 'fixtures/outlines');
const adapter = parseAdapter(JSON.parse(readFileSync(join(__dirname, '../adapters/primevideo.json'), 'utf8')));

/** Rebuilds elements from outline lines: `tag#id.class[attr="v"][attr:len]{text:len}`. */
function fromOutline(name: string): HTMLElement {
  const root = document.createElement('div');
  const stack: Array<{ depth: number; el: Element }> = [{ depth: -1, el: root }];
  for (const line of readFileSync(join(DIR, name), 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const depth = (line.length - line.trimStart().length) / 2;
    const text = line.trim();
    const headEnd = text.search(/[[{]/);
    const head = headEnd < 0 ? text : text.slice(0, headEnd);
    const [tagAndId = '', ...classes] = head.split('.');
    const [tag = 'div', id] = tagAndId.split('#');
    const el = document.createElement(tag);
    if (id) el.id = id;
    if (classes.length) el.setAttribute('class', classes.join(' '));
    for (const m of text.matchAll(/\[([a-z-]+)(?:="([^"]*)"|:(\d+))\]/g)) {
      el.setAttribute(m[1]!, m[2] ?? 'x'.repeat(Number(m[3])));
    }
    const t = /\{text:(\d+)\}/.exec(text);
    if (t) el.textContent = 'x'.repeat(Number(t[1]));
    while (stack[stack.length - 1]!.depth >= depth) stack.pop();
    stack[stack.length - 1]!.el.append(el);
    stack.push({ depth, el });
  }
  return root;
}

describe('the adapter is backed by outlines', () => {
  it('fixtures carry structure only', () => {
    for (const name of readdirSync(DIR)) {
      const body = readFileSync(join(DIR, name), 'utf8')
        .split('\n')
        .filter((l) => !l.startsWith('#'))
        .join('\n');
      // No free text can survive: outline lines have no spaces except indentation.
      expect(body.split('\n').every((l) => !l.trim().includes(' '))).toBe(true);
      expect(body).not.toMatch(/https?:|profile-[A-Za-z]/);
    }
  });

  it('search: the opener is the button next to the hidden dropdown, and the input is inside it', () => {
    const dom = fromOutline('home-search.txt');
    const opener = dom.querySelectorAll(adapter.selectors.searchOpen[0]!);
    expect(opener).toHaveLength(1);
    expect(opener[0]!.tagName).toBe('BUTTON');
    const input = dom.querySelector(adapter.selectors.searchInput[0]!);
    expect(input?.getAttribute('type')).toBe('search');
    expect(input?.closest('[data-testid="pv-nav-search-dropdown"]')).not.toBeNull();
  });

  it('carousel arrows: the top carousel and each card row have one previous and one next button beside their list', () => {
    const dom = fromOutline('home-carousels.txt');
    const prev = adapter.selectors.rowPrev[0]!;
    const next = adapter.selectors.rowNext[0]!;
    for (const strip of ['[data-testid="top-hero-wrapper"]', '[data-testid="standard-carousel"]']) {
      const el = dom.querySelector(strip)!;
      expect(el.querySelectorAll(prev)).toHaveLength(1);
      expect(el.querySelectorAll(next)).toHaveLength(1);
      expect(el.querySelector(next)!.parentElement!.querySelector('ul')).not.toBeNull();
    }
  });

  it('purchase controls: the Store banner button is guarded whatever its wording', () => {
    const dom = fromOutline('store-banner.txt');
    document.body.replaceChildren(dom);
    const button = dom.querySelector(adapter.selectors.purchaseControls[1]!);
    expect(button?.tagName).toBe('BUTTON');
    // Judged by the selector alone: the fixture's text is only filler of the right length.
    expect(isSpendControl(button!.querySelector('strong')!, [])).toBe(false);
    expect(isSpendControl(button!.querySelector('strong')!, adapter.selectors.purchaseControls)).toBe(true);
  });

  it('player root: holds no video before playback and the player video during it; the trailer is outside', () => {
    const sel = adapter.selectors.playerRoot[0]!;
    const before = fromOutline('detail-before-play.txt');
    expect(before.querySelectorAll(sel)).toHaveLength(1);
    expect(before.querySelector(`${sel} video`)).toBeNull();
    expect(before.querySelectorAll('video')).toHaveLength(1);

    const playing = fromOutline('detail-playing.txt');
    expect(playing.querySelectorAll(`${sel} video`)).toHaveLength(1);
    expect(playing.querySelectorAll('video')).toHaveLength(2);
    expect(playing.querySelector('[data-testid="draper-player"] video')?.closest(sel)).toBeNull();
  });

  it('purchase controls: the upsell link is guarded and the play button is not', () => {
    const dom = fromOutline('detail-before-play.txt');
    document.body.replaceChildren(dom);
    const upsell = dom.querySelector(adapter.selectors.purchaseControls[0]!);
    expect(upsell?.tagName).toBe('A');
    expect(isSpendControl(upsell!.firstElementChild!, adapter.selectors.purchaseControls)).toBe(true);
    const play = dom.querySelector('[data-testid="dp-atf-play-button"]')!;
    expect(isSpendControl(play, adapter.selectors.purchaseControls)).toBe(false);
  });
});
