// Storage for anonymous CISSP comments and votes.
// Production uses Upstash Redis (env from the Vercel Upstash integration); tests and
// local previews use an in-memory store.

import { Redis } from '@upstash/redis';
import type { CommentInput } from './validate.ts';

export type CommentStatus = 'pending' | 'approved';

export interface StoredComment {
  id: string;
  scenarioId: string;
  name: string;
  body: string;
  createdAt: string;
  status: CommentStatus;
  votes: number;
}

/** What visitors receive: no status, nothing about the author beyond the name they typed. */
export type PublicComment = Pick<StoredComment, 'id' | 'name' | 'body' | 'createdAt' | 'votes'>;

export interface VoteResult {
  ok: boolean;
  votes: number;
  already: boolean;
}

export interface CommentStore {
  add(input: CommentInput): Promise<StoredComment>;
  listApproved(scenarioId: string): Promise<PublicComment[]>;
  listPending(): Promise<StoredComment[]>;
  listRecentApproved(limit: number): Promise<StoredComment[]>;
  approve(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  vote(id: string, voterKey: string): Promise<VoteResult>;
  /** Fixed-window rate limit. Returns true while the caller is under the limit. */
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export const MAX_PER_SCENARIO = 200;

export function toPublic(c: StoredComment): PublicComment {
  return { id: c.id, name: c.name, body: c.body, createdAt: c.createdAt, votes: c.votes };
}

/** Most votes first; ties oldest first so early comments keep their place. */
export function sortForDisplay<T extends { votes: number; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt));
}

function newComment(input: CommentInput, now = new Date()): StoredComment {
  return { id: crypto.randomUUID(), ...input, createdAt: now.toISOString(), status: 'pending', votes: 0 };
}

// ── In-memory ───────────────────────────────────────────────────────────────

