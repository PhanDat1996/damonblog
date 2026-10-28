'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeProgress } from '@/lib/cka/progress.ts';
import { recommend } from '@/lib/cka/recommend.ts';
import { Curriculum } from './Curriculum';
import { DataControls } from './DataControls';
import { Overview } from './Overview';
import { PracticeToday } from './PracticeToday';
import { TaskList } from './TaskList';
import { useTracker } from './useTracker';
import { BTN_SECONDARY } from './ui';

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

export function CkaTracker({ postTitles }: { postTitles: Record<string, string> }) {
  const { state, loaded, today, notice, dismissNotice, saveError, actions } = useTracker();
  const [openSkillId, setOpenSkillId] = useState<string | null>(null);
  const [logRequest, setLogRequest] = useState<{ skillId: string; taskId: string | null; n: number } | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const progress = useMemo(() => (loaded && today ? computeProgress(state, today) : null), [state, loaded, today]);
  const recs = useMemo(() => (loaded && today ? recommend(state, today) : null), [state, loaded, today]);

  // Scroll after the target has rendered (e.g. a skill panel that just opened).
  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(scrollTo)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    setScrollTo(null);
  }, [scrollTo]);

  const openSkill = useCallback((skillId: string) => {
    setOpenSkillId(skillId);
    setScrollTo(`skill-${skillId}`);
  }, []);

  const openTask = useCallback((taskId: string) => {
    const el = document.getElementById(taskId);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      el.querySelector('summary')?.focus({ preventScroll: true });
      history.replaceState(null, '', `#${taskId}`);
    }
  }, []);

  const logAttempt = useCallback((skillId: string, taskId: string | null) => {
    setLogRequest((r) => ({ skillId, taskId, n: (r?.n ?? 0) + 1 }));
    openSkill(skillId);
  }, [openSkill]);

  // Open a task linked directly by URL hash (e.g. /cka#task.rbac-log-reader).
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id.startsWith('task.')) openTask(id);
  }, [openTask]);

  return (
    <div className="space-y-16">
      {(notice || saveError) && (
        <div role="status" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">
          {saveError && <p>{saveError}</p>}
          {notice && (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="flex-1">{notice}</p>
              <button type="button" className={BTN_SECONDARY} onClick={dismissNotice}>Dismiss</button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        <PracticeToday loaded={loaded} recs={recs} onOpenSkill={openSkill} onOpenTask={openTask} onLog={logAttempt} />
        <Overview loaded={loaded} today={today} progress={progress} settings={state.settings} onSaveSettings={actions.setSettings} />
      </div>

      <Curriculum
        state={state}
        loaded={loaded}
        today={today}
        progress={progress}
        actions={actions}
        postTitles={postTitles}
        openSkillId={openSkillId}
        setOpenSkillId={setOpenSkillId}
        logRequest={logRequest}
        onOpenTask={openTask}
      />

      <TaskList loaded={loaded} onLogAttempt={logAttempt} />

      <DataControls state={state} loaded={loaded} onReplace={actions.replaceAll} onReset={actions.reset} />
    </div>
  );
}
