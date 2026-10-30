// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyzeCVEs, isAffected, ADVISORIES, LATEST_MAINLINE_VERSION, LATEST_STABLE_VERSION } from './cveAnalyzer.ts';
import { parseAdvisories } from '../../../scripts/update-nginx-advisories.mjs';

const adv = (id: string) => {
  const a = ADVISORIES.find((x) => x.id === id);
  assert.ok(a, `${id} missing from advisories.ts`);
  return a;
};
const ids = (input: string, config = '') => analyzeCVEs(input, config).matches.map((m) => m.advisory.id);

test('mainline releases between the stable fix and the mainline fix are affected', () => {
  // CVE-2026-1642: vulnerable 1.3.0-1.29.4, fixed 1.29.5+ and 1.28.2+
  assert.equal(isAffected('1.29.4', adv('CVE-2026-1642')), true);
  assert.equal(isAffected('1.29.5', adv('CVE-2026-1642')), false);
  assert.equal(isAffected('1.28.1', adv('CVE-2026-1642')), true);
  assert.equal(isAffected('1.28.2', adv('CVE-2026-1642')), false);
  // CVE-2025-23419: vulnerable 1.11.4-1.27.3, fixed 1.27.4+ and 1.26.3+
  assert.equal(isAffected('1.27.3', adv('CVE-2025-23419')), true);
  assert.equal(isAffected('1.26.3', adv('CVE-2025-23419')), false);
  // CVE-2022-41741: 1.23.1 mainline was missed before
  assert.equal(isAffected('1.23.1', adv('CVE-2022-41741')), true);
});

test('branches without a fix stay affected; explicit ranges are respected', () => {
  // 1.27.x got the HTTP/3 fix in 1.27.0, 1.26.x in 1.26.1; 1.25.x has none
  assert.equal(isAffected('1.25.5', adv('CVE-2024-31079')), true);
  assert.equal(isAffected('1.26.0', adv('CVE-2024-31079')), true);
  assert.equal(isAffected('1.26.1', adv('CVE-2024-31079')), false);
  assert.equal(isAffected('1.24.0', adv('CVE-2024-31079')), false); // before HTTP/3 existed
  // An old stable branch with no fix entry is still affected by a newer advisory
  assert.equal(isAffected('1.26.5', adv('CVE-2026-1642')), true);
});

test('latest releases have no known advisories', () => {
  assert.deepEqual(ids(`nginx/${LATEST_STABLE_VERSION}`), []);
  assert.deepEqual(ids(`nginx/${LATEST_MAINLINE_VERSION}`), []);
  assert.equal(analyzeCVEs(LATEST_STABLE_VERSION).riskStatus, 'no_known_cves');
});

test('entries that were wrong in the old hand-written database', () => {
  assert.equal(ADVISORIES.some((a) => a.id === 'CVE-2023-44488'), false); // libvpx, not NGINX
  assert.equal(adv('CVE-2009-3555').title.toLowerCase().includes('renegotiation'), true);
  for (const id of ['CVE-2024-24989', 'CVE-2024-24990', 'CVE-2024-31079', 'CVE-2024-32760', 'CVE-2024-34161', 'CVE-2024-35200', 'CVE-2025-53859']) adv(id);
});

test('conditions: unknown without config, detected or ruled out with config', () => {
  const noCfg = analyzeCVEs('1.25.3');
  const quic = noCfg.matches.find((m) => m.advisory.id === 'CVE-2024-24990');
  assert.equal(quic?.conditionStatus, 'unknown');
  assert.ok(noCfg.possible.length > 0);

  const withQuic = analyzeCVEs('1.25.3', 'http { server { listen 443 quic reuseport; listen 443 ssl; } }');
  assert.equal(withQuic.matches.find((m) => m.advisory.id === 'CVE-2024-24990')?.conditionStatus, 'detected');

  const plain = analyzeCVEs('1.25.3', 'http { server { listen 80; root /var/www; } }');
  assert.equal(plain.matches.find((m) => m.advisory.id === 'CVE-2024-24990')?.conditionStatus, 'not_detected');
  assert.equal(plain.matches.find((m) => m.advisory.id === 'CVE-2024-7347')?.conditionStatus, 'not_detected'); // mp4
});

