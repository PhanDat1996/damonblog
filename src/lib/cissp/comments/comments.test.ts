// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANONYMOUS, BODY_MAX, cleanText, validateComment } from './validate.ts';
import { createMemoryStore, getStore, sortForDisplay } from './store.ts';
import { adminAction, adminList, listComments, postComment, voteComment } from './handlers.ts';

const ENV = { ADMIN_TOKEN: 'test-admin-token-0123456789abcdef' };
const SCENARIO = 'rto-rpo-strategy';

function req(path: string, init: { method?: string; body?: unknown; ip?: string; origin?: string | null; token?: string } = {}) {
  const headers: Record<string, string> = { host: 'www.damonsec.com', 'x-real-ip': init.ip ?? '203.0.113.7' };
  if (init.origin !== null) headers.origin = init.origin ?? 'https://www.damonsec.com';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://www.damonsec.com${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  });
}

const post = (store: ReturnType<typeof createMemoryStore>, body: unknown, extra: Parameters<typeof req>[1] = {}) =>
  postComment(req('/api/cissp/comments', { body, ...extra }), store, ENV);

// ── Validation ──────────────────────────────────────────────────────────────

test('validate: name optional, defaults to anonymous; text is cleaned', () => {
  const v = validateComment({ scenarioId: SCENARIO, body: '  Hay quá\r\n\r\n\r\n\r\nCảm ơn  ' });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.value.name, ANONYMOUS);
    assert.equal(v.value.body, 'Hay quá\n\nCảm ơn');
  }
  assert.equal(cleanText('a‮b​c\u0007d'), 'abcd', 'bidi, zero-width and control chars removed');
});

test('validate: rejects bad input', () => {
  assert.equal(validateComment({ scenarioId: 'nope', body: 'hello' }).ok, false);
  assert.equal(validateComment({ scenarioId: SCENARIO, body: 'hi' }).ok, false, 'too short');
  assert.equal(validateComment({ scenarioId: SCENARIO, body: 'x'.repeat(BODY_MAX + 1) }).ok, false, 'too long');
  assert.equal(validateComment({ scenarioId: SCENARIO, body: 'hello', name: 'n'.repeat(41) }).ok, false);
  assert.equal(validateComment({ scenarioId: SCENARIO, body: { $gt: '' } }).ok, false, 'non-string body');
  assert.equal(validateComment({ scenarioId: SCENARIO, body: 'see http://a http://b http://c' }).ok, false, 'link spam');
  const hp = validateComment({ scenarioId: SCENARIO, body: 'hello', website: 'spam.example' });
  assert.ok(!hp.ok && hp.silent, 'honeypot is silently dropped');
});

test('HTML is kept as inert text, never stripped into markup', () => {
  const v = validateComment({ scenarioId: SCENARIO, body: '<img src=x onerror=alert(1)>' });
  assert.ok(v.ok && v.value.body === '<img src=x onerror=alert(1)>');
});

// ── Flow ────────────────────────────────────────────────────────────────────

