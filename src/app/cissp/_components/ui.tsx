import clsx from 'clsx';
import type { Bi } from '@/lib/cissp/domains.ts';
import type { LangMode } from '@/lib/cissp/trainer.ts';

export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950';
export const BTN_PRIMARY = clsx(
  'inline-flex items-center justify-center rounded-md bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40',
  FOCUS_RING,
);
export const BTN_SECONDARY = clsx(
  'inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
  FOCUS_RING,
);
export const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-zinc-500';

/** Toggle-style chip used by the filters. */
export function chip(active: boolean, tone: 'green' | 'amber' | 'rose' = 'green') {
  return clsx(
    'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
    FOCUS_RING,
    !active && 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
    active && tone === 'green' && 'border-green-500/50 bg-green-400/10 text-green-300',
    active && tone === 'amber' && 'border-amber-500/50 bg-amber-400/10 text-amber-300',
    active && tone === 'rose' && 'border-rose-500/50 bg-rose-400/10 text-rose-300',
  );
}

/** Bilingual text. In "both" mode English comes first and Vietnamese follows in a quieter colour. */
export function T({ v, mode, className, viClassName }: { v: Bi; mode: LangMode; className?: string; viClassName?: string }) {
  if (mode === 'en') return <p className={className}>{v.en}</p>;
  if (mode === 'vi') return <p lang="vi" className={className}>{v.vi}</p>;
  return (
    <div className="space-y-1.5">
      <p className={className}>{v.en}</p>
      <p lang="vi" className={clsx(className, 'text-zinc-400', viClassName)}>{v.vi}</p>
    </div>
  );
}

/** Single-language string for short UI labels. */
export function pick(v: Bi, mode: LangMode): string {
  return mode === 'vi' ? v.vi : mode === 'en' ? v.en : `${v.en} / ${v.vi}`;
}
