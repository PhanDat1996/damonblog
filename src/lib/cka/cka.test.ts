// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { DOMAINS, SKILLS, SKILL_IDS } from './curriculum.ts';
import { TASKS } from './tasks.ts';
import { addDays, daysBetween, isInWeekOf, isIsoDate, toLocalIsoDate, weekEnd, weekStart } from './dates.ts';
import { buildExport, emptyState, normalizeState, parseImport, parseStored, SCHEMA_VERSION } from './storage.ts';
import type { Attempt, AttemptOutcome, SkillStatus, TrackerState } from './storage.ts';
import { computeProgress, countdown, latestAttempt } from './progress.ts';
import { recommend, RECENT_DAYS, REVIEW_INTERVAL_DAYS } from './recommend.ts';
import { CAPTURES } from './simulation-captures.ts';
import { SIMULATIONS, commandOutput, getSimulation, matchCommand, orderedOptions, practiceItemTitle, suggestOutcome } from './simulations.ts';

let seq = 0;
function attempt(date: string, outcome: AttemptOutcome, minutes = 30, extra: Partial<Attempt> = {}): Attempt {
  seq += 1;
  return { id: `t${seq}`, date, outcome, minutes, notes: '', taskId: null, createdAt: `${date}T10:00:${String(seq % 60).padStart(2, '0')}.000Z`, ...extra };
}
function withSkill(state: TrackerState, id: string, status: SkillStatus, attempts: Attempt[] = []): TrackerState {
  state.skills[id] = { status, notes: '', attempts };
  return state;
}

// ── Curriculum integrity ────────────────────────────────────────────────────

test('curriculum: weights sum to 100 and every skill belongs to a domain', () => {
  assert.equal(DOMAINS.reduce((s, d) => s + d.weight, 0), 100);
  assert.equal(SKILLS.length, 27);
  for (const s of SKILLS) assert.ok(DOMAINS.some((d) => d.id === s.domainId), s.id);
  assert.equal(SKILL_IDS.size, SKILLS.length, 'skill IDs are unique');
});

test('curriculum: related posts exist in /posts', () => {
  for (const s of SKILLS) {
    for (const slug of s.relatedPosts) {
      assert.ok(existsSync(join(process.cwd(), 'posts', `${slug}.md`)), `${s.id} -> ${slug}`);
    }
  }
});

test('tasks: at least eight, unique IDs, mapped to real skills, complete', () => {
  assert.ok(TASKS.length >= 8);
  assert.equal(new Set(TASKS.map((t) => t.id)).size, TASKS.length);
  const domains = new Set<string>();
  for (const t of TASKS) {
    assert.ok(SKILL_IDS.has(t.skillId), t.id);
    domains.add(SKILLS.find((s) => s.id === t.skillId)!.domainId);
    assert.ok(t.setup.length && t.verify.length && t.solution.length && t.successCriteria.length, t.id);
    assert.ok(t.hints.length >= 2, t.id);
    assert.ok(t.estimateMinutes > 0, t.id);
  }
  assert.equal(domains.size, DOMAINS.length, 'tasks cover every domain');
});

// ── Dates ───────────────────────────────────────────────────────────────────

test('dates: ISO validation rejects impossible days', () => {
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(isIsoDate('2028-02-29'));
  assert.ok(!isIsoDate('2026-02-29'));
  assert.ok(!isIsoDate('2026-13-01'));
  assert.ok(!isIsoDate('2026-1-1'));
  assert.ok(!isIsoDate(20261028));
});

test('dates: week runs Monday to Sunday', () => {
  // 2026-10-28 is a Wednesday.
  assert.equal(weekStart('2026-10-28'), '2026-10-26');
  assert.equal(weekEnd('2026-10-28'), '2026-11-01');
  assert.equal(weekStart('2026-10-26'), '2026-10-26', 'Monday is its own week start');
  assert.equal(weekStart('2026-11-01'), '2026-10-26', 'Sunday belongs to the week before');
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'week spanning a year boundary');
  assert.ok(isInWeekOf('2026-11-01', '2026-10-26'));
  assert.ok(!isInWeekOf('2026-11-02', '2026-10-28'));
  assert.ok(!isInWeekOf('2026-10-25', '2026-10-28'));
});

