// Progress calculations. Pure functions; `today` is always passed in.

import { DOMAINS, SKILLS } from './curriculum.ts';
import type { Domain, Skill } from './curriculum.ts';
import { daysBetween, isInWeekOf, weekEnd, weekStart } from './dates.ts';
import { getSkillProgress } from './storage.ts';
import type { Attempt, SkillProgress, SkillStatus, TrackerState } from './storage.ts';

/** Newest attempt by practice date, then by when it was logged. */
export function latestAttempt(progress: SkillProgress): Attempt | null {
  let best: Attempt | null = null;
  for (const a of progress.attempts) {
    if (!best || a.date > best.date || (a.date === best.date && a.createdAt > best.createdAt)) best = a;
  }
  return best;
}

export function lastPracticed(progress: SkillProgress): string | null {
  return latestAttempt(progress)?.date ?? null;
}

/** Attempts newest first. */
export function sortedAttempts(progress: SkillProgress): Attempt[] {
  return [...progress.attempts].sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );
}

export interface DomainProgress {
  domain: Domain;
  total: number;
  started: number;
  independent: number;
  byStatus: Record<SkillStatus, number>;
}

export interface WeekProgress {
  start: string;
  end: string;
  minutes: number;
  attempts: number;
  goalMinutes: number | null;
  /** 0-100, capped. null when no goal is set. */
  goalPct: number | null;
}

export interface ProgressSummary {
  total: number;
  /** Skills with any status other than 'not_started'. */
  started: number;
  independent: number;
  coveragePct: number;
  independentPct: number;
  domains: DomainProgress[];
  week: WeekProgress;
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function emptyCounts(): Record<SkillStatus, number> {
  return { not_started: 0, learning: 0, guided: 0, independent: 0 };
}

export function computeWeek(state: TrackerState, today: string): WeekProgress {
  let minutes = 0;
  let attempts = 0;
  // Counts every logged attempt, including ones saved under skill IDs that
  // are no longer in the curriculum: the time was still spent studying.
  for (const progress of Object.values(state.skills)) {
    for (const a of progress.attempts) {
      if (isInWeekOf(a.date, today)) {
        minutes += a.minutes;
        attempts += 1;
      }
    }
  }
  const goal = state.settings.weeklyGoalMinutes;
  return {
    start: weekStart(today),
    end: weekEnd(today),
    minutes,
    attempts,
    goalMinutes: goal,
    goalPct: goal ? Math.min(100, pct(minutes, goal)) : null,
  };
}

export function computeProgress(
  state: TrackerState,
  today: string,
  skills: Skill[] = SKILLS,
  domains: Domain[] = DOMAINS,
): ProgressSummary {
  const domainMap = new Map<string, DomainProgress>(
    domains.map((d) => [d.id, { domain: d, total: 0, started: 0, independent: 0, byStatus: emptyCounts() }]),
  );
  let started = 0;
  let independent = 0;
  for (const skill of skills) {
    const { status } = getSkillProgress(state, skill.id);
    const dp = domainMap.get(skill.domainId);
    if (dp) {
      dp.total += 1;
      dp.byStatus[status] += 1;
      if (status !== 'not_started') dp.started += 1;
      if (status === 'independent') dp.independent += 1;
    }
    if (status !== 'not_started') started += 1;
    if (status === 'independent') independent += 1;
  }
  return {
    total: skills.length,
    started,
    independent,
    coveragePct: pct(started, skills.length),
    independentPct: pct(independent, skills.length),
    domains: [...domainMap.values()],
    week: computeWeek(state, today),
  };
}

export type Countdown =
  | { kind: 'none' }
  | { kind: 'future'; days: number }
  | { kind: 'today' }
  | { kind: 'past'; days: number };

export function countdown(targetDate: string | null, today: string): Countdown {
  if (!targetDate) return { kind: 'none' };
  const days = daysBetween(today, targetDate);
  if (days > 0) return { kind: 'future', days };
  if (days === 0) return { kind: 'today' };
  return { kind: 'past', days: -days };
}
