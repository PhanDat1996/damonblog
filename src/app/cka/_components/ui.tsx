'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { STATUS_OPTIONS, OUTCOME_OPTIONS } from '@/lib/cka/storage.ts';
import type { AttemptOutcome, SkillStatus } from '@/lib/cka/storage.ts';

export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950';

export const INPUT =
  'rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-green-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400/60 disabled:opacity-50';

export const BTN_PRIMARY = clsx(
  'inline-flex items-center justify-center gap-1 rounded-md bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-green-300 disabled:opacity-50',
  FOCUS_RING,
);

export const BTN_SECONDARY = clsx(
  'inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-50',
  FOCUS_RING,
);

export const BTN_DANGER = clsx(
  'inline-flex items-center justify-center gap-1 rounded-md border border-red-500/40 px-3 py-1.5 font-mono text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50',
  FOCUS_RING,
);

export const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-zinc-400';

const STATUS_STYLE: Record<SkillStatus, { dot: string; text: string }> = {
  not_started: { dot: 'border border-zinc-500 bg-transparent', text: 'text-zinc-400' },
  learning: { dot: 'bg-sky-400', text: 'text-sky-300' },
  guided: { dot: 'bg-amber-400', text: 'text-amber-300' },
  independent: { dot: 'bg-green-400', text: 'text-green-300' },
};

export function statusLabel(s: SkillStatus): string {
  return STATUS_OPTIONS.find((o) => o.id === s)!.label;
}

export function outcomeLabel(o: AttemptOutcome): string {
  return OUTCOME_OPTIONS.find((x) => x.id === o)!.label;
}

export function StatusDot({ status }: { status: SkillStatus }) {
  return <span aria-hidden="true" className={clsx('inline-block h-2 w-2 flex-shrink-0 rounded-full', STATUS_STYLE[status].dot)} />;
}

export function StatusText({ status }: { status: SkillStatus }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-mono text-xs', STATUS_STYLE[status].text)}>
      <StatusDot status={status} />
      {statusLabel(status)}
    </span>
  );
}

const OUTCOME_STYLE: Record<AttemptOutcome, string> = {
  independent: 'text-green-300 border-green-500/30',
  hints: 'text-amber-300 border-amber-500/30',
  unsuccessful: 'text-red-300 border-red-500/30',
};

export function OutcomeTag({ outcome }: { outcome: AttemptOutcome }) {
  return (
    <span className={clsx('rounded border px-1.5 py-0.5 font-mono text-[11px]', OUTCOME_STYLE[outcome])}>
      {outcomeLabel(outcome)}
    </span>
  );
}

/** Stacked bar of skill statuses. Decorative; numbers are always shown as text next to it. */
export function StatusBar({ counts, total }: { counts: Record<SkillStatus, number>; total: number }) {
  const order: SkillStatus[] = ['independent', 'guided', 'learning'];
  return (
    <div aria-hidden="true" className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      {order.map((s) =>
        counts[s] > 0 ? (
          <div key={s} className={STATUS_STYLE[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  }, [code]);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 pr-16 font-mono text-[12.5px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
      <button type="button" onClick={copy} className={clsx('absolute right-2 top-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:text-green-400', FOCUS_RING)}>
        {copied ? 'copied' : 'copy'}
        <span className="sr-only"> command</span>
      </button>
    </div>
  );
}

/**
 * Modal confirmation using the native <dialog> element (focus trap and Esc handling built in).
 * !m-auto keeps it centred even inside a parent that sets child margins (space-y-*).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="!m-auto w-[min(92vw,28rem)] rounded-xl border border-zinc-700 bg-zinc-900 p-0 text-zinc-200 backdrop:bg-black/70"
    >
      <div className="space-y-4 p-6">
        <h2 id="confirm-title" className="font-display text-lg font-bold text-white">{title}</h2>
        <div className="space-y-2 text-sm leading-relaxed text-zinc-300">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" autoFocus onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>
          <button type="button" onClick={onConfirm} className={danger ? BTN_DANGER : BTN_PRIMARY}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  );
}