test('dates: day arithmetic ignores DST and uses the local calendar day', () => {
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(daysBetween('2026-11-01', '2026-10-28'), -4);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(toLocalIsoDate(new Date(2026, 9, 28, 23, 59)), '2026-10-28');
  assert.equal(toLocalIsoDate(new Date(2026, 9, 29, 0, 1)), '2026-10-29');
});

// ── Progress ────────────────────────────────────────────────────────────────

test('progress: coverage and independent completion are separate', () => {
  const s = emptyState();
  withSkill(s, 'storage.pv-pvc', 'learning');
  withSkill(s, 'cluster.rbac', 'guided');
  withSkill(s, 'networking.coredns', 'independent');
  withSkill(s, 'retired.old-skill', 'independent'); // not in curriculum: ignored
  const p = computeProgress(s, '2026-10-28');
  assert.equal(p.total, 27);
  assert.equal(p.started, 3);
  assert.equal(p.independent, 1);
  assert.equal(p.coveragePct, 11);
  assert.equal(p.independentPct, 4);
  const storage = p.domains.find((d) => d.domain.id === 'storage')!;
  assert.deepEqual([storage.total, storage.started, storage.independent], [3, 1, 0]);
  assert.equal(p.domains.reduce((n, d) => n + d.total, 0), 27);
});

test('progress: weekly minutes count only this calendar week', () => {
  const s = emptyState();
  s.settings.weeklyGoalMinutes = 120;
  withSkill(s, 'storage.pv-pvc', 'learning', [
    attempt('2026-10-25', 'hints', 90), // Sunday of previous week
    attempt('2026-10-26', 'hints', 40), // Monday
    attempt('2026-11-01', 'independent', 50), // Sunday
  ]);
  withSkill(s, 'retired.old-skill', 'learning', [attempt('2026-10-27', 'hints', 20)]);
  const p = computeProgress(s, '2026-10-28');
  assert.equal(p.week.minutes, 110);
  assert.equal(p.week.attempts, 3);
  assert.equal(p.week.goalPct, 92);
  s.settings.weeklyGoalMinutes = 60;
  assert.equal(computeProgress(s, '2026-10-28').week.goalPct, 100, 'capped at 100');
  s.settings.weeklyGoalMinutes = null;
  assert.equal(computeProgress(s, '2026-10-28').week.goalPct, null);
});

test('progress: countdown handles none, future, today and past', () => {
  assert.deepEqual(countdown(null, '2026-10-28'), { kind: 'none' });
  assert.deepEqual(countdown('2026-11-30', '2026-10-28'), { kind: 'future', days: 33 });
  assert.deepEqual(countdown('2026-10-28', '2026-10-28'), { kind: 'today' });
  assert.deepEqual(countdown('2026-10-20', '2026-10-28'), { kind: 'past', days: 8 });
});

test('progress: latest attempt orders by date, then logging time', () => {
  const a = attempt('2026-10-20', 'independent');
  const b = { ...attempt('2026-10-22', 'hints'), createdAt: '2026-10-22T08:00:00.000Z' };
  const c = { ...attempt('2026-10-22', 'unsuccessful'), createdAt: '2026-10-22T09:00:00.000Z' };
  const d = { ...attempt('2026-10-21', 'independent'), createdAt: '2026-10-30T09:00:00.000Z' }; // logged late
  assert.equal(latestAttempt({ status: 'learning', notes: '', attempts: [a, c, d, b] })?.id, c.id);
});

// ── Recommendations ─────────────────────────────────────────────────────────

const TODAY = '2026-10-28';

test('recommend: new user gets three new skills spread across the heaviest domains', () => {
  const r = recommend(emptyState(), TODAY);
  assert.equal(r.suggestions.length, 3);
  assert.ok(r.suggestions.every((x) => x.kind === 'new'));
  const domains = r.suggestions.map((x) => SKILLS.find((s) => s.id === x.skillId)!.domainId);
  assert.deepEqual(domains, ['troubleshooting', 'cluster-architecture', 'services-networking']);
  assert.equal(r.allIndependent, false);
});

