// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanConfig, generateHardenedConfig } from './analyzer.ts';
import { parseConfigs } from '../../app/tools/nginx-config-analyzer/v2/parser.ts';
import { runAnalysis } from '../../app/tools/nginx-config-analyzer/v2/scoring.ts';

const failing = (config: string) => scanConfig(config).results.filter((r) => r.status === 'fail').map((r) => r.rule.id);
const statusOf = (config: string, id: string) => scanConfig(config).results.find((r) => r.rule.id === id)?.status;

const HARDENED = generateHardenedConfig();

test('the generated hardened baseline passes every check', () => {
  const r = scanConfig(HARDENED);
  assert.deepEqual(failing(HARDENED), []);
  assert.equal(r.score, 100);
  assert.equal(r.status, 'PASS');
  assert.deepEqual(r.syntaxErrors, []);
});

test('the hardened baseline has no high/critical findings in the config analyzer either', () => {
  const a = runAnalysis(parseConfigs([{ id: 'm', filename: 'nginx.conf', content: HARDENED }]));
  assert.deepEqual(a.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => f.title), []);
});

test('TLS versions are compared as whole tokens', () => {
  assert.equal(statusOf(HARDENED.replace('TLSv1.2 TLSv1.3', 'TLSv1.2'), 'TLS-3'), 'pass');
  assert.equal(statusOf(HARDENED.replace('TLSv1.2 TLSv1.3', 'TLSv1.3'), 'TLS-3'), 'pass');
  assert.equal(statusOf(HARDENED.replace('TLSv1.2 TLSv1.3', 'TLSv1.1 TLSv1.2'), 'TLS-3'), 'fail');
});

test('comments are ignored', () => {
  assert.equal(statusOf(HARDENED.replace('server_tokens off;', '# server_tokens off;'), 'DISC-1'), 'fail');
  assert.equal(statusOf(HARDENED.replace('limit_conn perip 20;', '# autoindex on;'), 'DISC-2'), 'pass');
  assert.equal(statusOf(HARDENED.replace('add_header Strict-Transport-Security', '# add_header Strict-Transport-Security'), 'TLS-5'), 'fail');
});

test('directive values are checked, not just presence', () => {
  assert.equal(statusOf(HARDENED.replace('gzip            on;', 'gzip off;'), 'PERF-1'), 'fail');
  assert.equal(statusOf(HARDENED.replace('server_tokens off;', 'server_tokens on;'), 'DISC-1'), 'fail');
});

test('listen with an address still counts as HTTPS; several directives per line are parsed', () => {
  const r = HARDENED.replace('listen      443 ssl;', 'listen 10.0.0.1:443 ssl;');
  assert.equal(statusOf(r, 'TLS-1'), 'pass');
  assert.equal(statusOf(HARDENED.replace('sendfile          on;\n    tcp_nopush        on;', 'tcp_nopush on; sendfile on;'), 'PERF-2'), 'pass');
});

test('the recommended dotfile block is recognized; pure proxies are not applicable', () => {
  assert.equal(statusOf(HARDENED, 'DISC-3'), 'pass');
  assert.equal(statusOf(`server { listen 80; location / { proxy_pass http://b; } }`, 'DISC-3'), 'n/a');
  assert.equal(statusOf(`server { listen 80; root /x; location ~ \\.php$ { fastcgi_pass unix:/run/php.sock; } }`, 'DISC-3'), 'fail');
});

test('add_header in a location that drops security headers fails HDR-6 with the line', () => {
  const cfg = HARDENED.replace('location /static/ {\n            root /var/www;', 'location /static/ {\n            add_header Cache-Control "public";\n            root /var/www;');
  const r = scanConfig(cfg).results.find((x) => x.rule.id === 'HDR-6');
  assert.equal(r?.status, 'fail');
  assert.match(r!.refs[0].label, /strict-transport-security/);
  assert.equal(cfg.split('\n')[r!.refs[0].line - 1].trim(), 'add_header Cache-Control "public";');
});

test('insecure sample: expected failures, line numbers point at directives', () => {
  const sample = `http {
    server_tokens on;
    server {
        listen 80;
        autoindex on;
        location / {
            proxy_pass http://127.0.0.1:3000;
        }
    }
}`;
  const r = scanConfig(sample);
  const ids = r.results.filter((x) => x.status === 'fail').map((x) => x.rule.id);
  for (const id of ['DISC-1', 'DISC-2', 'TLS-1', 'PROXY-1', 'DISC-4']) assert.ok(ids.includes(id), id);
  assert.equal(r.results.find((x) => x.rule.id === 'DISC-1')?.refs[0].line, 2);
  assert.equal(r.results.find((x) => x.rule.id === 'DISC-2')?.refs[0].line, 5);
  assert.equal(r.status, 'FAIL');
});

test('rules that do not apply are n/a and do not cost points', () => {
  const r = scanConfig(`server { listen 80; location / { return 200 "ok"; } }`);
  assert.equal(r.results.find((x) => x.rule.id === 'TLS-5')?.status, 'n/a');
  assert.equal(r.results.find((x) => x.rule.id === 'LOG-2')?.status, 'n/a');
  assert.ok(r.snippet);
});

test('empty input and syntax errors', () => {
  assert.equal(scanConfig('').status, 'EMPTY');
  assert.equal(scanConfig('   # only a comment').status, 'EMPTY');
  const broken = scanConfig(HARDENED.replace(/\}\s*$/, ''));
  assert.ok(broken.syntaxErrors.length > 0);
  assert.ok(broken.score <= 49);
});

test('a single high issue rules out a "Good" label', () => {
  const r = scanConfig(HARDENED.replace('add_header Strict-Transport-Security', '# add_header Strict-Transport-Security'));
  assert.equal(r.counts.high, 1);
  assert.equal(r.score, 69);
  assert.equal(r.riskLabel, 'Needs Improvement');
});