test('feature detection reads directives, not substrings', () => {
  const r = analyzeCVEs('1.16.0', 'http { server { listen 443 ssl; http2 off; # listen 443 http2\n } }');
  assert.equal(r.matches.find((m) => m.advisory.id === 'CVE-2019-9511')?.conditionStatus, 'not_detected');
  const on = analyzeCVEs('1.16.0', 'http { server { listen 443 ssl http2; } }');
  assert.equal(on.matches.find((m) => m.advisory.id === 'CVE-2019-9511')?.conditionStatus, 'detected');
});

test('distribution packages get a backport note', () => {
  assert.match(analyzeCVEs('nginx version: nginx/1.18.0 (Ubuntu)').distroNote ?? '', /backport/);
  assert.equal(analyzeCVEs('nginx/1.18.0').distroNote, null);
});

test('support status and upgrade target', () => {
  assert.equal(analyzeCVEs('1.20.2').support, 'unsupported');
  assert.equal(analyzeCVEs('1.20.2').upgradeTarget, LATEST_STABLE_VERSION);
  assert.equal(analyzeCVEs('9.9.9').riskStatus, 'invalid');
  assert.equal(analyzeCVEs('hello').riskStatus, 'invalid');
});

test('the generator parses the advisory page format', () => {
  const html = `<ul><li><p>SSL upstream injection<br>Severity: medium<br><a href="https://example.test/a">Advisory</a><br>
    <a href="http://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2026-1642">CVE-2026-1642</a><br>
    Not vulnerable: 1.29.5+, 1.28.2+<br>Vulnerable: 1.3.0-1.29.4</p></li>
    <li><p>Windows thing<br>Severity: major<br>CVE-2011-4963<br>Not vulnerable: 1.3.1+, 1.2.1+<br>Vulnerable: nginx/Windows 0.7.52-1.3.0</p></li>
    <li><p>An error log data are not sanitized<br>Severity: none<br>CVE-2009-4487<br>Not vulnerable: none<br>Vulnerable: all</p></li></ul>`;
  const parsed = parseAdvisories(html);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    id: 'CVE-2026-1642', title: 'SSL upstream injection', severity: 'medium', advisoryUrl: 'https://example.test/a',
    notVulnerable: ['1.29.5', '1.28.2'], vulnerable: [{ from: '1.3.0', to: '1.29.4' }], windowsOnly: false,
  });
  assert.equal(parsed[1].windowsOnly, true);
});

test('advisories.ts is generated, not hand-edited', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/nginx-cve/advisories.ts'), 'utf8');
  assert.match(src, /GENERATED by scripts\/update-nginx-advisories\.mjs/);
  assert.ok(ADVISORIES.length >= 60);
});

test('every advisory title maps to the intended feature (no accidental substring hits)', () => {
  const r = analyzeCVEs('1.29.4', 'http { server { listen 443 ssl; root /x; } }');
  const status = (id: string) => r.matches.find((m) => m.advisory.id === id);
  // "Session forgery when using TLS session tickets" must not be treated as SSI ("SeSSIon")
  assert.equal(status('CVE-2026-97629')?.condition, 'TLS with session tickets (default on)');
  assert.equal(status('CVE-2026-97629')?.conditionStatus, 'detected');
  const off = analyzeCVEs('1.29.4', 'http { server { listen 443 ssl; ssl_session_tickets off; } }');
  assert.equal(off.matches.find((m) => m.advisory.id === 'CVE-2026-97629')?.conditionStatus, 'not_detected');
  // SSL session reuse (2025) needs TLS, not SSI
  assert.equal(analyzeCVEs('1.27.3').matches.find((m) => m.advisory.id === 'CVE-2025-23419')?.condition, 'TLS listener (listen ... ssl)');
});