test('recommend: priority retry > stale > new > review, unique skills', () => {
  const s = emptyState();
  withSkill(s, 'cluster.rbac', 'independent', [attempt('2026-10-27', 'hints')]); // retry (hints)
  withSkill(s, 'storage.pv-pvc', 'learning', [attempt('2026-10-26', 'unsuccessful')]); // retry (unsuccessful) + would be stale-eligible later
  withSkill(s, 'workloads.autoscaling', 'guided'); // stale, never practiced
  const r = recommend(s, TODAY, { limit: 10 });
  assert.deepEqual(r.suggestions.slice(0, 3).map((x) => [x.skillId, x.kind]), [
    ['storage.pv-pvc', 'retry'],
    ['cluster.rbac', 'retry'],
    ['workloads.autoscaling', 'stale'],
  ]);
  assert.equal(r.suggestions[3].kind, 'new');
  const ids = r.suggestions.map((x) => x.skillId);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.equal(recommend(s, TODAY).suggestions.length, 3, 'default limit is 3');
});

test('recommend: started skills practiced recently are not stale', () => {
  const s = emptyState();
  withSkill(s, 'storage.pv-pvc', 'learning', [attempt(addDays(TODAY, -(RECENT_DAYS - 1)), 'independent')]);
  withSkill(s, 'cluster.rbac', 'learning', [attempt(addDays(TODAY, -RECENT_DAYS), 'independent')]);
  const kinds = recommend(s, TODAY, { limit: 30 }).suggestions.filter((x) => x.kind === 'stale').map((x) => x.skillId);
  assert.deepEqual(kinds, ['cluster.rbac']);
});

test('recommend: completed tracker suggests only due reviews, oldest first', () => {
  const s = emptyState();
  SKILLS.forEach((sk) => withSkill(s, sk.id, 'independent', [attempt(addDays(TODAY, -1), 'independent')]));
  withSkill(s, 'networking.coredns', 'independent', [attempt(addDays(TODAY, -REVIEW_INTERVAL_DAYS), 'independent')]);
  withSkill(s, 'cluster.rbac', 'independent', [attempt(addDays(TODAY, -30), 'independent')]);
  const r = recommend(s, TODAY);
  assert.ok(r.allIndependent);
  assert.deepEqual(r.suggestions.map((x) => [x.skillId, x.kind]), [
    ['cluster.rbac', 'review'],
    ['networking.coredns', 'review'],
  ]);
});

test('recommend: nothing due returns an empty list and the next due date', () => {
  const s = emptyState();
  SKILLS.forEach((sk) => withSkill(s, sk.id, 'independent', [attempt(addDays(TODAY, -2), 'independent')]));
  const r = recommend(s, TODAY);
  assert.equal(r.suggestions.length, 0);
  assert.ok(r.allIndependent);
  assert.equal(r.nextDueDate, addDays(TODAY, REVIEW_INTERVAL_DAYS - 2));
});

test('recommend: suggests the task from a failed attempt, else an unfinished task', () => {
  const s = emptyState();
  withSkill(s, 'troubleshooting.services-networking', 'learning', [
    attempt('2026-10-27', 'unsuccessful', 20, { taskId: 'task.svc-no-endpoints' }),
  ]);
  const r = recommend(s, TODAY);
  assert.equal(r.suggestions[0].taskId, 'task.svc-no-endpoints');
  const rbac = recommend(withSkill(emptyState(), 'cluster.rbac', 'learning'), TODAY).suggestions[0];
  assert.equal(rbac.taskId, 'task.rbac-log-reader');
});

test('recommend: output is deterministic', () => {
  const s = emptyState();
  withSkill(s, 'storage.pv-pvc', 'guided', [attempt('2026-10-01', 'hints')]);
  assert.deepEqual(recommend(s, TODAY), recommend(structuredClone(s), TODAY));
});

// ── Storage and import ──────────────────────────────────────────────────────

