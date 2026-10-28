// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseConfigs } from './parser.ts';
import { runAnalysis } from './scoring.ts';
import { SAMPLE_CONFIGS } from './samples.ts';
import type { AnalysisResult } from './types.ts';

function analyze(...contents: string[]): AnalysisResult {
  const files = contents.map((content, i) => ({ id: `f${i}`, filename: i === 0 ? 'nginx.conf' : `conf.d/f${i}.conf`, content }));
  return runAnalysis(parseConfigs(files));
}

function ids(result: AnalysisResult): string[] {
  return result.findings.map((f) => f.id.replace(/-\d+$/, ''));
}

const TLS_SERVER = (protocols: string) => `server {
  listen 443 ssl;
  server_name a.com;
  ssl_certificate a.pem;
  ssl_certificate_key a.key;
  ssl_protocols ${protocols};
  root /var/www;
}`;

test('legacy TLS rule matches whole protocol tokens only', () => {
  assert.ok(!ids(analyze(TLS_SERVER('TLSv1.2 TLSv1.3'))).includes('sec-legacy-tls'));
  assert.ok(!ids(analyze(TLS_SERVER('TLSv1.3'))).includes('sec-legacy-tls'));
  assert.ok(ids(analyze(TLS_SERVER('TLSv1 TLSv1.2'))).includes('sec-legacy-tls'));
  assert.ok(ids(analyze(TLS_SERVER('TLSv1.1 TLSv1.2'))).includes('sec-legacy-tls'));
});

test('ssl_protocols set at http level is inherited', () => {
  const r = analyze(`http { ssl_protocols TLSv1.2; server { listen 443 ssl; root /x; } }`);
  assert.ok(!ids(r).includes('sec-ssl-protocols-missing'));
});

test('excluded ciphers (!aNULL:!MD5) are not reported as weak', () => {
  const r = analyze(`server { listen 443 ssl; ssl_ciphers HIGH:!aNULL:!MD5; }`);
  assert.ok(!ids(r).includes('sec-weak-ciphers'));
});

test('built-in secure sample scores well with no high or critical findings', () => {
  const r = runAnalysis(parseConfigs(SAMPLE_CONFIGS['secure-https'].files));
  const severe = r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  assert.deepEqual(severe.map((f) => f.title), []);
  assert.ok(r.overallScore >= 90, `score ${r.overallScore}`);
});

test('redirect-only server is not checked for headers or dotfiles', () => {
  const r = analyze(`server { listen 80; server_name a.com; return 301 https://$host$request_uri; }`);
  assert.deepEqual(r.findings.filter((f) => f.category === 'Security'), []);
});

test('dotfile rule: regex deny recognized, pure proxies skipped, \\.php does not count', () => {
  assert.ok(!ids(analyze(`server { listen 80; root /x; location ~ /\\.(?!well-known) { deny all; } }`)).includes('sec-dotfiles'));
  assert.ok(!ids(analyze(`server { listen 80; location / { proxy_pass http://b; } }`)).includes('sec-dotfiles'));
  assert.ok(ids(analyze(`server { listen 80; root /x; location ~ \\.php$ { fastcgi_pass unix:/run/php.sock; } }`)).includes('sec-dotfiles'));
});

test('add_header in a location that drops inherited security headers is reported', () => {
  const r = analyze(`server {
    listen 443 ssl;
    root /x;
    add_header Strict-Transport-Security "max-age=1" always;
    location / { add_header Cache-Control no-store; }
  }`);
  const f = r.findings.find((x) => x.id.startsWith('sec-header-inheritance'));
  assert.ok(f);
  assert.equal(f.severity, 'high');
  assert.match(f.evidence, /strict-transport-security/);
});

test('http-level headers are lost when server declares its own add_header', () => {
  const r = analyze(`http {
    add_header X-Content-Type-Options nosniff always;
    server { listen 80; root /x; add_header X-Frame-Options DENY always; }
  }`);
  assert.ok(ids(r).includes('sec-header-inheritance'));
  // reported once via inheritance, not again as "missing"
  assert.ok(!ids(r).includes('sec-xcto'));
});

test('add_header_inherit merge keeps parent headers', () => {
  const r = analyze(`server {
    listen 80; root /x;
    add_header X-Content-Type-Options nosniff always;
    location / { add_header_inherit merge; add_header Cache-Control no-store; }
  }`);
  assert.ok(!ids(r).includes('sec-header-inheritance'));
});

test('proxy headers set at server level are inherited and grouped per server', () => {
  const ok = analyze(`server {
    listen 80;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    location / { proxy_pass http://b; }
  }`);
  assert.ok(!ids(ok).includes('rp-forward-headers'));

  const bad = analyze(`server { listen 80; location / { proxy_pass http://b; } location /api { proxy_pass http://b; } }`);
  assert.equal(ids(bad).filter((i) => i === 'rp-forward-headers').length, 1);
});

