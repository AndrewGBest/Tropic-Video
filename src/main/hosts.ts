// Which sites the window may navigate to. The app is a front end for one
// service; anything else is refused rather than opened.
const SERVICE_HOSTS = ['primevideo.com'];

// Sign-in is handled on the retailer's own account pages, which live on
// country domains. Only the registrable domains below are accepted.
const ACCOUNT_DOMAINS = new Set([
  'amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es',
  'amazon.nl', 'amazon.se', 'amazon.pl', 'amazon.com.be', 'amazon.com.tr', 'amazon.co.jp',
  'amazon.in', 'amazon.com.au', 'amazon.com.br', 'amazon.com.mx', 'amazon.sg', 'amazon.ae',
  'amazon.sa', 'amazon.eg', 'amazon.co.za', 'amazon.ie',
]);

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isAllowedUrl(raw: string, opts: { dev: boolean } = { dev: false }): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (opts.dev) {
    if (u.protocol === 'file:') return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (SERVICE_HOSTS.some((d) => matchesDomain(host, d))) return true;
  for (const d of ACCOUNT_DOMAINS) {
    if (matchesDomain(host, d)) return true;
  }
  return false;
}

/**
 * The browser identity we send: the embedded Chromium's own user agent with
 * the Electron and app tokens removed. It states the real engine, the real
 * version and the real OS. It never claims to be a TV, console or other OS.
 */
export function browserUserAgent(defaultUa: string): string {
  return defaultUa
    .replace(/\s?Electron\/\S+/g, '')
    .replace(/\s?tropic-video\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