function sampleState(): TrackerState {
  const s = emptyState();
  s.settings = { targetDate: '2026-12-15', weeklyGoalMinutes: 300 };
  withSkill(s, 'cluster.rbac', 'guided', [attempt('2026-10-27', 'hints', 25, { notes: '<script>alert(1)</script>', taskId: 'task.rbac-log-reader' })]);
  s.skills['cluster.rbac'].notes = 'Remember pods/log';
  return s;
}

test('import: a valid export round-trips exactly', () => {
  const s = sampleState();
  const r = parseImport(buildExport(s, new Date('2026-10-28T12:00:00Z'), 'v1.37'));
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.state, s);
    assert.equal(r.exportedAt, '2026-10-28T12:00:00.000Z');
    // Text stays plain text; rendering escapes it.
    assert.equal(r.state.skills['cluster.rbac'].attempts[0].notes, '<script>alert(1)</script>');
  }
});

test('import: rejects non-JSON, foreign JSON and newer schema', () => {
  assert.equal(parseImport('not json').ok, false);
  assert.equal(parseImport('{"hello":1}').ok, false);
  assert.equal(parseImport('[]').ok, false);
  const newer = JSON.parse(buildExport(sampleState(), new Date(), 'v1.37'));
  newer.data.schemaVersion = SCHEMA_VERSION + 1;
  const r = parseImport(JSON.stringify(newer));
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.details[0], /newer/);
});

test('import: rejects any invalid field instead of partially applying', () => {
  // Export files are untyped JSON here on purpose: the tests write invalid values into them.
  type Loose = { data: { settings: Record<string, unknown>; skills: Record<string, { status: unknown; notes: unknown; attempts: Record<string, unknown>[] }> } };
  const bad = (mutate: (f: Loose) => void) => {
    const f = JSON.parse(buildExport(sampleState(), new Date(), 'v1.37'));
    mutate(f);
    return parseImport(JSON.stringify(f));
  };
  assert.equal(bad((f) => { f.data.skills['cluster.rbac'].status = 'expert'; }).ok, false);
  assert.equal(bad((f) => { f.data.skills['cluster.rbac'].attempts[0].minutes = -5; }).ok, false);
  assert.equal(bad((f) => { f.data.skills['cluster.rbac'].attempts[0].date = '2026-02-30'; }).ok, false);
  assert.equal(bad((f) => { f.data.skills['cluster.rbac'].attempts.push({ ...f.data.skills['cluster.rbac'].attempts[0] }); }).ok, false, 'duplicate attempt id');
  assert.equal(bad((f) => { f.data.settings.weeklyGoalMinutes = '300'; }).ok, false);
  const proto = buildExport(sampleState(), new Date(), 'v1.37').replace('"skills": {', '"skills": { "__proto__": { "status": "learning" },');
  assert.equal(parseImport(proto).ok, false, '__proto__ key');
  assert.equal(bad((f) => { f.data.skills['cluster.rbac'].notes = 'x'.repeat(6000); }).ok, false);
});

test('import: keeps progress for skill IDs not in the current curriculum', () => {
  const s = sampleState();
  withSkill(s, 'future.new-skill', 'learning');
  const r = parseImport(buildExport(s, new Date(), 'v1.37'));
  assert.ok(r.ok && r.state.skills['future.new-skill'].status === 'learning');
});

test('stored data: missing, malformed and partly invalid', () => {
  assert.deepEqual(parseStored(null).state, emptyState());
  const broken = parseStored('{"schemaVersion":1,');
  assert.ok(broken.unreadable && broken.notice);
  assert.deepEqual(broken.state, emptyState());

  const partly = sampleState();
  (partly.skills['cluster.rbac'].attempts as unknown[]).push({ id: 'zz', date: 'yesterday', outcome: 'hints', minutes: 5, notes: '', createdAt: '2026-10-28T00:00:00Z' });
  const r = parseStored(JSON.stringify(partly));
  assert.equal(r.unreadable, false);
  assert.equal(r.state.skills['cluster.rbac'].attempts.length, 1, 'invalid attempt dropped, valid one kept');
  assert.match(r.notice ?? '', /skipped/);

  const { state, issues } = normalizeState({ schemaVersion: 1, settings: {}, skills: {} });
  assert.deepEqual(issues, []);
  assert.deepEqual(state, emptyState());
});

