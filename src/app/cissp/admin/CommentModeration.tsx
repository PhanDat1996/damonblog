'use client';

import { useCallback, useEffect, useState } from 'react';
import { SCENARIOS } from '@/lib/cissp/scenarios.ts';

type Row = { id: string; scenarioId: string; name: string; body: string; createdAt: string; votes: number; status: string };

const TOKEN_KEY = 'damonsec-cissp-admin';
const BTN = 'rounded-md border px-3 py-1.5 font-mono text-xs disabled:opacity-40';
const title = (id: string) => SCENARIOS.find((s) => s.id === id)?.title.en ?? id;

export function CommentModeration() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<{ pending: Row[]; approved: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (tok: string) => {
    setError(null);
    const res = await fetch('/api/cissp/admin/comments', { headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store' });
    if (!res.ok) {
      setData(null);
      setError(res.status === 401 ? 'Wrong token' : res.status === 429 ? 'Too many attempts, wait 15 minutes' : `Error ${res.status}`);
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, tok);
    setData(await res.json());
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      load(saved);
    }
  }, [load]);

  const act = async (id: string, action: 'approve' | 'delete') => {
    if (action === 'delete' && !window.confirm('Delete this comment?')) return;
    setBusy(id);
    const res = await fetch(`/api/cissp/admin/comments/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) setError(`Action failed (${res.status})`);
    await load(token);
  };

  const list = (rows: Row[], pending: boolean) =>
    rows.length === 0 ? (
      <p className="text-sm text-zinc-500">Nothing here.</p>
    ) : (
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="space-y-2 rounded-lg border border-zinc-800 p-4">
            <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] text-zinc-500">
              <a href={`/cissp#${c.scenarioId}`} className="underline hover:text-green-400">{title(c.scenarioId)}</a>
              <span>{new Date(c.createdAt).toLocaleString()} · 👍 {c.votes}</span>
            </div>
            <p className="text-sm font-semibold text-zinc-200">{c.name}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{c.body}</p>
            <div className="flex gap-2">
              {pending && (
                <button type="button" disabled={busy === c.id} onClick={() => act(c.id, 'approve')} className={`${BTN} border-green-500/50 text-green-300`}>
                  Approve
                </button>
              )}
              <button type="button" disabled={busy === c.id} onClick={() => act(c.id, 'delete')} className={`${BTN} border-red-500/40 text-red-300`}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <div className="font-mono text-xs text-green-400">~/cissp/admin</div>
        <h1 className="font-display text-3xl font-bold text-white">CISSP comment moderation</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(token);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ADMIN_TOKEN"
            autoComplete="current-password"
            className="min-w-[260px] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <button type="submit" className={`${BTN} border-zinc-600 text-zinc-200`}>Load</button>
          {data && (
            <button
              type="button"
              className={`${BTN} border-zinc-700 text-zinc-400`}
              onClick={() => {
                sessionStorage.removeItem(TOKEN_KEY);
                setToken('');
                setData(null);
              }}
            >
              Sign out
            </button>
          )}
        </form>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </header>

      {data && (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Waiting for review ({data.pending.length})</h2>
            {list(data.pending, true)}
          </section>
          <section className="space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Recently approved</h2>
            {list(data.approved, false)}
          </section>
        </>
      )}
    </div>
  );
}