test('comments stay hidden until approved, then show sorted by votes', async () => {
  const store = createMemoryStore();
  assert.equal((await post(store, { scenarioId: SCENARIO, body: 'first comment', name: 'An' })).status, 201);
  assert.equal((await post(store, { scenarioId: SCENARIO, body: 'second comment' }, { ip: '198.51.100.2' })).status, 201);

  let list = await (await listComments(req(`/api/cissp/comments?scenario=${SCENARIO}`), store)).json();
  assert.equal(list.comments.length, 0, 'pending comments are not public');

  const admin = await (await adminList(req('/api/cissp/admin/comments', { token: ENV.ADMIN_TOKEN }), store, ENV)).json();
  assert.equal(admin.pending.length, 2);
  for (const c of admin.pending) {
    const r = await adminAction(req(`/api/cissp/admin/comments/${c.id}`, { body: { action: 'approve' }, token: ENV.ADMIN_TOKEN }), c.id, store, ENV);
    assert.equal(r.status, 200);
  }
  const second = admin.pending.find((c: { body: string }) => c.body === 'second comment');
  const v1 = await voteComment(req(`/api/cissp/comments/${second.id}/vote`, { body: {} }), second.id, store, ENV);
  assert.deepEqual(await v1.json(), { votes: 1, already: false });
  const v2 = await voteComment(req(`/api/cissp/comments/${second.id}/vote`, { body: {} }), second.id, store, ENV);
  assert.deepEqual(await v2.json(), { votes: 1, already: true }, 'one vote per visitor');

  list = await (await listComments(req(`/api/cissp/comments?scenario=${SCENARIO}`), store)).json();
  assert.deepEqual(list.comments.map((c: { body: string }) => c.body), ['second comment', 'first comment']);
  assert.deepEqual(Object.keys(list.comments[0]).sort(), ['body', 'createdAt', 'id', 'name', 'votes'], 'no status or IP leaks');
});

test('votes on pending or unknown comments are refused', async () => {
  const store = createMemoryStore();
  await post(store, { scenarioId: SCENARIO, body: 'pending one' });
  const [p] = await store.listPending();
  assert.equal((await voteComment(req('/x', { body: {} }), p.id, store, ENV)).status, 404);
  assert.equal((await voteComment(req('/x', { body: {} }), 'not-a-uuid', store, ENV)).status, 404);
});

// ── Abuse ───────────────────────────────────────────────────────────────────

test('cross-site and origin-less POSTs are rejected', async () => {
  const store = createMemoryStore();
  assert.equal((await post(store, { scenarioId: SCENARIO, body: 'hello' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(store, { scenarioId: SCENARIO, body: 'hello' }, { origin: null })).status, 403);
});

test('rate limit: 5 comments per IP per window', async () => {
  const store = createMemoryStore();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post(store, { scenarioId: SCENARIO, body: `comment ${i}` })).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429]);
});

test('oversized or malformed bodies are rejected', async () => {
  const store = createMemoryStore();
  assert.equal((await post(store, 'x'.repeat(5000))).status, 413);
  assert.equal((await post(store, '{not json')).status, 400);
});

test('admin: wrong or missing token is refused; request cap applies even to the right token', async () => {
  const store = createMemoryStore();
  assert.equal((await adminList(req('/a'), store, ENV)).status, 401);
  assert.equal((await adminList(req('/a', { token: 'wrong' }), store, ENV)).status, 401);
  assert.equal((await adminList(req('/a', { token: ENV.ADMIN_TOKEN }), store, ENV)).status, 200);
  for (let i = 0; i < 120; i++) await adminList(req('/a', { token: 'wrong' }), store, ENV);
  assert.equal((await adminList(req('/a', { token: ENV.ADMIN_TOKEN }), store, ENV)).status, 429, 'guessing is capped per IP');
  assert.equal((await adminList(req('/a', { token: ENV.ADMIN_TOKEN, ip: '192.0.2.50' }), store, ENV)).status, 200, 'other IPs unaffected');
});

test('not configured: no store or short ADMIN_TOKEN returns 503', async () => {
  assert.equal(getStore({}), null);
  assert.equal((await listComments(req(`/c?scenario=${SCENARIO}`), null)).status, 503);
  const store = createMemoryStore();
  assert.equal((await postComment(req('/c', { body: { scenarioId: SCENARIO, body: 'hello' } }), store, { ADMIN_TOKEN: 'short' })).status, 503);
});

test('sortForDisplay: votes desc, then oldest first', () => {
  const s = sortForDisplay([
    { votes: 1, createdAt: '2026-01-02' },
    { votes: 3, createdAt: '2026-01-03' },
    { votes: 1, createdAt: '2026-01-01' },
  ]);
  assert.deepEqual(s.map((x) => x.createdAt), ['2026-01-03', '2026-01-01', '2026-01-02']);
});
