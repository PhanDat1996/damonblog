'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toLocalIsoDate } from '@/lib/cka/dates.ts';
import {
  STORAGE_KEY,
  emptySkill,
  emptyState,
  loadFromStorage,
  newAttemptId,
  parseStored,
  saveToStorage,
} from '@/lib/cka/storage.ts';
import type { Attempt, Settings, SkillStatus, TrackerState } from '@/lib/cka/storage.ts';

export type AttemptInput = Pick<Attempt, 'date' | 'outcome' | 'minutes' | 'notes' | 'taskId'>;

/**
 * Owns tracker state. Reads localStorage only after mount (no SSR access,
 * no hydration mismatch) and writes only after a user change, so the empty
 * initial state can never overwrite saved progress before it has loaded.
 */
export function useTracker() {
  const [state, setState] = useState<TrackerState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = useRef(false);
  const canSave = useRef(true);

  useEffect(() => {
    const r = loadFromStorage();
    canSave.current = r.canSave;
    setState(r.state);
    setNotice(r.notice);
    setToday(toLocalIsoDate(new Date()));
    setLoaded(true);

    // Keep "today" right if the tab stays open past midnight.
    const refreshDay = () => setToday(toLocalIsoDate(new Date()));
    // Pick up changes saved from another tab.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      dirty.current = false;
      setState(parseStored(e.newValue).state);
    };
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !dirty.current || !canSave.current) return;
    dirty.current = false;
    const r = saveToStorage(state);
    setSaveError(r.ok ? null : r.error);
  }, [state, loaded]);

  const update = useCallback((fn: (s: TrackerState) => TrackerState) => {
    dirty.current = true;
    setState(fn);
  }, []);

  const updateSkill = useCallback(
    (skillId: string, fn: (s: ReturnType<typeof emptySkill>) => ReturnType<typeof emptySkill>) =>
      update((s) => ({ ...s, skills: { ...s.skills, [skillId]: fn(s.skills[skillId] ?? emptySkill()) } })),
    [update],
  );

  const actions = {
    setSettings: useCallback((settings: Settings) => update((s) => ({ ...s, settings })), [update]),
    setStatus: useCallback(
      (skillId: string, status: SkillStatus) => updateSkill(skillId, (p) => ({ ...p, status })),
      [updateSkill],
    ),
    setNotes: useCallback(
      (skillId: string, notes: string) => updateSkill(skillId, (p) => ({ ...p, notes })),
      [updateSkill],
    ),
    addAttempt: useCallback(
      (skillId: string, input: AttemptInput) =>
        updateSkill(skillId, (p) => ({
          ...p,
          attempts: [...p.attempts, { ...input, id: newAttemptId(), createdAt: new Date().toISOString() }],
        })),
      [updateSkill],
    ),
    editAttempt: useCallback(
      (skillId: string, attemptId: string, input: AttemptInput) =>
        updateSkill(skillId, (p) => ({
          ...p,
          attempts: p.attempts.map((a) => (a.id === attemptId ? { ...a, ...input } : a)),
        })),
      [updateSkill],
    ),
    deleteAttempt: useCallback(
      (skillId: string, attemptId: string) =>
        updateSkill(skillId, (p) => ({ ...p, attempts: p.attempts.filter((a) => a.id !== attemptId) })),
      [updateSkill],
    ),
    replaceAll: useCallback((next: TrackerState) => update(() => next), [update]),
    reset: useCallback(() => update(() => emptyState()), [update]),
  };

  return { state, loaded, today, notice, dismissNotice: () => setNotice(null), saveError, actions };
}

export type TrackerActions = ReturnType<typeof useTracker>['actions'];