// ── Simulations ─────────────────────────────────────────────────────────────

test('simulations: map to real tasks and skills, one correct option per decision', () => {
  assert.ok(SIMULATIONS.length >= 3);
  assert.equal(new Set(SIMULATIONS.map((s) => s.id)).size, SIMULATIONS.length);
  for (const sim of SIMULATIONS) {
    const task = TASKS.find((t) => t.id === sim.taskId);
    assert.ok(task, sim.id);
    assert.equal(task!.skillId, sim.skillId, `${sim.id} skill matches its task`);
    assert.ok(sim.decisions.length >= 2, sim.id);
    for (const d of sim.decisions) {
      assert.equal(d.options.filter((o) => o.correct).length, 1, `${sim.id}/${d.id}`);
      assert.equal(new Set(d.options.map((o) => o.id)).size, d.options.length, `${sim.id}/${d.id} option ids`);
    }
    // Every state a decision moves to changes at least one command's output.
    for (const d of sim.decisions.filter((x) => x.stateAfter)) {
      assert.ok(sim.commands.some((c) => c.outputs[d.stateAfter!]), `${sim.id}: state ${d.stateAfter} is visible`);
    }
  }
});

test('simulations: every recorded capture is used', () => {
  const used = new Set<string>();
  for (const sim of SIMULATIONS) {
    for (const c of sim.commands) Object.values(c.outputs).forEach((k) => used.add(k as string));
    for (const d of sim.decisions) for (const o of d.options) for (const s of o.shows ?? []) used.add(s.output);
  }
  const unused = Object.keys(CAPTURES).filter((k) => !used.has(k));
  assert.deepEqual(unused, []);
});

test('simulations: output follows state, typed commands are matched leniently', () => {
  const sim = getSimulation('sim.svc-no-endpoints')!;
  const eps = sim.commands.find((c) => c.id === 'eps')!;
  assert.match(commandOutput(eps, 'start'), /<unset>/);
  assert.match(commandOutput(eps, 'fixed'), /\b80\b/);
  const describe = sim.commands.find((c) => c.id === 'describe')!;
  assert.equal(commandOutput(describe, 'fixed'), commandOutput(describe, 'start'), 'falls back to start');

  assert.equal(matchCommand(sim, '$  k -n cka-lab-svc   get svc web -o wide ')?.id, 'svc');
  assert.equal(matchCommand(sim, 'kubectl get pods -A'), null);
  assert.equal(matchCommand(sim, '   '), null);
});

test('simulations: attempts can reference a simulation and show its title', () => {
  assert.equal(practiceItemTitle('sim.crashloop-logs'), 'Simulation: Pod keeps restarting');
  assert.equal(practiceItemTitle('task.rbac-log-reader'), 'Read-only access for a ServiceAccount');
  assert.equal(practiceItemTitle('sim.removed'), null);
  const s = emptyState();
  withSkill(s, 'storage.pv-pvc', 'learning', [attempt('2026-10-27', 'hints', 6, { taskId: 'sim.pvc-pending' })]);
  assert.ok(parseImport(buildExport(s, new Date(), 'v1.37')).ok);
  assert.deepEqual([suggestOutcome(0).suggested, suggestOutcome(2).suggested], ['independent', 'hints']);
});

test('simulations: displayed option order is stable and does not always lead with the answer', () => {
  const decisions = SIMULATIONS.flatMap((s) => s.decisions);
  const firstCorrect = decisions.filter((d) => orderedOptions(d)[0].correct).length;
  assert.ok(firstCorrect < decisions.length / 2, `correct option first in ${firstCorrect}/${decisions.length}`);
  for (const d of decisions) {
    assert.deepEqual(orderedOptions(d).map((o) => o.id), orderedOptions(d).map((o) => o.id));
    assert.equal(orderedOptions(d).length, d.options.length);
  }
});
