import { SCENARIOS } from './scenarios.ts';
import type { OptionId, Scenario, ScenarioOption } from './scenarios.ts';

export const STORAGE_KEY = 'damonsec-cissp-v1';
export const LETTERS = ['A', 'B', 'C', 'D'] as const;

export type LangMode = 'both' | 'en' | 'vi';
export const LANG_MODES: { id: LangMode; label: string }[] = [
  { id: 'both', label: 'EN + VI' },
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
];

export interface Result {
  /** Option the user picked, by scenario option id (not display letter). */
  picked: OptionId;
  correct: boolean;
  at: string;
}

export interface TrainerState {
  lang: LangMode;
  results: Record<string, Result>;
}

export function emptyState(): TrainerState {
  return { lang: 'both', results: {} };
}

/** Accepts whatever is in localStorage and returns a valid state, dropping unknown or malformed entries. */
export function parseStored(raw: string | null): TrainerState {
  const state = emptyState();
  if (!raw) return state;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (!data || typeof data !== 'object') return state;
  const d = data as Record<string, unknown>;
  if (d.lang === 'both' || d.lang === 'en' || d.lang === 'vi') state.lang = d.lang;
  if (d.results && typeof d.results === 'object') {
    for (const [id, r] of Object.entries(d.results as Record<string, unknown>)) {
      const scenario = SCENARIOS.find((s) => s.id === id);
      if (!scenario || !r || typeof r !== 'object') continue;
      const { picked, at } = r as Record<string, unknown>;
      if (!scenario.options.some((o) => o.id === picked) || typeof at !== 'string') continue;
      state.results[id] = { picked: picked as OptionId, correct: picked === scenario.answer, at };
    }
  }
  return state;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Options in display order. The order is fixed per scenario (same on server and client)
 * but mixed across scenarios, so the correct answer is not always in the same slot.
 */
export function displayOptions(scenario: Scenario): ScenarioOption[] {
  let seed = hash(scenario.id);
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const out = [...scenario.options];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Display letter (A–D) for an option id in a scenario. */
export function letterFor(scenario: Scenario, optionId: OptionId): string {
  return LETTERS[displayOptions(scenario).findIndex((o) => o.id === optionId)];
}

export function score(results: Record<string, Result>, scenarios: Scenario[]) {
  const answered = scenarios.filter((s) => results[s.id]);
  return { answered: answered.length, correct: answered.filter((s) => results[s.id].correct).length, total: scenarios.length };
}
