// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DOMAINS } from './domains.ts';
import { SCENARIOS } from './scenarios.ts';
import { DEFAULT_TEST_SIZE, displayOptions, drawTest, filterScenarios, gradeTest, letterFor, parseStored, reportLinks, score } from './trainer.ts';

test('domains: eight domains, weights sum to 100', () => {
  assert.equal(DOMAINS.length, 8);
  assert.equal(DOMAINS.reduce((s, d) => s + d.weight, 0), 100);
});

test('scenarios: unique ids, valid domain, every domain covered', () => {
  assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, SCENARIOS.length);
  for (const s of SCENARIOS) assert.ok(DOMAINS.some((d) => d.id === s.domainId), s.id);
  for (const d of DOMAINS) assert.ok(SCENARIOS.some((s) => s.domainId === d.id), `no scenario for ${d.id}`);
});

test('scenarios: four options A–D, answer exists, every text bilingual', () => {
  const bi = (v: { en: string; vi: string }, where: string) => {
    assert.ok(v.en.trim().length > 0, `${where} en`);
    assert.ok(v.vi.trim().length > 0, `${where} vi`);
    assert.notEqual(v.en.trim(), v.vi.trim(), `${where} vi is a copy of en`);
  };
  for (const s of SCENARIOS) {
    assert.deepEqual(s.options.map((o) => o.id), ['A', 'B', 'C', 'D'], s.id);
    assert.ok(s.options.some((o) => o.id === s.answer), s.id);
    for (const key of ['title', 'situation', 'question', 'explanation', 'takeaway'] as const) bi(s[key], `${s.id}.${key}`);
    for (const o of s.options) {
      bi(o.why, `${s.id}.${o.id}.why`);
      // Option text may legitimately be identical (e.g. "SOC 2 Type II"), so only check presence.
      assert.ok(o.text.en && o.text.vi, `${s.id}.${o.id}.text`);
    }
    const right = s.options.find((o) => o.id === s.answer)!;
    assert.match(right.why.en, /^Correct\./, `${s.id}: answer's reason should start with "Correct."`);
    assert.match(right.why.vi, /^Đúng\./, `${s.id}: answer's VI reason should start with "Đúng."`);
    for (const o of s.options.filter((o) => o.id !== s.answer)) {
      assert.doesNotMatch(o.why.en, /^Correct\./, `${s.id}.${o.id} is not the answer`);
    }
  }
});

test('displayOptions: stable permutation and spreads correct answers across slots', () => {
  const slots = [0, 0, 0, 0];
  for (const s of SCENARIOS) {
    const a = displayOptions(s);
    assert.deepEqual(a, displayOptions(s), 'stable');
    assert.deepEqual([...a].map((o) => o.id).sort(), ['A', 'B', 'C', 'D']);
    slots[a.findIndex((o) => o.id === s.answer)] += 1;
  }
  for (const n of slots) assert.ok(n >= 2, `answer slot distribution ${slots}`);
  const s = SCENARIOS[0];
  assert.equal(displayOptions(s)[['A', 'B', 'C', 'D'].indexOf(letterFor(s, s.answer))].id, s.answer);
});

test('parseStored: tolerates junk and recomputes correctness', () => {
  assert.deepEqual(parseStored(null), { lang: 'both', results: {} });
  assert.deepEqual(parseStored('not json'), { lang: 'both', results: {} });
  const s = SCENARIOS[0];
  const wrong = s.options.find((o) => o.id !== s.answer)!.id;
  const state = parseStored(JSON.stringify({
    lang: 'vi',
    results: {
      [s.id]: { picked: s.answer, correct: false, at: '2026-10-31' },
      [SCENARIOS[1].id]: { picked: 'Z', at: '2026-10-31' },
      unknown: { picked: 'A', at: '2026-10-31' },
      [SCENARIOS[2].id]: { picked: wrong === 'A' ? 'B' : 'A', at: '2026-10-31' },
    },
  }));
  assert.equal(state.lang, 'vi');
  assert.equal(state.results[s.id].correct, true, 'stored "correct" flag is not trusted');
  assert.equal(state.results[SCENARIOS[1].id], undefined);
  assert.equal(state.results.unknown, undefined);
  assert.equal(score(state.results, SCENARIOS).answered, 2);
});

