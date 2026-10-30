// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scanConfigs, generateHardenedPGConf, generateHardenedHBAConf } from './analyzer.ts';
import { parsePGConf, parseHBA } from './parse.ts';

const PG = generateHardenedPGConf();
const HBA = generateHardenedHBAConf();
const statusOf = (pg: string, hba: string, id: string) => scanConfigs(pg, hba).results.find((r) => r.rule.id === id)?.status;

test('the generated hardened baseline passes every check', () => {
  const r = scanConfigs(PG, HBA);
  assert.deepEqual(r.results.filter((x) => x.status === 'fail').map((x) => x.rule.id), []);
  assert.equal(r.score, 100);
  assert.equal(r.status, 'PASS');
});

test('postgresql.conf: last occurrence wins, = is optional, # inside quotes is kept', () => {
  const s = parsePGConf("ssl = on\nssl = off\nport 5433\nlog_line_prefix = '%m #%p '  # comment");
  assert.equal(s.get('ssl')?.value, 'off');
  assert.equal(s.get('ssl')?.line, 2);
  assert.equal(s.get('port')?.value, '5433');
  assert.equal(s.get('log_line_prefix')?.value, '%m #%p ');
  assert.equal(statusOf(PG + '\nssl = off', HBA, 'ENC-1'), 'fail');
});

test('listen_addresses wildcards include 0.0.0.0 and ::', () => {
  for (const v of ["'*'", "'0.0.0.0'", "'localhost, ::'"]) {
    assert.equal(statusOf(PG.replace("listen_addresses = 'localhost'", `listen_addresses = ${v}`), HBA, 'NET-1'), 'fail', v);
  }
  assert.equal(statusOf(PG.replace(/listen_addresses.*\n/, ''), HBA, 'NET-1'), 'pass');
});

test('pg_hba: reject lines are not treated as access; columns are parsed', () => {
  assert.equal(statusOf(PG, HBA, 'NET-2'), 'pass');
  assert.equal(statusOf(PG, HBA + '\nhost all all 0.0.0.0/0 scram-sha-256', 'NET-2'), 'fail');
  // a role called trust_app is not the trust method
  assert.equal(statusOf(PG, HBA.replace('appuser   10.0.1.0/24', 'trust_app 10.0.1.0/24'), 'AUTH-1'), 'pass');
  const e = parseHBA('host all all 10.0.0.0 255.0.0.0 md5')[0];
  assert.equal(e.address, '10.0.0.0 255.0.0.0');
  assert.equal(e.method, 'md5');
});

test('trust is split into network (high) and local (medium)', () => {
  const r = scanConfigs(PG, 'local all all trust\nhost all all 10.0.0.0/8 trust');
  assert.equal(r.results.find((x) => x.rule.id === 'AUTH-1')?.status, 'fail');
  assert.equal(r.results.find((x) => x.rule.id === 'AUTH-2')?.status, 'fail');
  assert.equal(r.results.find((x) => x.rule.id === 'AUTH-1')?.refs[0].line, 2);
});

test('defaults are not reported as problems', () => {
  // max_connections, password_encryption, ssl_min_protocol_version and shared_buffers unset are fine
  const pg = PG.replace(/max_connections.*\n/, '').replace(/password_encryption.*\n/, '')
    .replace(/ssl_min_protocol_version.*\n/, '').replace(/shared_buffers.*\n/, '');
  const failing = scanConfigs(pg, HBA).results.filter((x) => x.status === 'fail').map((x) => x.rule.id);
  assert.deepEqual(failing, []);
});

test('remote non-SSL lines fail when ssl is on', () => {
  assert.equal(statusOf(PG, HBA.replace('hostssl    appdb', 'host    appdb'), 'ENC-2'), 'fail');
});

test('only one file provided: rules for the other file are n/a', () => {
  const r = scanConfigs('', HBA);
  assert.equal(r.hasPG, false);
  assert.equal(r.results.find((x) => x.rule.id === 'ENC-1')?.status, 'n/a');
  assert.equal(r.results.find((x) => x.rule.id === 'NET-2')?.status, 'pass');
  assert.equal(scanConfigs('', '').status, 'EMPTY');
  assert.equal(scanConfigs('# just a comment', '# nothing').status, 'EMPTY');
});

test('insecure sample fails the expected checks and points at lines', () => {
  const pg = "listen_addresses = '*'\nssl = off\npassword_encryption = md5\nmax_connections = 1000";
  const hba = 'local all all trust\nhost all all 0.0.0.0/0 trust\nhost all postgres 10.0.0.0/8 md5';
  const r = scanConfigs(pg, hba);
  const ids = r.results.filter((x) => x.status === 'fail').map((x) => x.rule.id);
  for (const id of ['NET-1', 'NET-2', 'AUTH-1', 'AUTH-2', 'AUTH-3', 'AUTH-5', 'AUTH-8', 'ENC-1', 'RES-2']) assert.ok(ids.includes(id), id);
  assert.deepEqual(r.results.find((x) => x.rule.id === 'NET-1')?.refs[0], { file: 'postgresql.conf', line: 1, label: "listen_addresses = '*'" });
  assert.equal(r.results.find((x) => x.rule.id === 'AUTH-3')?.refs[0].line, 3);
  assert.equal(r.status, 'FAIL');
  assert.ok(r.score <= 39);
});

test('a single high issue rules out "Good"', () => {
  const r = scanConfigs(PG.replace("listen_addresses = 'localhost'", "listen_addresses = '*'"), HBA);
  assert.equal(r.counts.high, 1);
  assert.equal(r.score, 69);
  assert.equal(r.riskLabel, 'Needs Improvement');
});
