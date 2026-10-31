// HTTP handlers for CISSP comments. Route files under src/app/api only wire these up,
// so the logic can be tested with plain Request objects.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { CommentStore } from './store.ts';
import { toPublic } from './store.ts';
import { isScenarioId, validateComment } from './validate.ts';

type Env = Record<string, string | undefined>;

export const LIMITS = {
  postPerIp: { limit: 5, window: 600 },
  postGlobal: { limit: 200, window: 3600 },
  votePerIp: { limit: 60, window: 600 },
  // Every admin request counts, checked before the token, so guesses are capped too.
  adminPerIp: { limit: 120, window: 900 },
  maxBodyBytes: 4000,
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const notConfigured = () => json({ error: 'Comments are not available right now' }, 503);

function secret(env: Env): string | null {
  const t = env.ADMIN_TOKEN;
  return t && t.length >= 24 ? t : null;
}

function clientIp(req: Request): string {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

/** Keyed hash of the client IP. The raw IP is never stored. */
export function clientKey(req: Request, key: string): string {
  return createHmac('sha256', key).update(`ip:${clientIp(req)}`).digest('hex').slice(0, 32);
}

/** Browsers always send Origin on cross-site and same-site POSTs; require it to match. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isAdmin(req: Request, env: Env): boolean {
  const s = secret(env);
  const header = req.headers.get('authorization') ?? '';
  if (!s || !header.startsWith('Bearer ')) return false;
  const a = createHash('sha256').update(header.slice(7)).digest();
  const b = createHash('sha256').update(s).digest();
  return timingSafeEqual(a, b);
}

async function readJson(req: Request): Promise<unknown | Response> {
  const text = await req.text();
  if (text.length > LIMITS.maxBodyBytes) return json({ error: 'Request too large' }, 413);
  try {
    return JSON.parse(text);
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
}

// ── Public ──────────────────────────────────────────────────────────────────

export async function listComments(req: Request, store: CommentStore | null): Promise<Response> {
  if (!store) return notConfigured();
  const scenarioId = new URL(req.url).searchParams.get('scenario');
  if (!isScenarioId(scenarioId)) return json({ error: 'Unknown scenario' }, 400);
  return json({ comments: await store.listApproved(scenarioId) });
}

export async function postComment(req: Request, store: CommentStore | null, env: Env): Promise<Response> {
  const s = secret(env);
  if (!store || !s) return notConfigured();
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  const v = validateComment(raw);
  if (!v.ok) return v.silent ? json({ status: 'pending' }) : json({ error: v.error }, v.status);

  const ip = clientKey(req, s);
  if (!(await store.hit(`post:${ip}`, LIMITS.postPerIp.limit, LIMITS.postPerIp.window))) {
    return json({ error: 'Too many comments, try again later' }, 429);
  }
  if (!(await store.hit('post:all', LIMITS.postGlobal.limit, LIMITS.postGlobal.window))) {
    return json({ error: 'Comments are paused, try again later' }, 429);
  }
  await store.add(v.value);
  return json({ status: 'pending' }, 201);
}

export async function voteComment(req: Request, id: string, store: CommentStore | null, env: Env): Promise<Response> {
  const s = secret(env);
  if (!store || !s) return notConfigured();
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Not found' }, 404);

  const ip = clientKey(req, s);
  if (!(await store.hit(`vote:${ip}`, LIMITS.votePerIp.limit, LIMITS.votePerIp.window))) {
    return json({ error: 'Too many votes, try again later' }, 429);
  }
  const r = await store.vote(id, ip);
  if (!r.ok) return json({ error: 'Not found' }, 404);
  return json({ votes: r.votes, already: r.already });
}

// ── Admin ───────────────────────────────────────────────────────────────────

async function adminGate(req: Request, store: CommentStore | null, env: Env): Promise<Response | null> {
  const s = secret(env);
  if (!store || !s) return notConfigured();
  const ip = clientKey(req, s);
  if (!(await store.hit(`admin:${ip}`, LIMITS.adminPerIp.limit, LIMITS.adminPerIp.window))) {
    return json({ error: 'Too many attempts' }, 429);
  }
  return isAdmin(req, env) ? null : json({ error: 'Unauthorized' }, 401);
}

export async function adminList(req: Request, store: CommentStore | null, env: Env): Promise<Response> {
  const denied = await adminGate(req, store, env);
  if (denied) return denied;
  const [pending, approved] = await Promise.all([store!.listPending(), store!.listRecentApproved(50)]);
  const shape = (c: (typeof pending)[number]) => ({ ...toPublic(c), scenarioId: c.scenarioId, status: c.status });
  return json({ pending: pending.map(shape), approved: approved.map(shape) });
}

export async function adminAction(req: Request, id: string, store: CommentStore | null, env: Env): Promise<Response> {
  const denied = await adminGate(req, store, env);
  if (denied) return denied;
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403);
  const raw = await readJson(req);
  if (raw instanceof Response) return raw;
  const action = (raw as { action?: unknown })?.action;
  if (action === 'approve') return (await store!.approve(id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404);
  if (action === 'delete') return (await store!.remove(id)) ? json({ ok: true }) : json({ error: 'Not found' }, 404);
  return json({ error: 'Unknown action' }, 400);
}
