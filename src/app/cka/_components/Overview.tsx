'use client';

import { useState } from 'react';
import { formatDate, isIsoDate } from '@/lib/cka/dates.ts';
import { countdown } from '@/lib/cka/progress.ts';
import type { ProgressSummary } from '@/lib/cka/progress.ts';
import { LIMITS } from '@/lib/cka/storage.ts';
import type { Settings } from '@/lib/cka/storage.ts';
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from './ui';

function Stat({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className={LABEL}>{label}</dt>
      <dd className="font-display text-2xl font-bold text-white">{value}</dd>
      <dd className="text-xs leading-snug text-zinc-400">{detail}</dd>
    </div>
  );
}

function shortDate(iso: string) {
  return formatDate(iso).replace(/^\w+, /, '').replace(/, \d{4}$/, '');
}

export function Overview({
  loaded,
  today,
  progress,
  settings,
  onSaveSettings,
}: {
  loaded: boolean;
  today: string | null;
  progress: ProgressSummary | null;
  settings: Settings;
  onSaveSettings: (s: Settings) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!loaded || !today || !progress) {
    return (
      <section aria-labelledby="overview-heading" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 id="overview-heading" className="font-display text-lg font-bold text-white">Your progress</h2>
        <p className="mt-3 text-sm text-zinc-400">Loading progress saved in this browser…</p>
      </section>
    );
  }

  const cd = countdown(settings.targetDate, today);
  const w = progress.week;

  return (
    <section aria-labelledby="overview-heading" className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <h2 id="overview-heading" className="font-display text-lg font-bold text-white">Your progress</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat
          label="Independent"
          value={`${progress.independent}/${progress.total}`}
          detail={`${progress.independentPct}% of skills you marked "Can do independently"`}
        />
        <Stat
          label="Coverage"
          value={`${progress.started}/${progress.total}`}
          detail={`${progress.coveragePct}% of skills started (any status except Not started)`}
        />
        <Stat
          label="This week"
          value={`${w.minutes} min`}
          detail={
            <>
              {w.goalMinutes ? (w.minutes >= w.goalMinutes ? `${w.goalMinutes} min goal reached. ` : `of ${w.goalMinutes} min goal (${w.goalPct}%). `) : ''}
              {w.attempts} attempt{w.attempts === 1 ? '' : 's'} logged {shortDate(w.start)} – {shortDate(w.end)}
            </>
          }
        />
        <Stat
          label="Exam date"
          value={
            cd.kind === 'future' ? `${cd.days} day${cd.days === 1 ? '' : 's'}`
              : cd.kind === 'today' ? 'Today'
                : cd.kind === 'past' ? 'Passed'
                  : '—'
          }
          detail={
            cd.kind === 'none' ? 'No target date set'
              : cd.kind === 'past' ? `${formatDate(settings.targetDate!)} was ${cd.days} day${cd.days === 1 ? '' : 's'} ago. Set a new date or clear it.`
                : `until ${formatDate(settings.targetDate!)}`
          }
        />
      </dl>

      {w.goalPct !== null && (
        <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-green-400" style={{ width: `${w.goalPct}%` }} />
        </div>
      )}

      {editing ? (
        <SettingsForm
          today={today}
          settings={settings}
          onSave={(s) => {
            onSaveSettings(s);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-4">
          <p className="text-xs text-zinc-400">
            {settings.targetDate || settings.weeklyGoalMinutes
              ? 'Target date and weekly goal are optional.'
              : 'Optional: set a target exam date and a weekly study goal.'}
          </p>
          <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)}>
            {settings.targetDate || settings.weeklyGoalMinutes ? 'Edit goals' : 'Set goals'}
          </button>
        </div>
      )}
    </section>
  );
}

function SettingsForm({
  today,
  settings,
  onSave,
  onCancel,
}: {
  today: string;
  settings: Settings;
  onSave: (s: Settings) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(settings.targetDate ?? '');
  const [goal, setGoal] = useState(settings.weeklyGoalMinutes ? String(settings.weeklyGoalMinutes) : '');
  const [error, setError] = useState<string | null>(null);
  const pastWarning = isIsoDate(date) && date < today;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (date && !isIsoDate(date)) return setError('Enter the target date as a full date.');
    const g = goal.trim() === '' ? null : Number(goal);
    if (g !== null && (!Number.isInteger(g) || g < 1 || g > LIMITS.weeklyGoalMax)) {
      return setError(`Weekly goal must be a whole number from 1 to ${LIMITS.weeklyGoalMax} minutes, or empty.`);
    }
    onSave({ targetDate: date || null, weeklyGoalMinutes: g });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 border-t border-zinc-800 pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="cka-target" className={LABEL}>Target exam date</label>
          <input id="cka-target" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${INPUT} w-full`} aria-describedby="cka-target-help" />
          <p id="cka-target-help" className="text-xs text-zinc-500">Leave empty if you have not booked yet.</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="cka-goal" className={LABEL}>Weekly goal (minutes)</label>
          <input id="cka-goal" type="number" inputMode="numeric" min={1} max={LIMITS.weeklyGoalMax} step={15} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 300" className={`${INPUT} w-full`} aria-describedby="cka-goal-help" />
          <p id="cka-goal-help" className="text-xs text-zinc-500">Compared with minutes from logged attempts, Monday to Sunday.</p>
        </div>
      </div>
      {pastWarning && <p className="text-sm text-amber-300">That date is in the past. You can still save it.</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY}>Save</button>
        <button type="button" onClick={onCancel} className={BTN_SECONDARY}>Cancel</button>
      </div>
    </form>
  );
}
