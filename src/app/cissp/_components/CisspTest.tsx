'use client';

import { useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { DOMAINS, getDomain } from '@/lib/cissp/domains.ts';
import type { DomainId } from '@/lib/cissp/domains.ts';
import { SCENARIOS } from '@/lib/cissp/scenarios.ts';
import type { OptionId } from '@/lib/cissp/scenarios.ts';
import { DEFAULT_TEST_SIZE, LETTERS, LEVELS, TEST_SIZES, displayOptions, drawTest, filterScenarios, gradeTest, letterFor } from '@/lib/cissp/trainer.ts';
import type { LangMode, Level } from '@/lib/cissp/trainer.ts';
import { BTN_PRIMARY, BTN_SECONDARY, LABEL, T, chip, pick } from './ui';

type Size = (typeof TEST_SIZES)[number] | 'all';
type Phase = 'setup' | 'running' | 'done';

/**
 * Random test drawn from the scenario bank. Answers are hidden until the whole test is submitted,
 * then every question can be reviewed with its explanation.
 */
export function CisspTest({ mode, onSubmit }: { mode: LangMode; onSubmit: (answers: Record<string, OptionId>) => void }) {
  const [size, setSize] = useState<Size>(DEFAULT_TEST_SIZE);
  const [domain, setDomain] = useState<'all' | DomainId>('all');
  const [level, setLevel] = useState<Level>('all');
  const [phase, setPhase] = useState<Phase>('setup');
  const [ids, setIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, OptionId>>({});
  const [index, setIndex] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  const L = (en: string, vi: string) => (mode === 'vi' ? vi : mode === 'en' ? en : `${en} / ${vi}`);
  const pool = useMemo(() => filterScenarios(SCENARIOS, domain, level), [domain, level]);
  const wanted = size === 'all' ? pool.length : size;
  const answered = ids.filter((id) => answers[id]).length;
  const grade = useMemo(() => (phase === 'done' ? gradeTest(ids, answers) : null), [phase, ids, answers]);

  const scrollTop = () => topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  const start = () => {
    setIds(drawTest(pool, wanted));
    setAnswers({});
    setIndex(0);
    setPhase('running');
    scrollTop();
  };

  const goTo = (i: number) => {
    setIndex(i);
    scrollTop();
  };

  const submit = () => {
    const left = ids.length - answered;
    if (left > 0 && !window.confirm(L(`${left} question(s) unanswered. Submit anyway?`, `Còn ${left} câu chưa trả lời. Vẫn nộp bài?`))) return;
    onSubmit(answers);
    setPhase('done');
    scrollTop();
  };

  const quit = () => {
    if (answered > 0 && !window.confirm(L('Quit this test? Your answers will be lost.', 'Bỏ bài test này? Các câu đã chọn sẽ mất.'))) return;
    setPhase('setup');
  };

  // ── Setup ────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <section ref={topRef} aria-label="Test settings" className="scroll-mt-24 space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <p className="text-sm text-zinc-300">
          {L(
            'Questions are drawn at random from the bank each time. Answers and explanations appear after you submit.',
            'Mỗi lần làm, hệ thống bốc ngẫu nhiên câu hỏi từ kho. Nộp bài xong mới hiện đáp án và giải thích.',
          )}
        </p>

        <div className="space-y-2">
          <div className={LABEL}>{L('Number of questions', 'Số câu')}</div>
          <div className="flex flex-wrap gap-2">
            {[...TEST_SIZES, 'all' as const].map((n) => (
              <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)} className={chip(size === n)}>
                {n === 'all' ? L('All', 'Tất cả') : n}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className={LABEL}>Domain</div>
          <div className="flex flex-wrap gap-2">
            {(['all', ...DOMAINS.map((d) => d.id)] as const).map((f) => {
              const d = f === 'all' ? null : getDomain(f);
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={domain === f}
                  title={d ? pick(d.name, mode) : undefined}
                  onClick={() => setDomain(f)}
                  className={chip(domain === f)}
                >
                  {d ? `D${d.number}` : L('All', 'Tất cả')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className={LABEL}>{L('Level', 'Mức độ')}</div>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((lv) => (
              <button
                key={lv.id}
                type="button"
                aria-pressed={level === lv.id}
                onClick={() => setLevel(lv.id)}
                className={chip(level === lv.id, lv.id === 'hard' ? 'amber' : lv.id === 'expert' ? 'rose' : 'green')}
              >
                {mode === 'vi' ? lv.vi : mode === 'en' || lv.label === lv.vi ? lv.label : `${lv.label} / ${lv.vi}`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
          <button type="button" onClick={start} disabled={pool.length === 0} className={BTN_PRIMARY}>
            {L(`Start test (${Math.min(wanted, pool.length)} questions)`, `Bắt đầu (${Math.min(wanted, pool.length)} câu)`)}
          </button>
          <span className="font-mono text-xs text-zinc-500">
            {pool.length === 0
              ? L('No questions match these filters.', 'Không có câu nào khớp bộ lọc này.')
              : wanted > pool.length
                ? L(`Only ${pool.length} questions match these filters.`, `Bộ lọc này chỉ có ${pool.length} câu.`)
                : L(`Drawn from ${pool.length} questions`, `Bốc từ ${pool.length} câu`)}
          </span>
        </div>
      </section>
    );
  }

  // ── Running ──────────────────────────────────────────────────────────────
  if (phase === 'running') {
    const scenario = SCENARIOS.find((s) => s.id === ids[index])!;
    const picked = answers[scenario.id];
    const last = index === ids.length - 1;
    return (
      <div ref={topRef} className="scroll-mt-24 space-y-5">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs text-zinc-400">
            <span aria-live="polite">
              {L(`${answered}/${ids.length} answered`, `Đã chọn ${answered}/${ids.length}`)}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={quit} className={BTN_SECONDARY}>
                {L('Quit', 'Bỏ bài')}
              </button>
              <button type="button" onClick={submit} className={BTN_PRIMARY}>
                {L('Submit test', 'Nộp bài')}
              </button>
            </span>
          </div>
          <ol className="flex flex-wrap gap-1.5" aria-label={L('Questions', 'Câu hỏi')}>
            {ids.map((id, i) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={i === index ? 'true' : undefined}
                  aria-label={`${i + 1}${answers[id] ? ' (answered)' : ''}`}
                  className={clsx(
                    'h-8 w-8 rounded-md border font-mono text-xs transition-colors',
                    i === index && 'ring-1 ring-zinc-300',
                    answers[id] ? 'border-green-500/40 bg-green-400/10 text-green-300' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
                  )}
                >
                  {i + 1}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <article aria-labelledby="test-q" className="space-y-6 rounded-xl border border-zinc-800 p-5 md:p-8">
          <h2 id="test-q" className="font-display text-xl font-bold text-white">
            {L(`Question ${index + 1} of ${ids.length}`, `Câu ${index + 1}/${ids.length}`)}
          </h2>
          <section aria-label="Situation" className="space-y-2">
            <div className={LABEL}>Situation / Tình huống</div>
            <T v={scenario.situation} mode={mode} className="leading-relaxed text-zinc-200" />
          </section>
          <fieldset className="space-y-3">
            <legend className="mb-3">
              <T v={scenario.question} mode={mode} className="font-semibold text-white" viClassName="font-normal" />
            </legend>
            {displayOptions(scenario).map((o, i) => (
              <label
                key={o.id}
                className={clsx(
                  'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                  picked === o.id ? 'border-green-500/60 bg-green-400/5' : 'border-zinc-800 hover:border-zinc-600',
                )}
              >
                <input
                  type="radio"
                  name={`test-${scenario.id}`}
                  value={o.id}
                  checked={picked === o.id}
                  onChange={() => setAnswers((a) => ({ ...a, [scenario.id]: o.id }))}
                  className="mt-1 h-4 w-4 flex-shrink-0 accent-green-400"
                />
                <span className="w-5 flex-shrink-0 font-mono text-sm text-zinc-400">{LETTERS[i]}.</span>
                <span className="min-w-0 flex-1 text-sm">
                  <T v={o.text} mode={mode} className="text-zinc-100" viClassName="text-[13px]" />
                </span>
              </label>
            ))}
          </fieldset>
          <footer className="flex flex-wrap justify-between gap-2 border-t border-zinc-800 pt-5">
            <button type="button" className={BTN_SECONDARY} disabled={index === 0} onClick={() => goTo(index - 1)}>
              ← {L('Prev', 'Câu trước')}
            </button>
            {last ? (
              <button type="button" className={BTN_PRIMARY} onClick={submit}>
                {L('Submit test', 'Nộp bài')}
              </button>
            ) : (
              <button type="button" className={BTN_SECONDARY} onClick={() => goTo(index + 1)}>
                {L('Next', 'Câu sau')} →
              </button>
            )}
          </footer>
        </article>
      </div>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────
  const g = grade!;
  return (
    <div ref={topRef} className="scroll-mt-24 space-y-6">
      <section aria-label="Result" className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 md:p-6">
        <div className={LABEL}>{L('Result', 'Kết quả')}</div>
        <p className="font-display text-3xl font-bold text-white">
          {g.correct}/{g.total} <span className={clsx('text-xl', g.percent >= 70 ? 'text-green-300' : 'text-amber-300')}>({g.percent}%)</span>
        </p>
        <table className="w-full max-w-md text-left text-sm">
          <tbody>
            {DOMAINS.filter((d) => g.byDomain.has(d.id)).map((d) => {
              const r = g.byDomain.get(d.id)!;
              return (
                <tr key={d.id} className="border-t border-zinc-800">
                  <td className="py-1.5 pr-4 text-zinc-300">
                    D{d.number} · {pick(d.name, mode === 'both' ? 'en' : mode)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-zinc-400">
                    {r.correct}/{r.total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARY} onClick={start} disabled={pool.length === 0}>
            {L('New test, same settings', 'Làm bài mới (giữ cài đặt)')}
          </button>
          <button type="button" className={BTN_SECONDARY} onClick={() => setPhase('setup')}>
            {L('Change settings', 'Đổi cài đặt')}
          </button>
        </div>
      </section>

      <section aria-label="Review" className="space-y-3">
        <div className={LABEL}>{L('Review', 'Xem lại')}</div>
        {g.items.map(({ scenario: s, picked, correct }, i) => (
          <details key={s.id} className="group rounded-lg border border-zinc-800 open:border-zinc-700">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4">
              <span className={clsx('w-5 flex-shrink-0 font-mono text-sm', correct ? 'text-green-300' : 'text-red-300')}>{correct ? '✓' : '✗'}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="text-zinc-100">
                  {i + 1}. {mode === 'vi' ? s.title.vi : s.title.en}
                </span>
                <span className="block font-mono text-xs text-zinc-500">
                  {L('Your answer', 'Bạn chọn')}: {picked ? letterFor(s, picked) : '—'} · {L('Answer', 'Đáp án')}: {letterFor(s, s.answer)}
                </span>
              </span>
              <span className="font-mono text-xs text-zinc-500 group-open:hidden">{L('Show', 'Xem')}</span>
            </summary>
            <div className="space-y-4 border-t border-zinc-800 p-4 text-sm">
              <T v={s.situation} mode={mode} className="leading-relaxed text-zinc-300" />
              <T v={s.question} mode={mode} className="font-semibold text-white" viClassName="font-normal" />
              <ul className="space-y-2">
                {displayOptions(s).map((o, k) => (
                  <li
                    key={o.id}
                    className={clsx(
                      'rounded-md border p-3',
                      o.id === s.answer ? 'border-green-500/50 bg-green-400/5' : o.id === picked ? 'border-red-500/40 bg-red-500/5' : 'border-zinc-800',
                    )}
                  >
                    <div className="flex gap-2">
                      <span className="font-mono text-zinc-400">{LETTERS[k]}.</span>
                      <T v={o.text} mode={mode} className="text-zinc-100" viClassName="text-[13px]" />
                    </div>
                    <div className="mt-2 pl-5">
                      <T v={o.why} mode={mode} className="leading-relaxed text-zinc-400" />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className={LABEL}>Explanation / Giải thích</div>
                <T v={s.explanation} mode={mode} className="leading-relaxed text-zinc-200" />
              </div>
              <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-400/5 p-4">
                <div className={clsx(LABEL, 'text-green-400/80')}>Remember / Ghi nhớ</div>
                <T v={s.takeaway} mode={mode} className="font-medium leading-relaxed text-zinc-100" viClassName="font-normal" />
              </div>
              <a href={`#${s.id}`} className="inline-block font-mono text-xs text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-green-400">
                {L('Open in practice mode (comments, report)', 'Mở ở chế độ luyện tập (comment, báo sai)')}
              </a>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
