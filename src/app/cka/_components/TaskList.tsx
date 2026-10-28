'use client';

import { SKILLS } from '@/lib/cka/curriculum.ts';
import { TASKS } from '@/lib/cka/tasks.ts';
import type { CodeStep } from '@/lib/cka/tasks.ts';
import { BTN_PRIMARY, CodeBlock, FOCUS_RING, LABEL } from './ui';

function Steps({ steps }: { steps: CodeStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="space-y-2">
          {s.text && <p className="text-sm leading-relaxed text-zinc-300">{s.text}</p>}
          {s.code && <CodeBlock code={s.code} />}
        </div>
      ))}
    </div>
  );
}

const SUMMARY = `flex cursor-pointer list-none items-center gap-2 rounded font-mono text-xs text-zinc-300 hover:text-white [&::-webkit-details-marker]:hidden ${FOCUS_RING}`;

export function TaskList({
  loaded,
  onLogAttempt,
}: {
  loaded: boolean;
  onLogAttempt: (skillId: string, taskId: string) => void;
}) {
  return (
    <section id="practice-tasks" aria-labelledby="tasks-heading" className="scroll-mt-24 space-y-6">
      <div className="space-y-2">
        <h2 id="tasks-heading" className="font-display text-2xl font-bold text-white">Practice tasks</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Original DamonSec exercises, each mapped to one official competency. They are not exam questions.
          Every task changes cluster state: run them in a throwaway lab cluster on your own machine, not on this website and not on a cluster you care about.
          Hints and solutions stay hidden until you open them.
        </p>
      </div>

      <ul className="space-y-3">
        {TASKS.map((t) => {
          const skill = SKILLS.find((s) => s.id === t.skillId)!;
          return (
            <li key={t.id}>
              <details id={t.id} className="group scroll-mt-24 rounded-xl border border-zinc-800 bg-zinc-900/40 open:bg-zinc-900/60">
                <summary className={`flex cursor-pointer list-none flex-col gap-1 rounded-xl p-4 sm:p-5 [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}>
                  <span className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-1 font-mono text-xs text-zinc-500 motion-safe:transition-transform group-open:rotate-90">▸</span>
                    <span className="flex-1">
                      <span className="block font-display text-base font-bold text-white">{t.title}</span>
                      <span className="mt-1 block font-mono text-[11px] text-zinc-400">
                        {t.kind === 'troubleshooting' ? 'Troubleshooting' : 'Build'} · about {t.estimateMinutes} min (estimate) · {skill.competency}
                      </span>
                    </span>
                  </span>
                </summary>

                <div className="space-y-6 border-t border-zinc-800 p-4 sm:p-5">
                  <div className="space-y-3">
                    <p className="text-sm leading-relaxed text-zinc-300">{t.scenario}</p>
                    <p className="text-sm leading-relaxed text-zinc-100">
                      <span className="font-semibold text-green-400">Objective: </span>{t.objective}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="font-semibold">Competency:</span> {skill.competency} (official)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className={LABEL}>Environment</h4>
                    <p className="text-sm text-zinc-300">{t.environment}</p>
                    {t.prerequisites.length > 0 && (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                        {t.prerequisites.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h4 className={LABEL}>Setup</h4>
                    <Steps steps={t.setup} />
                  </div>

                  <div className="space-y-2">
                    <h4 className={LABEL}>Done when</h4>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
                      {t.successCriteria.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h4 className={LABEL}>Verify</h4>
                    <Steps steps={t.verify} />
                  </div>

                  <div className="space-y-2">
                    <h4 className={LABEL}>Hints</h4>
                    {t.hints.map((h, i) => (
                      <details key={i} className="rounded-lg border border-zinc-800 px-3 py-2">
                        <summary className={SUMMARY}>Hint {i + 1}</summary>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{h}</p>
                      </details>
                    ))}
                  </div>

                  <details className="rounded-lg border border-amber-500/30 px-3 py-2">
                    <summary className={SUMMARY}>Reference solution</summary>
                    <div className="mt-3">
                      <Steps steps={t.solution} />
                    </div>
                  </details>

                  {t.cleanup.length > 0 && (
                    <div className="space-y-2">
                      <h4 className={LABEL}>Cleanup</h4>
                      <Steps steps={t.cleanup} />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                    <p className="text-xs text-zinc-500">{t.testedOn ?? 'Not yet run end to end by DamonSec.'}</p>
                    <button type="button" disabled={!loaded} className={BTN_PRIMARY} onClick={() => onLogAttempt(t.skillId, t.id)}>
                      Log an attempt
                    </button>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
