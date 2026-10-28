// "Practice today" recommendations.
//
// Deterministic: the same state and date always give the same result.
// Candidates are collected in four tiers, in this priority order:
//
//   1. retry   Latest attempt was unsuccessful or needed hints
//              (unsuccessful first, then the oldest such attempt).
//   2. stale   Status is Learning or Can do with guidance, and the skill has
//              not been practiced in the last RECENT_DAYS days
//              (never-practiced first, then least recently practiced).
//   3. new     Not started. Taken round-robin across domains in order of exam
//              weight, so a new user gets a spread rather than three skills
//              from one domain.
//   4. review  Marked independent and not practiced for REVIEW_INTERVAL_DAYS
//              (never-practiced first, then least recently practiced).
//
// A skill appears at most once (its highest tier wins). Ties keep curriculum
// order. The first `limit` candidates are returned.

import { DOMAINS, SKILLS, getDomain } from './curriculum.ts';
import type { Skill } from './curriculum.ts';
import { addDays, daysBetween } from './dates.ts';
import { latestAttempt } from './progress.ts';
import { STATUS_OPTIONS, getSkillProgress } from './storage.ts';
import type { SkillProgress, TrackerState } from './storage.ts';
import { TASKS } from './tasks.ts';
import type { PracticeTask } from './tasks.ts';

export const RECENT_DAYS = 3;
export const REVIEW_INTERVAL_DAYS = 14;

export type SuggestionKind = 'retry' | 'stale' | 'new' | 'review';

export interface Suggestion {
  skillId: string;
  kind: SuggestionKind;
  reason: string;
  /** A practice task for this skill, if one exists. */
  taskId: string | null;
}

export interface Recommendations {
  suggestions: Suggestion[];
  allIndependent: boolean;
  /** When the list is empty: the first day something becomes due. */
  nextDueDate: string | null;
}

function ago(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function pickTask(skillId: string, progress: SkillProgress, tasks: PracticeTask[]): string | null {
  const candidates = tasks.filter((t) => t.skillId === skillId);
  if (candidates.length === 0) return null;
  const last = latestAttempt(progress);
  if (last?.taskId && last.outcome !== 'independent' && candidates.some((t) => t.id === last.taskId)) {
    return last.taskId;
  }
  const doneAlone = new Set(progress.attempts.filter((a) => a.outcome === 'independent' && a.taskId).map((a) => a.taskId));
  return (candidates.find((t) => !doneAlone.has(t.id)) ?? candidates[0]).id;
}

export function recommend(
  state: TrackerState,
  today: string,
  opts: { skills?: Skill[]; tasks?: PracticeTask[]; limit?: number } = {},
): Recommendations {
  const skills = opts.skills ?? SKILLS;
  const tasks = opts.tasks ?? TASKS;
  const limit = opts.limit ?? 3;

  type Row = { skill: Skill; index: number; progress: SkillProgress; last: string | null };
  const rows: Row[] = skills.map((skill, index) => {
    const progress = getSkillProgress(state, skill.id);
    return { skill, index, progress, last: latestAttempt(progress)?.date ?? null };
  });

  const ordered: Suggestion[] = [];
  const used = new Set<string>();
  const push = (row: Row, kind: SuggestionKind, reason: string) => {
    if (used.has(row.skill.id)) return;
    used.add(row.skill.id);
    ordered.push({ skillId: row.skill.id, kind, reason, taskId: pickTask(row.skill.id, row.progress, tasks) });
  };
  const byLastThenIndex = (a: Row, b: Row) => {
    if (a.last !== b.last) {
      if (a.last === null) return -1;
      if (b.last === null) return 1;
      return a.last < b.last ? -1 : 1;
    }
    return a.index - b.index;
  };

  // 1. retry
  const retry = rows
    .map((r) => ({ r, a: latestAttempt(r.progress) }))
    .filter((x) => x.a && x.a.outcome !== 'independent')
    .sort((x, y) => {
      const rank = (o: string) => (o === 'unsuccessful' ? 0 : 1);
      return rank(x.a!.outcome) - rank(y.a!.outcome) || byLastThenIndex(x.r, y.r);
    });
  for (const { r, a } of retry) {
    const when = ago(daysBetween(a!.date, today));
    push(r, 'retry', a!.outcome === 'unsuccessful'
      ? `Your last attempt (${when}) was unsuccessful. Go again while the details are fresh.`
      : `Your last attempt (${when}) needed hints. Try it again without them.`);
  }

  // 2. stale
  const stale = rows
    .filter((r) => (r.progress.status === 'learning' || r.progress.status === 'guided')
      && (r.last === null || daysBetween(r.last, today) >= RECENT_DAYS))
    .sort(byLastThenIndex);
  for (const r of stale) {
    const label = STATUS_OPTIONS.find((s) => s.id === r.progress.status)!.label;
    push(r, 'stale', r.last === null
      ? `Marked "${label}" but no practice is logged yet.`
      : `Marked "${label}", last practiced ${ago(daysBetween(r.last, today))}.`);
  }

  // 3. new (round-robin by domain weight)
  const domainOrder = [...DOMAINS].sort((a, b) => b.weight - a.weight);
  const queues = domainOrder.map((d) => rows.filter((r) => r.skill.domainId === d.id && r.progress.status === 'not_started'));
  for (let round = 0; queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      const r = q[round];
      if (!r) continue;
      const d = getDomain(r.skill.domainId);
      push(r, 'new', `Not started yet. ${d.name} is ${d.weight}% of the exam.`);
    }
  }

  // 4. review
  const review = rows
    .filter((r) => r.progress.status === 'independent'
      && (r.last === null || daysBetween(r.last, today) >= REVIEW_INTERVAL_DAYS))
    .sort(byLastThenIndex);
  for (const r of review) {
    push(r, 'review', r.last === null
      ? 'Marked independent, but no practice is logged. A timed run from scratch confirms it.'
      : `Marked independent, last practiced ${ago(daysBetween(r.last, today))}. Due for its ${REVIEW_INTERVAL_DAYS}-day review.`);
  }

  const allIndependent = rows.length > 0 && rows.every((r) => r.progress.status === 'independent');

  let nextDueDate: string | null = null;
  if (ordered.length === 0) {
    for (const r of rows) {
      if (r.last === null) continue;
      const s = r.progress.status;
      const due = s === 'independent' ? addDays(r.last, REVIEW_INTERVAL_DAYS)
        : s === 'learning' || s === 'guided' ? addDays(r.last, RECENT_DAYS)
          : null;
      if (due && (nextDueDate === null || due < nextDueDate)) nextDueDate = due;
    }
  }

  return { suggestions: ordered.slice(0, limit), allIndependent, nextDueDate };
}
