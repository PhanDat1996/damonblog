'use client';

import { SKILLS, getDomain } from '@/lib/cka/curriculum.ts';
import { formatDate } from '@/lib/cka/dates.ts';
import type { Recommendations, SuggestionKind } from '@/lib/cka/recommend.ts';
import { getTask } from '@/lib/cka/tasks.ts';
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS_RING } from './ui';

const KIND_LABEL: Record<SuggestionKind, string> = {
  retry: 'Retry',
  stale: 'Keep going',
  new: 'Start',
  review: 'Review',
};

export function PracticeToday({
  loaded,
  recs,
  onOpenSkill,
  onOpenTask,
  onLog,
}: {
  loaded: boolean;
  recs: Recommendations | null;
  onOpenSkill: (skillId: string) => void;
  onOpenTask: (taskId: string) => void;
  onLog: (skillId: string, taskId: string | null) => void;
}) {
  return (
    <section aria-labelledby="today-heading" className="space-y-4 rounded-xl border border-green-500/30 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-heading" className="font-display text-lg font-bold text-white">Practice today</h2>
        <a href="#how-it-works" className={`font-mono text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-green-400 ${FOCUS_RING}`}>
          How suggestions work
        </a>
      </div>

      {!loaded || !recs ? (
        <p className="text-sm text-zinc-400">Loading suggestions…</p>
      ) : recs.suggestions.length === 0 ? (
        <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
          {recs.allIndependent ? (
            <p>Every skill is marked independent and has been practiced in the last two weeks. Nothing is due.</p>
          ) : (
            <p>Everything you have started was practiced in the last few days, and nothing is waiting to be started.</p>
          )}
          {recs.nextDueDate && <p className="text-zinc-400">Next suggestion becomes due on {formatDate(recs.nextDueDate)}. A full timed mock exam is a good use of the time.</p>}
        </div>
      ) : (
        <ol className="space-y-3">
          {recs.suggestions.map((s, i) => {
            const skill = SKILLS.find((x) => x.id === s.skillId)!;
            const task = s.taskId ? getTask(s.taskId) : undefined;
            return (
              <li key={s.skillId} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                  {i + 1}. {KIND_LABEL[s.kind]} · {getDomain(skill.domainId).name}
                </p>
                <p className="text-[15px] leading-snug text-zinc-100">{skill.competency}</p>
                <p className="text-sm text-zinc-400">{s.reason}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {task ? (
                    <button type="button" className={BTN_PRIMARY} onClick={() => onOpenTask(task.id)}>
                      Open task: {task.title}
                    </button>
                  ) : (
                    <button type="button" className={BTN_PRIMARY} onClick={() => onOpenSkill(skill.id)}>
                      Open skill and docs
                    </button>
                  )}
                  <button type="button" className={BTN_SECONDARY} onClick={() => onLog(skill.id, task?.id ?? null)}>
                    Log attempt
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
