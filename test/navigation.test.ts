import { describe, expect, it } from 'vitest';
import { blockReason, blockedMessage, describeBlockedUrl, noticePageUrl } from '../src/main/navigation';

const live = { dev: false, automation: false };
const auto = { dev: false, automation: true };

describe('blockReason', () => {
  it('lets the service and its sign-in pages through', () => {
    expect(blockReason('https://www.primevideo.com/', live)).toBeNull();
    expect(blockReason('https://www.amazon.ca/ap/signin', auto)).toBeNull();
  });

  it('refuses other sites in every mode', () => {
    expect(blockReason('https://example.com/', live)).toBe('other-site');
    expect(blockReason('https://example.com/', auto)).toBe('other-site');
    expect(blockReason('not a url', live)).toBe('other-site');
  });

  it('refuses spend-looking pages only under automation', () => {
    const url = 'https://www.primevideo.com/offers/landing?ref_=abc';
    expect(blockReason(url, live)).toBeNull();
    expect(blockReason(url, auto)).toBe('automation-spend');
  });

  it('reports another site as such even when its path also looks like a spend flow', () => {
    expect(blockReason('https://example.com/checkout', auto)).toBe('other-site');
  });
});

describe('describeBlockedUrl', () => {
  it('keeps host and path, drops query, fragment and credentials', () => {
    expect(describeBlockedUrl('https://user:pw@www.example.com/offers/landing?token=SECRET#frag')).toBe(
      'www.example.com/offers/landing',
    );
  });

  it('truncates long paths', () => {
    const out = describeBlockedUrl(`https://example.com/${'a'.repeat(300)}`);
    expect(out.length).toBeLessThanOrEqual(81);
    expect(out.endsWith('…')).toBe(true);
  });

  it('never echoes an unparseable address', () => {
    expect(describeBlockedUrl('javascript:alert("SECRET")')).not.toContain('SECRET');
    expect(describeBlockedUrl('::::')).toBe('(unreadable address)');
  });
});

describe('blockedMessage', () => {
  it('has a distinct message per reason', () => {
    expect(blockedMessage('other-site')).toMatch(/another site/i);
    expect(blockedMessage('automation-spend')).toMatch(/automation/i);
  });
});

describe('noticePageUrl', () => {
  const decode = (url: string): string => decodeURIComponent(url.slice(url.indexOf(',') + 1));

  it('is a self-contained data: page with no scripts or remote resources', () => {
    const url = noticePageUrl('automation-spend', 'https://www.example.com/offers/landing?token=SECRET');
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    const page = decode(url);
    expect(page).toContain('www.example.com/offers/landing');
    expect(page).toContain('--automation');
    expect(page).toContain('Ctrl+Q');
    expect(page).not.toContain('SECRET');
    expect(page).not.toMatch(/<script|src=|href=|url\(/i);
  });

  it('escapes markup in the blocked address', () => {
    const page = decode(noticePageUrl('other-site', 'https://example.com/<img onerror=x>/"&'));
    expect(page).not.toMatch(/<img/i);
  });

  it('does not mention automation for an ordinary blocked site', () => {
    expect(decode(noticePageUrl('other-site', 'https://example.com/'))).not.toContain('--automation');
  });
});
