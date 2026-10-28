'use client';

import { useId, useState } from 'react';
import { isIsoDate } from '@/lib/cka/dates.ts';
import { LIMITS, OUTCOME_OPTIONS } from '@/lib/cka/storage.ts';
import type { AttemptOutcome } from '@/lib/cka/storage.ts';
import { simulationsForSkill } from '@/lib/cka/simulations.ts';
import { TASKS } from '@/lib/cka/tasks.ts';
import type { AttemptInput } from './useTracker';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './ui';

export function AttemptForm({
  skillId,
  today,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  skillId: string;
  today: string;
  initial?: Partial<AttemptInput>;
  submitLabel: string;
  onSubmit: (input: AttemptInput) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const tasks = TASKS.filter((t) => t.skillId === skillId);
  const sims = simulationsForSkill(skillId);
  const [date, setDate] = useState(initial?.date ?? today);
  const [outcome, setOutcome] = useState<AttemptOutcome | ''>(initial?.outcome ?? '');
  const [minutes, setMinutes] = useState(initial?.minutes ? String(initial.minutes) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [taskId, setTaskId] = useState(initial?.taskId ?? '');
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    const mins = Number(minutes);
    if (!isIsoDate(date)) errs.push('Pick a valid date.');
    else if (date > today) errs.push('The date cannot be in the future.');
    if (!outcome) errs.push('Choose an outcome.');
    if (!Number.isInteger(mins) || mins < 1 || mins > LIMITS.attemptMinutesMax) {
      errs.push(`Duration must be a whole number from 1 to ${LIMITS.attemptMinutesMax} minutes.`);
    }
    setErrors(errs);
    if (errs.length || !outcome) return;
    onSubmit({ date, outcome, minutes: mins, notes: notes.trim(), taskId: taskId || null });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-lg border border-zinc-700/80 bg-zinc-900/70 p-4">
      <fieldset className="space-y-2">
        <legend className={LABEL}>Outcome</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {OUTCOME_OPTIONS.map((o) => (
            <label key={o.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
              <input
                type="radio"
                name={`${uid}-outcome`}
                value={o.id}
                checked={outcome === o.id}
                onChange={() => setOutcome(o.id)}
                className="h-4 w-4 accent-green-400"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-date`} className={LABEL}>Date</label>
          <input id={`${uid}-date`} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-full`} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-min`} className={LABEL}>Duration (minutes)</label>
          <input id={`${uid}-min`} type="number" inputMode="numeric" min={1} max={LIMITS.attemptMinutesMax} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${INPUT} w-full`} />
        </div>
      </div>

      {tasks.length + sims.length > 0 && (
        <div className="space-y-1">
          <label htmlFor={`${uid}-task`} className={LABEL}>Practice task or simulation (optional)</label>
          <select id={`${uid}-task`} value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${INPUT} w-full`}>
            <option value="">Own practice</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
            {sims.map((s) => (
              <option key={s.id} value={s.id}>Simulation: {s.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor={`${uid}-notes`} className={LABEL}>Notes (optional)</label>
        <textarea id={`${uid}-notes`} rows={2} maxLength={LIMITS.attemptNotes} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What slowed you down? Which doc page did you need?" className={`${INPUT} w-full`} />
      </div>

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 text-sm text-red-300">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <p className="text-xs text-zinc-500">Logging an attempt does not change the skill&apos;s status. Update the status yourself when you are ready.</p>

      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY}>{submitLabel}</button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>
      </div>
    </form>
  );
}
