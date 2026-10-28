// Tracker state, schema validation, and localStorage persistence.
//
// Nothing here touches `window` at import time, so it is safe to import from
// server components. Browser access happens only inside the load/save helpers.

import { isIsoDate } from './dates.ts';

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'damonsec.cka-tracker';
export const CORRUPT_BACKUP_KEY = 'damonsec.cka-tracker.unreadable-backup';
export const EXPORT_APP_ID = 'damonsec-cka-tracker';

export const LIMITS = {
  skillNotes: 5000,
  attemptNotes: 2000,
  attemptsPerSkill: 500,
  skills: 200,
  attemptMinutesMax: 600,
  weeklyGoalMax: 7 * 24 * 60,
  importBytes: 1_000_000,
} as const;

export type SkillStatus = 'not_started' | 'learning' | 'guided' | 'independent';
export type AttemptOutcome = 'independent' | 'hints' | 'unsuccessful';

export const STATUS_OPTIONS: { id: SkillStatus; label: string }[] = [
  { id: 'not_started', label: 'Not started' },
  { id: 'learning', label: 'Learning' },
  { id: 'guided', label: 'Can do with guidance' },
  { id: 'independent', label: 'Can do independently' },
];

export const OUTCOME_OPTIONS: { id: AttemptOutcome; label: string }[] = [
  { id: 'independent', label: 'Completed independently' },
  { id: 'hints', label: 'Completed with hints' },
  { id: 'unsuccessful', label: 'Unsuccessful' },
];

const STATUS_IDS = new Set<string>(STATUS_OPTIONS.map((s) => s.id));
const OUTCOME_IDS = new Set<string>(OUTCOME_OPTIONS.map((o) => o.id));

export interface Attempt {
  id: string;
  /** Local calendar day the practice happened. */
  date: string;
  outcome: AttemptOutcome;
  minutes: number;
  notes: string;
  taskId: string | null;
  /** ISO timestamp; orders attempts logged on the same day. */
  createdAt: string;
}

export interface SkillProgress {
  status: SkillStatus;
  notes: string;
  attempts: Attempt[];
}

export interface Settings {
  targetDate: string | null;
  weeklyGoalMinutes: number | null;
}

export interface TrackerState {
  schemaVersion: typeof SCHEMA_VERSION;
  settings: Settings;
  /** Keyed by skill ID. Skills without an entry are 'not_started'. */
  skills: Record<string, SkillProgress>;
}

export function emptyState(): TrackerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { targetDate: null, weeklyGoalMinutes: null },
    skills: {},
  };
}

export function emptySkill(): SkillProgress {
  return { status: 'not_started', notes: '', attempts: [] };
}

export function getSkillProgress(state: TrackerState, skillId: string): SkillProgress {
  return state.skills[skillId] ?? emptySkill();
}

// ── Validation ──────────────────────────────────────────────────────────────

const KEY_PATTERN = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTimestamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
}

/**
 * Validates and copies a state object.
 *
 * Every problem is reported in `issues`. Invalid parts are dropped from the
 * returned state, so stored data can be loaded leniently while imports can
 * be rejected on any issue.
 */
