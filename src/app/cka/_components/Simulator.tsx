'use client';

import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { SKILLS } from '@/lib/cka/curriculum.ts';
import { CAPTURE_ENV, CAPTURED_ON, CAPTURES } from '@/lib/cka/simulation-captures.ts';
import { commandOutput, isRecorded, matchCommand, orderedOptions, suggestOutcome } from '@/lib/cka/simulations.ts';
import type { Simulation } from '@/lib/cka/simulations.ts';
import { getTask } from '@/lib/cka/tasks.ts';
import { formatDate } from '@/lib/cka/dates.ts';
import { AttemptForm } from './AttemptForm';
import type { AttemptInput } from './useTracker';
import { BTN_SECONDARY, FOCUS_RING, INPUT, LABEL } from './ui';

type Entry = { command: string; output: string; note?: string };

export function Simulator({
  sim,
  today,
  onLog,
  onOpenTask,
  onClose,
}: {
  sim: Simulation;
  today: string;
  onLog: (skillId: string, input: AttemptInput) => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [step, setStep] = useState(0);
  const [state, setState] = useState('start');
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<Record<string, string>>({});
  const [lastCorrect, setLastCorrect] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const startedAt = useRef(Date.now());
  const [minutes, setMinutes] = useState(1);
  const termRef = useRef<HTMLDivElement>(null);

  const finished = step >= sim.decisions.length;
  const decision = finished ? null : sim.decisions[step];
  const skill = SKILLS.find((s) => s.id === sim.skillId)!;
  const task = getTask(sim.taskId);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const run = (command: string, output: string, note?: string) =>
    setEntries((e) => [...e, { command, output: output === '' ? '(no output)' : output, note }]);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = matchCommand(sim, typed);
    if (!cmd) {
      setTypedError('This simulation only has recorded output for the commands listed above. Try that one on a real cluster.');
      return;
    }
    setTypedError(null);
    run(cmd.command, commandOutput(cmd, state));
    setTyped('');
  };

  const choose = (optionId: string) => {
    if (!decision) return;
    const opt = decision.options.find((o) => o.id === optionId)!;
    for (const s of opt.shows ?? []) run(s.command, CAPTURES[s.output], opt.correct ? undefined : 'rejected option');
    if (opt.correct) {
      setLastCorrect(opt.feedback);
      if (decision.stateAfter) setState(decision.stateAfter);
      setWrong({});
      if (step + 1 === sim.decisions.length) {
        setMinutes(Math.min(600, Math.max(1, Math.ceil((Date.now() - startedAt.current) / 60_000))));
      }
      setStep((n) => n + 1);
    } else {
      setLastCorrect(null);
      setMistakes((m) => m + 1);
      setWrong((w) => ({ ...w, [opt.id]: opt.feedback }));
    }
  };

  const outcome = suggestOutcome(mistakes);

  return (
    <div className="space-y-5 rounded-xl border border-green-500/30 bg-zinc-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">Simulation · {skill.competency}</p>
          <h3 className="font-display text-lg font-bold text-white">{sim.title}</h3>
        </div>
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>Close</button>
      </div>

      <p className="rounded-md border border-zinc-700 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-400">
        Not a live cluster. Every output below was recorded from a real run ({CAPTURE_ENV}, {formatDate(CAPTURED_ON)}),
        so names, IPs and ages are from that run. Only the listed commands have output, and the list changes as the scenario moves on.
      </p>

      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-zinc-200">{sim.briefing}</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-400">
          {sim.given.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </div>

      <div
        ref={termRef}
        role="log"
        aria-label="Simulated terminal"
        aria-live="polite"
        tabIndex={0}
        className={clsx('max-h-96 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] leading-relaxed', FOCUS_RING)}
      >
        {entries.length === 0 ? (
          <p className="text-zinc-500">Run a command to start investigating.</p>
        ) : (
          entries.map((e, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="whitespace-pre-wrap break-all text-green-400">
                $ {e.command}
                {e.note && <span className="text-zinc-500">  # {e.note}</span>}
              </p>
              <pre className="whitespace-pre-wrap break-words text-zinc-300">{e.output}</pre>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h4 className={LABEL}>Investigate</h4>
        <ul className="flex flex-col gap-1.5">
          {sim.commands.filter((c) => isRecorded(c, state)).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => run(c.command, commandOutput(c, state))}
                className={clsx('w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-left font-mono text-[12px] text-zinc-200 hover:border-green-500/40 hover:text-white', FOCUS_RING)}
              >
                <span className="text-green-500" aria-hidden="true">$ </span>{c.command}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={submitTyped} className="flex gap-2 pt-1">
          <label htmlFor={`${uid}-cmd`} className="sr-only">Type a command</label>
          <input
            id={`${uid}-cmd`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="or type one of them (k works for kubectl)"
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} flex-1 font-mono text-[12px]`}
          />
          <button type="submit" className={BTN_SECONDARY}>Run</button>
        </form>
        {typedError && <p role="alert" className="text-xs text-amber-300">{typedError}</p>}
      </div>

      {lastCorrect && <p className="text-sm text-green-300" role="status">✓ {lastCorrect}</p>}

      {decision && (
        <fieldset className="space-y-3 rounded-lg border border-zinc-700 p-4">
          <legend className="px-1 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
            Step {step + 1} of {sim.decisions.length}
          </legend>
          <p className="text-sm font-semibold text-zinc-100">{decision.prompt}</p>
          <ul className="space-y-2">
            {orderedOptions(decision).map((o) => {
              const fb = wrong[o.id];
              return (
                <li key={o.id} className="space-y-1">
                  <button
                    type="button"
                    disabled={Boolean(fb)}
                    onClick={() => choose(o.id)}
                    className={clsx(
                      'w-full rounded-md border px-3 py-2 text-left text-sm',
                      /^kubectl /.test(o.label) ? 'font-mono text-[12px]' : '',
                      fb ? 'border-red-500/30 text-zinc-500 line-through decoration-red-500/50' : 'border-zinc-700 text-zinc-200 hover:border-green-500/40 hover:text-white',
                      FOCUS_RING,
                    )}
                  >
                    {o.label}
                  </button>
                  {fb && <p className="pl-3 text-xs text-red-300">✗ {fb}</p>}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {finished && (
        <div className="space-y-4 rounded-lg border border-zinc-700 p-4">
          <h4 className="font-display text-base font-bold text-white">Solved</h4>
          <p className="text-sm text-zinc-300">
            {mistakes === 0 ? 'No wrong picks.' : `${mistakes} wrong pick${mistakes === 1 ? '' : 's'} along the way.`} About {minutes} min.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-300">
            {sim.debrief.map((d) => <li key={d}>{d}</li>)}
          </ul>
          {task && (
            <p className="text-sm text-zinc-400">
              Next step: repeat it for real on a lab cluster with the task{' '}
              <a href={`#${task.id}`} onClick={(e) => { e.preventDefault(); onOpenTask(task.id); }} className={`text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400 ${FOCUS_RING}`}>
                {task.title}
              </a>.
            </p>
          )}
          {logged ? (
            <p className="text-sm text-green-300" role="status">Saved to the practice history of “{skill.competency}”.</p>
          ) : (
            <AttemptForm
              skillId={sim.skillId}
              today={today}
              initial={{
                outcome: outcome.suggested,
                minutes,
                notes: `Simulation: ${sim.title}. ${mistakes} wrong pick${mistakes === 1 ? '' : 's'}.`,
                taskId: sim.id,
              }}
              submitLabel="Save to history"
              onSubmit={(input) => {
                onLog(sim.skillId, input);
                setLogged(true);
              }}
              onCancel={onClose}
            />
          )}
        </div>
      )}
    </div>
  );
}
