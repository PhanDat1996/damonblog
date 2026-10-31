'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import type { LangMode } from '@/lib/cissp/trainer.ts';
import { BODY_MAX, NAME_MAX } from '@/lib/cissp/comments/validate.ts';

type Comment = { id: string; name: string; body: string; createdAt: string; votes: number };

const VOTES_KEY = 'damonsec-cissp-votes';
const FOCUS = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400';
const BTN = clsx('inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-40', FOCUS);
const INPUT = 'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500/60 focus:outline-none';

function readVoted(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(VOTES_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Anonymous comments for one scenario. Loaded on click; new comments show immediately and can be removed at /cissp/admin. */
export function CisspComments({ scenarioId, mode }: { scenarioId: string; mode: LangMode }) {
  const t = useCallback((en: string, vi: string) => (mode === 'vi' ? vi : mode === 'en' ? en : `${en} / ${vi}`), [mode]);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'unavailable' | 'error'>('idle');
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/cissp/comments?scenario=${encodeURIComponent(scenarioId)}`, { cache: 'no-store' });
      if (res.status === 503) return setState('unavailable');
      if (!res.ok) return setState('error');
      setComments((await res.json()).comments);
      setState('idle');
    } catch {
      setState('error');
    }
  }, [scenarioId]);

  useEffect(() => {
    if (open) {
      setVoted(readVoted());
      load();
    }
  }, [open, load]);

  const vote = async (id: string) => {
    if (voted.has(id)) return;
    const next = new Set(voted).add(id);
    setVoted(next);
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify([...next].slice(-500)));
    } catch {
      /* ignore */
    }
    const res = await fetch(`/api/cissp/comments/${id}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (res.ok) {
      const { votes } = await res.json();
      setComments((list) => list?.map((c) => (c.id === id ? { ...c, votes } : c)) ?? null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch('/api/cissp/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId, name, body, website }),
      });
      if (res.ok) {
        const { comment } = await res.json();
        setBody('');
        if (comment) setComments((list) => [...(list ?? []), comment]);
        setNotice({ ok: true, text: t('Posted. Thanks!', 'Đã đăng. Cảm ơn bạn!') });
      } else {
        const msg = (await res.json().catch(() => null))?.error;
        setNotice({ ok: false, text: res.status === 429 ? t('Too many comments, try again later.', 'Gửi nhiều quá, thử lại sau nhé.') : msg ?? t('Could not send.', 'Chưa gửi được.') });
      }
    } catch {
      setNotice({ ok: false, text: t('Could not send.', 'Chưa gửi được.') });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={BTN} onClick={() => setOpen(true)}>
        {t('Show comments', 'Xem bình luận')}
      </button>
    );
  }

  const dateFmt = new Intl.DateTimeFormat(mode === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-5">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
        {t('Comments', 'Bình luận')}
        {comments && comments.length > 0 && ` · ${comments.length}`}
      </h3>

      {state === 'loading' && <p className="text-sm text-zinc-500">{t('Loading…', 'Đang tải…')}</p>}
      {state === 'unavailable' && <p className="text-sm text-zinc-500">{t('Comments are turned off right now.', 'Bình luận đang tạm tắt.')}</p>}
      {state === 'error' && (
        <p className="text-sm text-zinc-500">
          {t('Could not load comments.', 'Không tải được bình luận.')}{' '}
          <button type="button" className="underline" onClick={load}>{t('Retry', 'Thử lại')}</button>
        </p>
      )}

      {comments && comments.length === 0 && state === 'idle' && (
        <p className="text-sm text-zinc-500">{t('No comments yet.', 'Chưa có bình luận nào.')}</p>
      )}

      {comments && comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border border-zinc-800 p-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold text-zinc-200">{c.name}</span>
                <time dateTime={c.createdAt} className="flex-shrink-0 font-mono text-[11px] text-zinc-500">
                  {dateFmt.format(new Date(c.createdAt))}
                </time>
              </div>
              {/* Plain text only: React escapes it, nothing is parsed as HTML or markdown. */}
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">{c.body}</p>
              <button
                type="button"
                onClick={() => vote(c.id)}
                disabled={voted.has(c.id)}
                aria-pressed={voted.has(c.id)}
                aria-label={t(`Helpful, ${c.votes} votes`, `Hữu ích, ${c.votes} lượt`)}
                className={clsx(
                  'mt-2 inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs',
                  FOCUS,
                  voted.has(c.id) ? 'border-green-500/40 text-green-300' : 'border-zinc-700 text-zinc-400 hover:text-white',
                )}
              >
                👍 {c.votes}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state !== 'unavailable' && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <input
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder={t('Name (optional)', 'Tên (không bắt buộc)')}
            aria-label={t('Name (optional)', 'Tên (không bắt buộc)')}
            autoComplete="nickname"
          />
          {/* Honeypot: hidden from people, bots tend to fill it in. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          <textarea
            className={clsx(INPUT, 'min-h-[96px]')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            required
            minLength={3}
            placeholder={t('Your comment', 'Bình luận của bạn')}
            aria-label={t('Your comment', 'Bình luận của bạn')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500">
              {t(
                'Plain text, shown publicly right away. Do not post personal information.',
                'Chỉ chữ thuần, hiện công khai ngay. Đừng ghi thông tin cá nhân.',
              )}{' '}
              <span className="font-mono">{body.length}/{BODY_MAX}</span>
            </p>
            <button type="submit" disabled={sending || body.trim().length < 3} className={clsx(BTN, 'border-green-500/50 text-green-300')}>
              {sending ? t('Sending…', 'Đang gửi…') : t('Post comment', 'Gửi bình luận')}
            </button>
          </div>
          {notice && (
            <p role="status" className={clsx('text-sm', notice.ok ? 'text-green-300' : 'text-red-300')}>
              {notice.text}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
