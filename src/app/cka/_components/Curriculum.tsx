'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { DOMAINS, SKILLS } from '@/lib/cka/curriculum.ts';
import type { DomainId } from '@/lib/cka/curriculum.ts';
import { formatDate } from '@/lib/cka/dates.ts';
import { lastPracticed } from '@/lib/cka/progress.ts';
import type { ProgressSummary } from '@/lib/cka/progress.ts';
import { STATUS_OPTIONS, getSkillProgress } from '@/lib/cka/storage.ts';
import type { SkillStatus, TrackerState } from '@/lib/cka/storage.ts';
import { SkillPanel } from './SkillPanel';
import type { TrackerActions } from './useTracker';
import { BTN_SECONDARY, FOCUS_RING, INPUT, LABEL, StatusBar, StatusDot } from './ui';

export function Curriculum({
  state,
  loaded,
  today,
  progress,
  actions,
  postTitles,
  openSkillId,
  setOpenSkillId,
  logRequest,
  onOpenTask,
  onOpenSimulation,
}: {
  state: TrackerState;
  loaded: boolean;
  today: string | null;
  progress: ProgressSummary | null;
  actions: TrackerActions;
  postTitles: Record<string, string>;
  openSkillId: string | null;
  setOpenSkillId: (id: string | null) => void;
  /** Set by "Log attempt" buttons elsewhere on the page; `n` remounts the panel. */
  logRequest: { skillId: string; taskId: string | null; n: number } | null;
  onOpenTask: (taskId: string) => void;
  onOpenSimulation: (simId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState<DomainId | 'all'>('all');
  const [status, setStatus] = useState<SkillStatus | 'all'>('all');
  const filtering = query.trim() !== '' || domain !== 'all' || status !== 'all';

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(
      SKILLS.filter((s) => {
        // A skill opened from elsewhere on the page stays visible under any filter.
        if (s.id === openSkillId) return true;
        if (domain !== 'all' && s.domainId !== domain) return false;
        if (status !== 'all' && getSkillProgress(state, s.id).status !== status) return false;
        if (!q) return true;
        const d = DOMAINS.find((x) => x.id === s.domainId)!;
        return `${s.competency} ${s.focus} ${d.name}`.toLowerCase().includes(q);
      }).map((s) => s.id),
    );
  }, [query, domain, status, state, openSkillId]);

  const clear = () => {
    setQuery('');
    setDomain('all');
    setStatus('all');
  };

  return (
    <section id="curriculum" aria-labelledby="curriculum-heading" className="scroll-mt-24 space-y-6">
      <div className="space-y-2">
        <h2 id="curriculum-heading" className="font-display text-2xl font-bold text-white">Curriculum</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          The official CKA domains and competencies. Set a status for each one yourself; open a skill for docs, practice tasks, notes and your attempt history.
        </p>
      </div>

      <div role="search" className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="space-y-1">
          <label htmlFor="cka-search" className={LABEL}>Search</label>
          <input id="cka-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. etcd, NetworkPolicy, PVC" className={`${INPUT} w-full`} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cka-domain" className={LABEL}>Domain</label>
          <select id="cka-domain" value={domain} onChange={(e) => setDomain(e.target.value as DomainId | 'all')} className={`${INPUT} w-full sm:w-56`}>
            <option value="all">All domains</option>
            {DOMAINS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cka-status" className={LABEL}>Status</label>
          <select id="cka-status" value={status} disabled={!loaded} onChange={(e) => setStatus(e.target.value as SkillStatus | 'all')} className={`${INPUT} w-full sm:w-48`}>
            <option value="all">Any status</option>
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <p aria-live="polite" className="font-mono text-xs text-zinc-500">
        {filtering ? `${visible.size} of ${SKILLS.length} skills match.` : `${SKILLS.length} skills in ${DOMAINS.length} domains.`}
      </p>

      {visible.size === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-sm text-zinc-300">No skills match these filters.</p>
          <button type="button" onClick={clear} className={`${BTN_SECONDARY} mt-3`}>Clear filters</button>
        </div>
      )}

      {DOMAINS.map((d) => {
        const skills = SKILLS.filter((s) => s.domainId === d.id && visible.has(s.id));
        if (skills.length === 0) return null;
        const dp = progress?.domains.find((x) => x.domain.id === d.id);
        return (
          <section key={d.id} aria-labelledby={`domain-${d.id}`} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 id={`domain-${d.id}`} className="font-display text-lg font-bold text-white">
                {d.name} <span className="font-mono text-sm font-normal text-zinc-400">· {d.weight}% of exam</span>
              </h3>
              {dp && (
                <p className="font-mono text-xs text-zinc-400">
                  {dp.started}/{dp.total} started · {dp.independent}/{dp.total} independent
                </p>
              )}
            </div>
            {dp && <StatusBar counts={dp.byStatus} total={dp.total} />}

            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
              {skills.map((s) => {
                const p = getSkillProgress(state, s.id);
                const last = lastPracticed(p);
                const open = openSkillId === s.id;
                const panelId = `panel-${s.id}`;
                return (
                  <li key={s.id} id={`skill-${s.id}`} className="scroll-mt-24">
                    <div className={clsx('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', open && 'bg-zinc-900/60')}>
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        disabled={!loaded}
                        onClick={() => setOpenSkillId(open ? null : s.id)}
                        className={clsx('group flex flex-1 items-start gap-3 rounded text-left disabled:cursor-default', FOCUS_RING)}
                      >
                        <span aria-hidden="true" className={clsx('mt-1 font-mono text-xs text-zinc-500 motion-safe:transition-transform', open && 'rotate-90')}>▸</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] leading-snug text-zinc-100 group-hover:text-white">{s.competency}</span>
                          {loaded && (
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 font-mono text-[11px] text-zinc-500">
                              <span className="inline-flex items-center gap-1.5">
                                <StatusDot status={p.status} />
                                <span className="sr-only">Status: </span>
                                {STATUS_OPTIONS.find((o) => o.id === p.status)!.label}
                              </span>
                              <span>{last ? `last practiced ${formatDate(last)}` : 'not practiced yet'}</span>
                              {p.attempts.length > 0 && <span>{p.attempts.length} attempt{p.attempts.length === 1 ? '' : 's'}</span>}
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="sm:w-56 sm:flex-shrink-0">
                        <label htmlFor={`status-${s.id}`} className="sr-only">Status for {s.competency}</label>
                        <select
                          id={`status-${s.id}`}
                          value={p.status}
                          disabled={!loaded}
                          onChange={(e) => actions.setStatus(s.id, e.target.value as SkillStatus)}
                          className={`${INPUT} w-full py-1.5`}
                        >
                          {STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div id={panelId} hidden={!open}>
                      {open && today && (
                        <SkillPanel
                          key={logRequest?.skillId === s.id ? logRequest.n : 0}
                          skill={s}
                          progress={p}
                          today={today}
                          actions={actions}
                          postTitles={postTitles}
                          onOpenTask={onOpenTask}
                          onOpenSimulation={onOpenSimulation}
                          logTaskId={logRequest?.skillId === s.id ? logRequest.taskId : undefined}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
