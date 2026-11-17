import { describe, expect, it } from 'vitest';
import {
  blockReason,
  blockedMessage,
  describeBlockedUrl,
  httpsUpgrade,
  isLoadFailure,
  noticePageUrl,
  offlinePageUrl,
  startingPageUrl,
  retryDelaySeconds,
} from '../src/main/navigation';

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

describe('httpsUpgrade', () => {
  it('gives the https form of an http address on the service', () => {
    expect(httpsUpgrade('http://www.primevideo.com/home?x=1', live)).toBe('https://www.primevideo.com/home?x=1');
  });
  it('does nothing for other sites, https addresses, credentials or nonsense', () => {
    expect(httpsUpgrade('http://example.com/home', live)).toBeNull();
    expect(httpsUpgrade('https://www.primevideo.com/home', live)).toBeNull();
    expect(httpsUpgrade('http://user:pw@www.primevideo.com/home', live)).toBeNull();
    expect(httpsUpgrade('not a url', live)).toBeNull();
  });
  it('does not upgrade into a page automation refuses', () => {
    expect(httpsUpgrade('http://www.primevideo.com/offers/landing', auto)).toBeNull();
    expect(httpsUpgrade('http://www.primevideo.com/offers/landing', live)).not.toBeNull();
  });
  it('leaves local fixtures in dev alone', () => {
    expect(httpsUpgrade('http://127.0.0.1:8080/x', { dev: true, automation: false })).toBeNull();
  });
});

describe('describeBlockedUrl', () => {
  it('keeps host and path, drops query, fragment and credentials', () => {
    expect(describeBlockedUrl('https://user:pw@www.example.com/offers/landing?token=SECRET#frag')).toBe(
      'www.example.com/offers/landing',
    );
  });

  it('shows the scheme when it is not https, since that may be the reason', () => {
    expect(describeBlockedUrl('http://www.example.com/home?x=1')).toBe('http://www.example.com/home');
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

describe('load failures', () => {
  const decode = (url: string): string => decodeURIComponent(url.slice(url.indexOf(',') + 1));

  it('treats network errors as failures, but not cancelled navigations or the notice pages themselves', () => {
    expect(isLoadFailure(-106, 'https://www.example.com/')).toBe(true);
    expect(isLoadFailure(-105, 'https://www.example.com/x')).toBe(true);
    expect(isLoadFailure(-3, 'https://www.example.com/')).toBe(false);
    expect(isLoadFailure(0, 'https://www.example.com/')).toBe(false);
    expect(isLoadFailure(-106, 'data:text/html,x')).toBe(false);
    expect(isLoadFailure(-106, 'about:blank')).toBe(false);
  });

  it('retries quickly at first and then every half minute', () => {
    expect([1, 2, 3, 6, 7, 50].map(retryDelaySeconds)).toEqual([5, 10, 15, 30, 30, 30]);
    expect(retryDelaySeconds(0)).toBe(5);
  });

  it('shows a self-contained page that says what happened and that it will retry', () => {
    const page = decode(offlinePageUrl('ERR_INTERNET_DISCONNECTED', 10));
    expect(page).toContain('Cannot reach the streaming service');
    expect(page).toContain('ERR_INTERNET_DISCONNECTED');
    expect(page).toContain('10 seconds');
    expect(page).toContain('Ctrl+Q');
    expect(page).not.toMatch(/<script|src=|href=|url\(/i);
  });

  it('cleans the reported description', () => {
    const page = decode(offlinePageUrl('<img onerror=x> "&', 5));
    expect(page).not.toMatch(/<img|onerror=x>/i);
    expect(decode(offlinePageUrl('', 5))).toContain('no details');
  });
});

describe('starting page', () => {
  it('says the app is starting and why it may take a moment', () => {
    const page = decodeURIComponent(startingPageUrl());
    expect(page).toContain('Starting');
    expect(page).toContain('first run');
  });
});