export function normalizeState(input: unknown): { state: TrackerState | null; issues: string[] } {
  const issues: string[] = [];
  if (!isRecord(input)) return { state: null, issues: ['Data is not an object.'] };

  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { state: null, issues: ['Missing schema version.'] };
  }
  if (version > SCHEMA_VERSION) {
    return {
      state: null,
      issues: [`Data uses schema version ${version}, which is newer than this page supports (${SCHEMA_VERSION}). Reload the page to get the latest version.`],
    };
  }
  if (version < 1) {
    return { state: null, issues: [`Unknown schema version ${version}.`] };
  }
  // Future migrations go here: if (version === 1) input = migrateV1toV2(input) ...

  const state = emptyState();

  // Settings
  const settings = isRecord(input.settings) ? input.settings : null;
  if (!settings) {
    issues.push('Settings are missing.');
  } else {
    const t = settings.targetDate;
    if (t === null || t === undefined) state.settings.targetDate = null;
    else if (isIsoDate(t)) state.settings.targetDate = t;
    else issues.push('Target date is not a valid YYYY-MM-DD date.');

    const g = settings.weeklyGoalMinutes;
    if (g === null || g === undefined) state.settings.weeklyGoalMinutes = null;
    else if (typeof g === 'number' && Number.isInteger(g) && g >= 1 && g <= LIMITS.weeklyGoalMax) state.settings.weeklyGoalMinutes = g;
    else issues.push(`Weekly goal must be a whole number of minutes between 1 and ${LIMITS.weeklyGoalMax}.`);
  }

  // Skills
  if (!isRecord(input.skills)) {
    issues.push('Skill progress is missing.');
    return { state, issues };
  }
  const entries = Object.entries(input.skills);
  if (entries.length > LIMITS.skills) {
    issues.push(`Too many skill entries (${entries.length}).`);
    return { state, issues };
  }

  const seenAttemptIds = new Set<string>();
  for (const [skillId, raw] of entries) {
    if (!KEY_PATTERN.test(skillId)) {
      issues.push(`Skipped an entry with an invalid skill ID.`);
      continue;
    }
    if (!isRecord(raw)) {
      issues.push(`Skill ${skillId}: entry is not an object.`);
      continue;
    }
    const skill = emptySkill();

    if (typeof raw.status === 'string' && STATUS_IDS.has(raw.status)) skill.status = raw.status as SkillStatus;
    else issues.push(`Skill ${skillId}: unknown status.`);

    if (raw.notes === undefined) skill.notes = '';
    else if (typeof raw.notes === 'string' && raw.notes.length <= LIMITS.skillNotes) skill.notes = raw.notes;
    else issues.push(`Skill ${skillId}: notes must be text up to ${LIMITS.skillNotes} characters.`);

    const attempts = raw.attempts === undefined ? [] : raw.attempts;
    if (!Array.isArray(attempts)) {
      issues.push(`Skill ${skillId}: attempts must be a list.`);
    } else if (attempts.length > LIMITS.attemptsPerSkill) {
      issues.push(`Skill ${skillId}: more than ${LIMITS.attemptsPerSkill} attempts.`);
    } else {
      attempts.forEach((a, i) => {
        const problem = attemptProblem(a);
        if (problem) {
          issues.push(`Skill ${skillId}, attempt ${i + 1}: ${problem}`);
          return;
        }
        const attempt = a as Attempt;
        if (seenAttemptIds.has(attempt.id)) {
          issues.push(`Skill ${skillId}, attempt ${i + 1}: duplicate ID.`);
          return;
        }
        seenAttemptIds.add(attempt.id);
        skill.attempts.push({
          id: attempt.id,
          date: attempt.date,
          outcome: attempt.outcome,
          minutes: attempt.minutes,
          notes: attempt.notes,
          taskId: attempt.taskId ?? null,
          createdAt: attempt.createdAt,
        });
      });
    }
    state.skills[skillId] = skill;
  }

  return { state, issues };
}

function attemptProblem(a: unknown): string | null {
  if (!isRecord(a)) return 'not an object.';
  if (typeof a.id !== 'string' || !ATTEMPT_ID_PATTERN.test(a.id)) return 'invalid ID.';
  if (!isIsoDate(a.date)) return 'date is not a valid YYYY-MM-DD date.';
  if (typeof a.outcome !== 'string' || !OUTCOME_IDS.has(a.outcome)) return 'unknown outcome.';
  if (typeof a.minutes !== 'number' || !Number.isInteger(a.minutes) || a.minutes < 1 || a.minutes > LIMITS.attemptMinutesMax) {
    return `duration must be a whole number of minutes between 1 and ${LIMITS.attemptMinutesMax}.`;
  }
  if (typeof a.notes !== 'string' || a.notes.length > LIMITS.attemptNotes) return `notes must be text up to ${LIMITS.attemptNotes} characters.`;
  if (a.taskId !== undefined && a.taskId !== null && (typeof a.taskId !== 'string' || !KEY_PATTERN.test(a.taskId))) return 'invalid task ID.';
  if (!isTimestamp(a.createdAt)) return 'invalid creation time.';
  return null;
}

