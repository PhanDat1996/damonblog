'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { DOMAINS, getDomain } from '@/lib/cissp/domains.ts';
import type { Bi, DomainId } from '@/lib/cissp/domains.ts';
import { SCENARIOS } from '@/lib/cissp/scenarios.ts';
import type { OptionId } from '@/lib/cissp/scenarios.ts';
import { LANG_MODES, LETTERS, STORAGE_KEY, displayOptions, emptyState, letterFor, parseStored, reportLinks, score } from '@/lib/cissp/trainer.ts';
import type { LangMode, TrainerState } from '@/lib/cissp/trainer.ts';
import { CisspComments } from './CisspComments';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950';
const BTN_PRIMARY = clsx(
  'inline-flex items-center justify-center rounded-md bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-40',
  FOCUS_RING,
);
const BTN_SECONDARY = clsx(
  'inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
  FOCUS_RING,
);
const LABEL = 'font-mono text-[11px] uppercase tracking-wider text-zinc-500';

type Filter = 'all' | DomainId;

/** Bilingual text. In "both" mode English comes first and Vietnamese follows in a quieter colour. */
function T({ v, mode, className, viClassName }: { v: Bi; mode: LangMode; className?: string; viClassName?: string }) {
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
function pick(v: Bi, mode: LangMode): string {
  return mode === 'vi' ? v.vi : mode === 'en' ? v.en : `${v.en} / ${v.vi}`;
}

export function CisspTrainer() {
  const [state, setState] = useState<TrainerState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [currentId, setCurrentId] = useState(SCENARIOS[0].id);
  const [selected, setSelected] = useState<OptionId | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked: run without persistence */
    }
    setState(parseStored(stored));
    setLoaded(true);

    // Links in the scenario index below the trainer use #<scenario-id>
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!SCENARIOS.some((s) => s.id === id)) return;
      setFilter('all');
      setCurrentId(id);
      setSelected(null);
      cardRef.current?.scrollIntoView({ block: 'start' });
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  const mode = state.lang;
  const visible = useMemo(() => (filter === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.domainId === filter)), [filter]);
  const index = Math.max(0, visible.findIndex((s) => s.id === currentId));
  const scenario = visible[index];
  const result = state.results[scenario.id];
  const options = displayOptions(scenario);
  const domain = getDomain(scenario.domainId);
  const overall = score(state.results, SCENARIOS);
  const inFilter = score(state.results, visible);
  const report = reportLinks(scenario);

  const go = useCallback((id: string, focus = true) => {
    setCurrentId(id);
    setSelected(null);
    history.replaceState(null, '', `#${id}`);
    if (focus) cardRef.current?.focus({ preventScroll: true });
    cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  const changeFilter = (f: Filter) => {
    setFilter(f);
    const list = f === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.domainId === f);
    if (!list.some((s) => s.id === currentId)) {
      setCurrentId(list[0].id);
      setSelected(null);
      history.replaceState(null, '', `#${list[0].id}`);
    }
  };

  const submit = () => {
    if (!selected) return;
    setState((s) => ({
      ...s,
      results: { ...s.results, [scenario.id]: { picked: selected, correct: selected === scenario.answer, at: new Date().toISOString() } },
    }));
  };

  const retry = () => {
    setState((s) => {
      const results = { ...s.results };
      delete results[scenario.id];
      return { ...s, results };
    });
    setSelected(null);
  };

  const resetAll = () => {
    if (!window.confirm('Clear all your answers? / Xóa hết kết quả đã làm?')) return;
    setState((s) => ({ ...s, results: {} }));
    setSelected(null);
  };

  const nextUnanswered = visible.find((s, i) => i > index && !state.results[s.id]) ?? visible.find((s) => !state.results[s.id] && s.id !== scenario.id);
  const shown = result ? result.picked : selected;

  return (
    <div className="space-y-8">
      {/* Controls */}
      <section aria-label="Settings" className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="radiogroup" aria-label="Language / Ngôn ngữ" className="flex rounded-md border border-zinc-700 p-0.5">
            {LANG_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setState((s) => ({ ...s, lang: m.id }))}
                className={clsx(
                  'rounded px-3 py-1 font-mono text-xs transition-colors',
                  FOCUS_RING,
                  mode === m.id ? 'bg-green-400/15 text-green-300' : 'text-zinc-400 hover:text-white',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="font-mono text-xs text-zinc-400" aria-live="polite">
            {overall.answered}/{overall.total} answered · {overall.correct} correct
            {overall.answered > 0 && ` (${Math.round((overall.correct / overall.answered) * 100)}%)`}
          </p>
        </div>

        <div className="space-y-2">
          <div className={LABEL}>Domain</div>
          <div className="flex flex-wrap gap-2">
            {(['all', ...DOMAINS.map((d) => d.id)] as Filter[]).map((f) => {
              const list = f === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.domainId === f);
              const sc = score(state.results, list);
              const d = f === 'all' ? null : getDomain(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  title={d ? pick(d.name, mode) : undefined}
                  onClick={() => changeFilter(f)}
                  className={clsx(
                    'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
                    FOCUS_RING,
                    filter === f ? 'border-green-500/50 bg-green-400/10 text-green-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
                  )}
                >
                  {d ? `D${d.number}` : 'All'} <span className="text-zinc-500">{sc.answered}/{sc.total}</span>
                </button>
              );
            })}
          </div>
          {filter !== 'all' && (
            <p className="text-xs text-zinc-400">
              {pick(getDomain(filter).name, mode)} · {getDomain(filter).weight}% of the exam
            </p>
          )}
        </div>

        <nav aria-label="Scenarios" className="space-y-2">
          <div className={LABEL}>
            Scenarios {inFilter.answered > 0 && <span className="normal-case tracking-normal">· {inFilter.correct}/{inFilter.answered} correct</span>}
          </div>
          <ol className="flex flex-wrap gap-1.5">
            {visible.map((s, i) => {
              const r = state.results[s.id];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => go(s.id, false)}
                    aria-current={s.id === scenario.id ? 'true' : undefined}
                    aria-label={`${i + 1}. ${s.title.en}${r ? (r.correct ? ' (correct)' : ' (incorrect)') : ''}`}
                    className={clsx(
                      'h-8 w-8 rounded-md border font-mono text-xs transition-colors',
                      FOCUS_RING,
                      s.id === scenario.id && 'ring-1 ring-zinc-300',
                      r?.correct && 'border-green-500/50 bg-green-400/10 text-green-300',
                      r && !r.correct && 'border-red-500/50 bg-red-500/10 text-red-300',
                      !r && 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </section>

      {/* Scenario */}
      <article
        ref={cardRef}
        tabIndex={-1}
        aria-labelledby="scenario-title"
        className="scroll-mt-24 space-y-6 rounded-xl border border-zinc-800 p-5 outline-none md:p-8"
      >
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-zinc-500">
            <span className="text-green-400">
              {index + 1}/{visible.length}
            </span>
            <span>
              D{domain.number} · {pick(domain.name, mode)}
            </span>
          </div>
          <h2 id="scenario-title" className="font-display text-xl font-bold text-white md:text-2xl">
            {mode === 'vi' ? scenario.title.vi : scenario.title.en}
            {mode === 'both' && <span lang="vi" className="mt-1 block text-base font-normal text-zinc-400">{scenario.title.vi}</span>}
          </h2>
        </header>

        <section aria-label="Situation" className="space-y-2">
          <div className={LABEL}>Situation / Tình huống</div>
          <T v={scenario.situation} mode={mode} className="leading-relaxed text-zinc-200" />
        </section>

        <fieldset className="space-y-3" disabled={!!result}>
          <legend className="mb-3">
            <T v={scenario.question} mode={mode} className="font-semibold text-white" viClassName="font-normal" />
          </legend>
          {options.map((o, i) => {
            const isAnswer = o.id === scenario.answer;
            const isPicked = shown === o.id;
            return (
              <div
                key={o.id}
                className={clsx(
                  'rounded-lg border transition-colors',
                  !result && (isPicked ? 'border-green-500/60 bg-green-400/5' : 'border-zinc-800 hover:border-zinc-600'),
                  result && isAnswer && 'border-green-500/60 bg-green-400/5',
                  result && !isAnswer && isPicked && 'border-red-500/50 bg-red-500/5',
                  result && !isAnswer && !isPicked && 'border-zinc-800',
                )}
              >
                <label className={clsx('flex gap-3 p-4', !result && 'cursor-pointer')}>
                  <input
                    type="radio"
                    name={`answer-${scenario.id}`}
                    value={o.id}
                    checked={isPicked}
                    onChange={() => setSelected(o.id)}
                    className="mt-1 h-4 w-4 flex-shrink-0 accent-green-400"
                  />
                  <span className="w-5 flex-shrink-0 font-mono text-sm text-zinc-400">{LETTERS[i]}.</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <T v={o.text} mode={mode} className="text-zinc-100" viClassName="text-[13px]" />
                  </span>
                  {result && (
                    <span
                      className={clsx('flex-shrink-0 font-mono text-xs', isAnswer ? 'text-green-300' : isPicked ? 'text-red-300' : 'text-zinc-600')}
                    >
                      {isAnswer ? '✓ answer' : isPicked ? '✗ your pick' : ''}
                    </span>
                  )}
                </label>
                {result && (
                  <div className="border-t border-zinc-800/80 px-4 py-3 pl-[3.25rem] text-sm">
                    <T v={o.why} mode={mode} className="leading-relaxed text-zinc-300" viClassName="text-zinc-400" />
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        {!result && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={submit} disabled={!selected} className={BTN_PRIMARY}>
              Check answer / Kiểm tra
            </button>
          </div>
        )}

        {result && (
          <section aria-live="polite" aria-label="Explanation" className="space-y-5">
            <p className={clsx('font-mono text-sm font-semibold', result.correct ? 'text-green-300' : 'text-red-300')}>
              {result.correct
                ? 'Correct / Chính xác'
                : `Not quite. The answer is ${letterFor(scenario, scenario.answer)}. / Chưa đúng rồi. Đáp án là ${letterFor(scenario, scenario.answer)}.`}
            </p>
            <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <div className={LABEL}>Explanation / Giải thích</div>
              <T v={scenario.explanation} mode={mode} className="text-sm leading-relaxed text-zinc-200" />
            </div>
            <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-400/5 p-5">
              <div className={clsx(LABEL, 'text-green-400/80')}>Remember / Ghi nhớ</div>
              <T v={scenario.takeaway} mode={mode} className="text-sm font-medium leading-relaxed text-zinc-100" viClassName="font-normal" />
            </div>
            <ul className="flex flex-wrap gap-1.5" aria-label="Concepts">
              {scenario.concepts.map((c) => (
                <li key={c} className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">
                  {c}
                </li>
              ))}
            </ul>
            <button type="button" onClick={retry} className={BTN_SECONDARY}>
              Try again / Làm lại
            </button>
          </section>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
          <div className="flex gap-2">
            <button type="button" className={BTN_SECONDARY} disabled={index === 0} onClick={() => go(visible[index - 1].id)}>
              ← Prev
            </button>
            <button type="button" className={BTN_SECONDARY} disabled={index === visible.length - 1} onClick={() => go(visible[index + 1].id)}>
              Next →
            </button>
          </div>
          {nextUnanswered ? (
            <button type="button" className={BTN_SECONDARY} onClick={() => go(nextUnanswered.id)}>
              Next unanswered / Câu tiếp chưa làm
            </button>
          ) : (
            <span className="font-mono text-xs text-zinc-500">All done in this set / Đã làm hết</span>
          )}
        </footer>

        <p className="text-xs text-zinc-500">
          {mode === 'vi' ? 'Thấy câu này sai hoặc chưa rõ?' : mode === 'en' ? 'Spotted a mistake or something unclear?' : 'Spotted a mistake? / Thấy câu này sai hoặc chưa rõ?'}{' '}
          <a href={report.github} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">
            {mode === 'vi' ? 'Báo qua GitHub' : 'Report on GitHub'} ↗
          </a>
          <span className="text-zinc-600"> · </span>
          <a href={report.email} className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">
            {mode === 'vi' ? 'Gửi email' : 'Email'}
          </a>
        </p>

        <section aria-label="Comments" className="border-t border-zinc-800 pt-5">
          {/* key resets to the closed state when the scenario changes */}
          <CisspComments key={scenario.id} scenarioId={scenario.id} mode={mode} />
        </section>
      </article>

      {overall.answered > 0 && (
        <p className="text-right">
          <button type="button" onClick={resetAll} className="font-mono text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-red-300">
            Reset all answers / Xóa kết quả
          </button>
        </p>
      )}
    </div>
  );
}
