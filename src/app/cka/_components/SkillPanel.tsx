'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Skill } from '@/lib/cka/curriculum.ts';
import { formatDate } from '@/lib/cka/dates.ts';
import { sortedAttempts } from '@/lib/cka/progress.ts';
import { LIMITS } from '@/lib/cka/storage.ts';
import type { SkillProgress } from '@/lib/cka/storage.ts';
import { getTask, tasksForSkill } from '@/lib/cka/tasks.ts';
import { AttemptForm } from './AttemptForm';
import type { TrackerActions } from './useTracker';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, FOCUS_RING, INPUT, LABEL, OutcomeTag } from './ui';

export function SkillPanel({
  skill,
  progress,
  today,
  actions,
  postTitles,
  onOpenTask,
  logTaskId,
}: {
  skill: Skill;
  progress: SkillProgress;
  today: string;
  actions: TrackerActions;
  postTitles: Record<string, string>;
  onOpenTask: (taskId: string) => void;
  /** When defined, the log form starts open (with this task preselected if not null). */
  logTaskId?: string | null;
}) {
  const [logging, setLogging] = useState<boolean>(logTaskId !== undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const tasks = tasksForSkill(skill.id);
  const attempts = sortedAttempts(progress);
  const posts = skill.relatedPosts.filter((slug) => postTitles[slug]);

  return (
    <div className="space-y-6 border-t border-zinc-800 bg-zinc-900/30 p-4 sm:p-5">
      <p className="text-sm leading-relaxed text-zinc-300">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">DamonSec summary: </span>
        {skill.focus}
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h4 className={LABEL}>Official documentation</h4>
          <ul className="space-y-1.5">
            {skill.docs.map((d) => (
              <li key={d.href}>
                <a href={d.href} target="_blank" rel="noopener noreferrer" className={`text-sm text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400 ${FOCUS_RING}`}>
                  {d.label}<span className="sr-only"> (opens in a new tab)</span> <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
          {posts.length > 0 && (
            <>
              <h4 className={`${LABEL} pt-3`}>Related on DamonSec</h4>
              <ul className="space-y-1.5">
                {posts.map((slug) => (
                  <li key={slug}>
                    <Link href={`/blog/${slug}`} className={`text-sm text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400 ${FOCUS_RING}`}>
                      {postTitles[slug]}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-2">
          <h4 className={LABEL}>Practice tasks</h4>
          {tasks.length === 0 ? (
            <p className="text-sm text-zinc-400">No DamonSec task for this competency yet. Use the docs above and log your own practice.</p>
          ) : (
            <ul className="space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenTask(t.id);
                    }}
                    className={`text-sm text-zinc-200 underline decoration-zinc-600 underline-offset-2 hover:text-green-400 ${FOCUS_RING}`}
                  >
                    {t.title}
                  </a>
                  <span className="text-xs text-zinc-500"> · about {t.estimateMinutes} min (estimate)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`notes-${skill.id}`} className={LABEL}>Your notes</label>
        <textarea
          id={`notes-${skill.id}`}
          rows={3}
          maxLength={LIMITS.skillNotes}
          value={progress.notes}
          onChange={(e) => actions.setNotes(skill.id, e.target.value)}
          placeholder="Commands to remember, doc pages, mistakes you made."
          className={`${INPUT} w-full`}
        />
        <p className="text-xs text-zinc-500">Saved automatically in this browser.</p>
      </div>

      <section aria-label={`Practice history for ${skill.competency}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className={LABEL}>Practice history ({attempts.length})</h4>
          {!logging && (
            <button type="button" className={BTN_PRIMARY} onClick={() => { setLogging(true); setEditingId(null); }}>
              Log attempt
            </button>
          )}
        </div>

        <p aria-live="polite" className="sr-only">{status}</p>

        {logging && (
          <AttemptForm
            skillId={skill.id}
            today={today}
            initial={{ taskId: logTaskId ?? null }}
            submitLabel="Save attempt"
            onSubmit={(input) => {
              actions.addAttempt(skill.id, input);
              setLogging(false);
              setStatus('Attempt saved.');
            }}
            onCancel={() => setLogging(false)}
          />
        )}

        {attempts.length === 0 && !logging && (
          <p className="text-sm text-zinc-400">No attempts logged yet.</p>
        )}

        {attempts.length > 0 && (
          <ol className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {attempts.map((a) => (
              <li key={a.id} className="space-y-2 p-3">
                {editingId === a.id ? (
                  <AttemptForm
                    skillId={skill.id}
                    today={today}
                    initial={a}
                    submitLabel="Save changes"
                    onSubmit={(input) => {
                      actions.editAttempt(skill.id, a.id, input);
                      setEditingId(null);
                      setStatus('Attempt updated.');
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-xs text-zinc-300">{formatDate(a.date)}</span>
                      <OutcomeTag outcome={a.outcome} />
                      <span className="font-mono text-xs text-zinc-400">{a.minutes} min</span>
                      {a.taskId && (
                        <span className="text-xs text-zinc-400">· {getTask(a.taskId)?.title ?? 'Removed task'}</span>
                      )}
                    </div>
                    {a.notes && <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">{a.notes}</p>}
                    {confirmDeleteId === a.id ? (
                      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm delete">
                        <span className="text-sm text-zinc-300">Delete this attempt?</span>
                        <button type="button" className={BTN_DANGER} onClick={() => { actions.deleteAttempt(skill.id, a.id); setConfirmDeleteId(null); setStatus('Attempt deleted.'); }}>
                          Delete
                        </button>
                        <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmDeleteId(null)}>Keep</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button type="button" className={BTN_SECONDARY} onClick={() => { setEditingId(a.id); setLogging(false); }}>
                          Edit<span className="sr-only"> attempt from {formatDate(a.date)}</span>
                        </button>
                        <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmDeleteId(a.id)}>
                          Delete<span className="sr-only"> attempt from {formatDate(a.date)}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
