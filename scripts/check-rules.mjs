// Mechanical enforcement of the Hard rules in CLAUDE.md. This catches the
// obvious slips; it does not replace reading the rules.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const files = execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const problems = [];
const fail = (rule, file, why) => problems.push(`rule ${rule}: ${file}: ${why}`);

// Rule 1: no binaries or fonts that could be someone else's, no CDM.
const BANNED_EXT = new Set(['.so', '.dll', '.dylib', '.ttf', '.otf', '.woff', '.woff2', '.mp4', '.webm', '.mp3', '.wav', '.har', '.crx']);
// Rule 9: nothing captured from a session.
const BANNED_NAMES = /(^|\/)(cookies?(\.txt|\.json|\.sqlite)?|Login Data|Local State|spike-report\.json)$/i;

const TEXT_EXT = new Set(['.ts', '.mjs', '.js', '.json', '.css', '.html', '.yml', '.yaml']);
const SELF = 'scripts/check-rules.mjs';

const CODE_CHECKS = [
  // Rule 2
  [2, /libwidevine|widevinecdm|content_decryption_module|pywidevine|license_?server|getLicense|keyStatuses|MediaKeySession\b.*\.update/i, 'touches the CDM or licence exchange'],
  // Rule 3
  [3, /SMART-TV|SmartTV|Tizen|Web0S|webOS|BRAVIA|AFT[A-Z]|Android TV|PlayStation|Xbox|Cobalt\/|Windows NT|Macintosh|CrOS/, 'looks like a spoofed device or OS identity'],
  // Rule 4
  [4, /onBeforeSendHeaders|onHeadersReceived|onBeforeRequest|interceptBuffer|registerHttpProtocol|setProxy|adblock|ad-?block|skipAd|sponsorblock/i, 'modifies or filters the service\'s traffic'],
  [4, /\.(currentTime|playbackRate)\s*[-+]?=(?!=)|\.(play|pause)\(\)/, 'controls the site\'s video element directly instead of sending input'],
  // Rule 11
  [11, /sentry|google-analytics|gtag\(|posthog|mixpanel|crashReporter\.start/i, 'telemetry or crash upload'],
  // Rule 12
  [12, /contextIsolation:\s*false|sandbox:\s*false|nodeIntegration:\s*true|webSecurity:\s*false|exposeInMainWorld|allowRunningInsecureContent/, 'weakens the shell sandbox'],
];

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (BANNED_EXT.has(ext)) fail(1, file, `binary or font file type ${ext} is not allowed in the repo`);
  if (BANNED_NAMES.test(file)) fail(9, file, 'looks like session data');
  if (file === SELF || file.startsWith('docs/') || file.endsWith('.md') || file === 'package-lock.json') continue;
  if (!TEXT_EXT.has(ext)) continue;
  const inTests = file.startsWith('test/');
  const text = readFileSync(file, 'utf8');
  for (const [rule, pattern, why] of CODE_CHECKS) {
    // Tests may name forbidden things in order to assert they are rejected.
    if (inTests && rule !== 12) continue;
    const m = pattern.exec(text);
    if (m) fail(rule, file, `${why} (matched "${m[0]}")`);
  }
}

// Rule 5: branding.
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [key, val] of Object.entries({
  name: pkg.name,
  productName: pkg.build?.productName,
  appId: pkg.build?.appId,
  artifactName: pkg.build?.artifactName,
})) {
  if (typeof val === 'string' && /prime|amazon|amzn|fire\s?tv/i.test(val)) {
    fail(5, 'package.json', `${key} contains a trademark: "${val}"`);
  }
}

// Rule 7: selectors need evidence. An adapter with selectors must be marked verified.
for (const file of files.filter((f) => /^adapters\/.+\.json$/.test(f))) {
  const a = JSON.parse(readFileSync(file, 'utf8'));
  const count = Object.values(a.selectors ?? {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  if (count > 0 && a.verified !== true) fail(7, file, 'has selectors but is not marked verified');
  if (count > 0 && !(a.revision > 0)) fail(7, file, 'has selectors but revision was not bumped');
}

if (problems.length) {
  console.error(`Hard-rule check failed:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Hard-rule check passed (${files.length} files).`);