export function createMemoryStore(): CommentStore {
  const comments = new Map<string, StoredComment>();
  const voters = new Map<string, Set<string>>();
  const counters = new Map<string, { n: number; resetAt: number }>();

  return {
    async add(input) {
      const c = newComment(input);
      comments.set(c.id, c);
      return { ...c };
    },
    async listApproved(scenarioId) {
      const list = [...comments.values()].filter((c) => c.scenarioId === scenarioId && c.status === 'approved');
      return sortForDisplay(list).slice(0, MAX_PER_SCENARIO).map(toPublic);
    },
    async listPending() {
      return [...comments.values()].filter((c) => c.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listRecentApproved(limit) {
      return [...comments.values()]
        .filter((c) => c.status === 'approved')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
    async approve(id) {
      const c = comments.get(id);
      if (!c || c.status !== 'pending') return false;
      c.status = 'approved';
      return true;
    },
    async remove(id) {
      voters.delete(id);
      return comments.delete(id);
    },
    async vote(id, voterKey) {
      const c = comments.get(id);
      if (!c || c.status !== 'approved') return { ok: false, votes: 0, already: false };
      const set = voters.get(id) ?? new Set<string>();
      voters.set(id, set);
      if (set.has(voterKey)) return { ok: true, votes: c.votes, already: true };
      set.add(voterKey);
      c.votes += 1;
      return { ok: true, votes: c.votes, already: false };
    },
    async hit(key, limit, windowSeconds) {
      const now = Date.now();
      const cur = counters.get(key);
      if (!cur || cur.resetAt <= now) {
        counters.set(key, { n: 1, resetAt: now + windowSeconds * 1000 });
        return 1 <= limit;
      }
      cur.n += 1;
      return cur.n <= limit;
    },
  };
}

// ── Upstash Redis ───────────────────────────────────────────────────────────

const K = {
  comment: (id: string) => `cissp:c:${id}`,
  voters: (id: string) => `cissp:v:${id}`,
  pending: 'cissp:pending',
  approved: (scenarioId: string) => `cissp:approved:${scenarioId}`,
  approvedAll: 'cissp:approved:all',
  rate: (key: string) => `cissp:rl:${key}`,
};

function fromHash(h: Record<string, string> | null): StoredComment | null {
  if (!h || !h.id) return null;
  return {
    id: h.id,
    scenarioId: h.scenarioId,
    name: h.name,
    body: h.body,
    createdAt: h.createdAt,
    status: h.status === 'approved' ? 'approved' : 'pending',
    votes: Number(h.votes) || 0,
  };
}

export function createUpstashStore(url: string, token: string): CommentStore {
  // automaticDeserialization off: a comment body like "123" or "[1]" must stay a string.
  const redis = new Redis({ url, token, automaticDeserialization: false });

  const getMany = async (ids: string[]) => {
    if (ids.length === 0) return [];
    const p = redis.pipeline();
    for (const id of ids) p.hgetall(K.comment(id));
    const rows = (await p.exec()) as (Record<string, string> | null)[];
    return rows.map(fromHash).filter((c): c is StoredComment => c !== null);
  };
  const get = async (id: string) => fromHash(await redis.hgetall<Record<string, string>>(K.comment(id)));

  return {
    async add(input) {
      const c = newComment(input);
      await redis
        .pipeline()
        .hset(K.comment(c.id), { ...c, votes: String(c.votes) })
        .zadd(K.pending, { score: Date.parse(c.createdAt), member: c.id })
        .exec();
      return c;
    },
    async listApproved(scenarioId) {
      const ids = (await redis.zrange<string[]>(K.approved(scenarioId), 0, MAX_PER_SCENARIO - 1)) ?? [];
      const list = (await getMany(ids)).filter((c) => c.status === 'approved' && c.scenarioId === scenarioId);
      return sortForDisplay(list).map(toPublic);
    },
    async listPending() {
      const ids = (await redis.zrange<string[]>(K.pending, 0, 199)) ?? [];
      return (await getMany(ids)).filter((c) => c.status === 'pending');
    },
    async listRecentApproved(limit) {
      const ids = (await redis.zrange<string[]>(K.approvedAll, 0, limit - 1, { rev: true })) ?? [];
      return getMany(ids);
    },
    async approve(id) {
      const c = await get(id);
      if (!c || c.status !== 'pending') return false;
      const score = Date.parse(c.createdAt);
      await redis
        .pipeline()
        .hset(K.comment(id), { status: 'approved' })
        .zrem(K.pending, id)
        .zadd(K.approved(c.scenarioId), { score, member: id })
        .zadd(K.approvedAll, { score, member: id })
        .exec();
      return true;
    },
    async remove(id) {
      const c = await get(id);
      if (!c) return false;
      await redis
        .pipeline()
        .del(K.comment(id), K.voters(id))
        .zrem(K.pending, id)
        .zrem(K.approved(c.scenarioId), id)
        .zrem(K.approvedAll, id)
        .exec();
      return true;
    },
    async vote(id, voterKey) {
      const c = await get(id);
      if (!c || c.status !== 'approved') return { ok: false, votes: 0, already: false };
      const added = await redis.sadd(K.voters(id), voterKey);
      if (!added) return { ok: true, votes: c.votes, already: true };
      const votes = await redis.hincrby(K.comment(id), 'votes', 1);
      return { ok: true, votes, already: false };
    },
    async hit(key, limit, windowSeconds) {
      const k = K.rate(key);
      const n = await redis.incr(k);
      if (n === 1) await redis.expire(k, windowSeconds);
      return n <= limit;
    },
  };
}

// ── Selection ───────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __cisspMemoryStore?: CommentStore };

/**
 * Returns the configured store, or null when comments are not set up.
 * CISSP_COMMENTS_MEMORY=1 forces the in-memory store (local preview only; data is lost on restart).
 */
export function getStore(env: Record<string, string | undefined> = process.env): CommentStore | null {
  if (env.CISSP_COMMENTS_MEMORY === '1') return (g.__cisspMemoryStore ??= createMemoryStore());
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createUpstashStore(url, token);
  return null;
}