// ── Export / import ─────────────────────────────────────────────────────────

export interface ExportFile {
  app: typeof EXPORT_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  curriculumVersion: string;
  data: TrackerState;
}

export function buildExport(state: TrackerState, now: Date, curriculumVersion: string): string {
  const file: ExportFile = {
    app: EXPORT_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    curriculumVersion,
    data: state,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | { ok: true; state: TrackerState; exportedAt: string | null }
  | { ok: false; error: string; details: string[] };

/** Strict: any problem rejects the whole file and nothing is changed. */
export function parseImport(text: string): ImportResult {
  if (text.length > LIMITS.importBytes) {
    return { ok: false, error: 'File is too large to be a tracker export.', details: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.', details: [] };
  }
  if (!isRecord(parsed) || parsed.app !== EXPORT_APP_ID) {
    return { ok: false, error: 'This is not a CKA Study Tracker export.', details: [] };
  }
  if (!isRecord(parsed.data)) {
    return { ok: false, error: 'Export file has no progress data.', details: [] };
  }
  const { state, issues } = normalizeState(parsed.data);
  if (!state || issues.length > 0) {
    return { ok: false, error: 'Export file failed validation.', details: issues.slice(0, 8) };
  }
  return { ok: true, state, exportedAt: isTimestamp(parsed.exportedAt) ? parsed.exportedAt : null };
}

// ── localStorage ────────────────────────────────────────────────────────────

export type LoadResult = { state: TrackerState; notice: string | null; canSave: boolean };

function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Parses the raw stored string. Lenient: drops invalid parts and reports them. */
export function parseStored(raw: string | null): { state: TrackerState; notice: string | null; unreadable: boolean } {
  if (raw === null) return { state: emptyState(), notice: null, unreadable: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: emptyState(), notice: 'Saved progress could not be read, so the tracker started empty.', unreadable: true };
  }
  const { state, issues } = normalizeState(parsed);
  if (!state) {
    return { state: emptyState(), notice: `Saved progress could not be loaded: ${issues[0]} The tracker started empty.`, unreadable: true };
  }
  const notice = issues.length > 0
    ? `Some saved entries were invalid and were skipped (${issues.length}).`
    : null;
  return { state, notice, unreadable: false };
}

export function loadFromStorage(): LoadResult {
  const storage = getStorage();
  if (!storage) {
    return {
      state: emptyState(),
      notice: 'This browser is blocking local storage, so progress will be lost when you leave the page. Use Export to keep a copy.',
      canSave: false,
    };
  }
  const raw = storage.getItem(STORAGE_KEY);
  const result = parseStored(raw);
  if (result.unreadable && raw !== null) {
    // Keep the unreadable copy instead of overwriting it on the next save.
    try {
      storage.setItem(CORRUPT_BACKUP_KEY, raw);
      result.notice += ` The unreadable data was kept in this browser under "${CORRUPT_BACKUP_KEY}".`;
    } catch {
      /* best effort */
    }
  }
  return { state: result.state, notice: result.notice, canSave: true };
}

export function saveToStorage(state: TrackerState): { ok: true } | { ok: false; error: string } {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return {
      ok: false,
      error: quota
        ? 'Browser storage is full, so the last change was not saved. Export your progress to keep a copy.'
        : 'Progress could not be saved in this browser. Export your progress to keep a copy.',
    };
  }
}

export function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