test('reportLinks: prefilled issue and email point at the scenario', () => {
  const s = SCENARIOS[0];
  const { github, email } = reportLinks(s);
  assert.ok(github.startsWith('https://github.com/PhanDat1996/damonblog/issues/new?title='));
  assert.ok(email.startsWith('mailto:ptdat653@gmail.com?subject='));
  for (const link of [github, email]) {
    assert.ok(decodeURIComponent(link).includes(`https://www.damonsec.com/cissp#${s.id}`), link);
    assert.ok(!link.includes(' '), 'spaces are encoded');
  }
});

test('hard mode: at least two per domain, valid cross-domain tags, no untranslated text', () => {
  const hard = SCENARIOS.filter((s) => s.level === 'hard');
  for (const d of DOMAINS) assert.ok(hard.filter((s) => s.domainId === d.id).length >= 2, d.id);
  for (const s of hard) {
    for (const d of s.alsoDomains ?? []) {
      assert.ok(DOMAINS.some((x) => x.id === d), `${s.id}: ${d}`);
      assert.notEqual(d, s.domainId, `${s.id}: alsoDomains repeats the primary domain`);
    }
  }
  assert.ok(hard.filter((s) => s.alsoDomains?.length).length >= hard.length / 2, 'at least half are cross-domain');
  assert.ok(!JSON.stringify(SCENARIOS).includes('"TODO"'), 'placeholder text left');
});

test('filterScenarios: domain includes cross-domain scenarios; level splits core and hard', () => {
  const all = filterScenarios(SCENARIOS, 'all', 'all');
  assert.equal(all.length, SCENARIOS.length);
  const parts = (['core', 'hard', 'expert'] as const).map((lv) => filterScenarios(SCENARIOS, 'all', lv).length);
  assert.equal(parts.reduce((a, b) => a + b, 0), SCENARIOS.length, 'levels partition the set');
  const d6 = filterScenarios(SCENARIOS, 'd6', 'hard').map((s) => s.id);
  assert.ok(d6.includes('hard-acquisition-first-step'), 'D1 scenario tagged with D6 shows under D6');
  for (const s of filterScenarios(SCENARIOS, 'd3', 'core')) assert.notEqual(s.level, 'hard');
});

test('expert mode: at least three per domain, mostly cross-domain, LEAST/EXCEPT included, key rarely longest', () => {
  const ex = SCENARIOS.filter((s) => s.level === 'expert');
  for (const d of DOMAINS) assert.ok(ex.filter((s) => s.domainId === d.id).length >= 3, d.id);
  assert.ok(ex.filter((s) => s.alsoDomains?.length).length >= ex.length / 2, 'at least half cross-domain');
  assert.ok(ex.filter((s) => /LEAST|EXCEPT/.test(s.question.en)).length >= 4, 'LEAST/EXCEPT questions');
  for (const s of ex) assert.ok(s.situation.en.length >= 300, `${s.id}: situation should carry noise`);
  const keyLongest = ex.filter((s) => {
    const len = s.options.map((o) => o.text.en.length);
    return s.options.find((o) => o.id === s.answer)!.text.en.length === Math.max(...len);
  });
  assert.ok(keyLongest.length <= ex.length / 4, `answer is the longest option too often: ${keyLongest.map((s) => s.id)}`);
});

test('drawTest: random subset without repeats, capped by the pool', () => {
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ids = drawTest(SCENARIOS, DEFAULT_TEST_SIZE, rand);
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
  for (const id of ids) assert.ok(SCENARIOS.some((s) => s.id === id));
  assert.notDeepEqual(ids, drawTest(SCENARIOS, 10, rand), 'two draws differ');
  const pool = filterScenarios(SCENARIOS, 'd2', 'expert');
  assert.equal(drawTest(pool, 50).length, pool.length);
  assert.deepEqual(drawTest([], 10), []);
});

test('gradeTest: unanswered counts as wrong, per-domain totals add up', () => {
  const [a, b, c] = SCENARIOS;
  const wrong = b.options.find((o) => o.id !== b.answer)!.id;
  const g = gradeTest([a.id, b.id, c.id], { [a.id]: a.answer, [b.id]: wrong });
  assert.equal(g.correct, 1);
  assert.equal(g.total, 3);
  assert.equal(g.percent, 33);
  assert.equal(g.items[2].picked, null);
  assert.equal([...g.byDomain.values()].reduce((n, d) => n + d.total, 0), 3);
});
