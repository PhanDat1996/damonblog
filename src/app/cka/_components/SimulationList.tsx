'use client';

import { SKILLS } from '@/lib/cka/curriculum.ts';
import { SIMULATIONS, getSimulation } from '@/lib/cka/simulations.ts';
import { Simulator } from './Simulator';
import type { AttemptInput } from './useTracker';
import { BTN_PRIMARY } from './ui';

export function SimulationList({
  loaded,
  today,
  activeId,
  setActiveId,
  onLog,
  onOpenTask,
}: {
  loaded: boolean;
  today: string | null;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onLog: (skillId: string, input: AttemptInput) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const active = activeId ? getSimulation(activeId) : undefined;
  return (
    <section id="simulations" aria-labelledby="sims-heading" className="scroll-mt-24 space-y-6">
      <div className="space-y-2">
        <h2 id="sims-heading" className="font-display text-2xl font-bold text-white">Troubleshooting simulations</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Practise the diagnosis without a cluster. Pick commands, read real recorded output, and decide what is wrong and how to fix it.
          A simulation only follows a script, so finish by repeating the matching lab task on a real cluster.
        </p>
      </div>

      {active && today ? (
        <Simulator
          key={active.id}
          sim={active}
          today={today}
          onLog={onLog}
          onOpenTask={onOpenTask}
          onClose={() => setActiveId(null)}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-3">
          {SIMULATIONS.map((s) => {
            const skill = SKILLS.find((k) => k.id === s.skillId)!;
            return (
              <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex-1 space-y-1">
                  <h3 className="font-display text-base font-bold text-white">{s.title}</h3>
                  <p className="font-mono text-[11px] text-zinc-400">about {s.estimateMinutes} min (estimate) · {skill.competency}</p>
                </div>
                <button type="button" disabled={!loaded} className={`${BTN_PRIMARY} self-start`} onClick={() => setActiveId(s.id)}>
                  Start simulation
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