test('alias off-by-slash traversal', () => {
  assert.ok(ids(analyze(`server { listen 80; location /files { alias /data/files/; } }`)).includes('sec-alias-traversal'));
  assert.ok(!ids(analyze(`server { listen 80; location /files/ { alias /data/files/; } }`)).includes('sec-alias-traversal'));
});

test('client-controlled proxy_pass host is critical SSRF', () => {
  const r = analyze(`server { listen 80; resolver 1.1.1.1; location / { proxy_pass http://$arg_target; } }`);
  const f = r.findings.find((x) => x.id.startsWith('sec-proxy-ssrf'));
  assert.equal(f?.severity, 'critical');
  assert.ok(!ids(r).includes('rp-proxy-pass-variable'));
});

test('proxy_pass with a path variable needs a resolver only for DNS names', () => {
  const upstream = analyze(`http { upstream backend { server 10.0.0.1; } server { listen 80; location / { proxy_pass http://backend$request_uri; } } }`);
  assert.ok(!ids(upstream).includes('rp-proxy-pass-variable'));
  assert.ok(!ids(upstream).includes('sec-proxy-ssrf'));
  assert.ok(!ids(analyze(`server { listen 80; location / { proxy_pass http://127.0.0.1:8080$request_uri; } }`)).includes('rp-proxy-pass-variable'));
  assert.ok(ids(analyze(`server { listen 80; location / { proxy_pass http://api.internal$request_uri; } }`)).includes('rp-proxy-pass-variable'));
});

test('$uri in redirect is CRLF injection, $request_uri is fine', () => {
  assert.ok(ids(analyze(`server { listen 80; location / { return 302 https://a.com$uri; } }`)).includes('sec-crlf-uri'));
  assert.ok(!ids(analyze(`server { listen 80; location / { return 302 https://a.com$request_uri; } }`)).includes('sec-crlf-uri'));
});

test('if in location with proxy_pass is flagged, return-only if is not', () => {
  assert.ok(ids(analyze(`server { listen 80; location / { if ($a) { proxy_pass http://b; } } }`)).includes('maint-if-in-location'));
  assert.ok(!ids(analyze(`server { listen 80; location / { if ($a) { return 403; } } }`)).includes('maint-if-in-location'));
});

test('login endpoint without limit_req', () => {
  assert.ok(ids(analyze(`server { listen 80; root /x; location /login { proxy_pass http://b; } }`)).includes('sec-rate-limit'));
  assert.ok(!ids(analyze(`server { listen 80; root /x; limit_req zone=a; location /login { proxy_pass http://b; } }`)).includes('sec-rate-limit'));
});

test('deprecated listen http2 is reported', () => {
  const r = analyze(`server { listen 443 ssl http2; }`);
  assert.ok(ids(r).includes('maint-listen-http2'));
  assert.ok(!ids(r).includes('perf-http2'));
});

test('snippet mode skips main-context rules', () => {
  const r = analyze(`server { listen 80; location / { proxy_pass http://b; } }`);
  assert.ok(!ids(r).includes('perf-worker-processes'));
  assert.ok(!ids(r).includes('rel-error-log'));
  assert.ok(ids(r).includes('maint-snippet-mode'));
});

test('syntax errors are reported', () => {
  const r = analyze(`server {\n listen 80;\n location / {\n  proxy_pass http://x\n }\n`);
  const syntax = r.parseErrors.filter((e) => e.kind === 'syntax').map((e) => e.message);
  assert.ok(syntax.some((m) => m.includes("Missing ';'")), syntax.join('|'));
  assert.ok(syntax.some((m) => m.includes('never closed')), syntax.join('|'));
  assert.ok(analyze(`server { listen 80; } }`).parseErrors.some((e) => e.message.includes('no matching')));
});

test('included servers inherit from the including http block', () => {
  const r = analyze(
    `http { add_header X-Content-Type-Options nosniff always; include conf.d/f1.conf; }`,
    `server { listen 80; root /x; }`,
  );
  assert.ok(!ids(r).includes('sec-xcto'));
});

test('overall score is a weighted average, capped by severe findings', () => {
  const r = runAnalysis(parseConfigs(SAMPLE_CONFIGS['bad-production'].files));
  assert.ok(r.overallScore > 0 && r.overallScore <= 64, `score ${r.overallScore}`);
  const broken = analyze(`server { listen 80; root /x; location ~ /\\. { deny all; } `);
  assert.equal(broken.status, 'risky');
});

test('findings point at the offending directive line, not the server block', () => {
  const r = runAnalysis(parseConfigs(SAMPLE_CONFIGS['bad-production'].files));
  const autoindex = r.findings.find((f) => f.id.startsWith('sec-autoindex'));
  assert.equal(autoindex?.line, 4);
  const legacy = analyze(`server {\n  listen 443 ssl;\n  ssl_protocols TLSv1 TLSv1.2;\n}`).findings.find((f) => f.id.startsWith('sec-legacy-tls'));
  assert.equal(legacy?.line, 3);
});
