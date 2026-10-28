'use client';

import { useRef, useState } from 'react';
import { CURRICULUM_META } from '@/lib/cka/curriculum.ts';
import { formatDate, toLocalIsoDate } from '@/lib/cka/dates.ts';
import { buildExport, parseImport } from '@/lib/cka/storage.ts';
import type { TrackerState } from '@/lib/cka/storage.ts';
import { BTN_DANGER, BTN_SECONDARY, ConfirmDialog } from './ui';

type Feedback = { tone: 'ok' | 'error'; text: string; details?: string[] } | null;

function summarize(s: TrackerState): string {
  const entries = Object.values(s.skills);
  const started = entries.filter((p) => p.status !== 'not_started').length;
  const attempts = entries.reduce((n, p) => n + p.attempts.length, 0);
  return `${started} skill${started === 1 ? '' : 's'} with a status, ${attempts} attempt${attempts === 1 ? '' : 's'}`;
}

export function DataControls({
  state,
  loaded,
  onReplace,
  onReset,
}: {
  state: TrackerState;
  loaded: boolean;
  onReplace: (s: TrackerState) => void;
  onReset: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState<{ state: TrackerState; exportedAt: string | null; name: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const exportData = () => {
    try {
      const now = new Date();
      const blob = new Blob([buildExport(state, now, CURRICULUM_META.kubernetesVersion)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cka-tracker-${toLocalIsoDate(now)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({ tone: 'ok', text: `Exported ${summarize(state)}.` });
    } catch {
      setFeedback({ tone: 'error', text: 'Export failed in this browser.' });
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFeedback({ tone: 'error', text: 'The file could not be read.' });
      return;
    }
    const r = parseImport(text);
    if (!r.ok) {
      setFeedback({ tone: 'error', text: `${r.error} Your current progress was not changed.`, details: r.details });
      return;
    }
    setFeedback(null);
    setPending({ state: r.state, exportedAt: r.exportedAt, name: file.name });
  };

  return (
    <>
      <section id="your-data" aria-labelledby="data-heading" className="scroll-mt-24 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 id="data-heading" className="font-display text-lg font-bold text-white">Your data</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Progress is stored only in this browser (localStorage). It is not sent to DamonSec and does not sync across devices or browsers.
          Clearing site data removes it. Export a JSON file to back it up or move it to another browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!loaded} className={BTN_SECONDARY} onClick={exportData}>Export JSON</button>
          <button type="button" disabled={!loaded} className={BTN_SECONDARY} onClick={() => fileRef.current?.click()}>Import JSON…</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} />
          <button type="button" disabled={!loaded} className={BTN_DANGER} onClick={() => setConfirmReset(true)}>Reset progress…</button>
        </div>

        <div aria-live="polite">
          {feedback && (
            <div className={feedback.tone === 'ok' ? 'text-sm text-green-300' : 'text-sm text-red-300'} role={feedback.tone === 'error' ? 'alert' : undefined}>
              <p>{feedback.text}</p>
              {feedback.details && feedback.details.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs text-red-200/80">
                  {feedback.details.map((d) => <li key={d}>{d}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Replace your progress?"
        confirmLabel="Replace progress"
        danger
        onCancel={() => {
          setPending(null);
          setFeedback({ tone: 'ok', text: 'Import cancelled. Nothing was changed.' });
        }}
        onConfirm={() => {
          if (pending) onReplace(pending.state);
          setFeedback({ tone: 'ok', text: `Imported ${pending ? summarize(pending.state) : ''}.` });
          setPending(null);
        }}
      >
        {pending && (
          <>
            <p>
              <span className="text-zinc-400">File:</span> <span className="break-all">{pending.name}</span>
              {pending.exportedAt && <> (exported {formatDate(toLocalIsoDate(new Date(pending.exportedAt)))})</>}
            </p>
            <p><span className="text-zinc-400">Contains:</span> {summarize(pending.state)}</p>
            <p><span className="text-zinc-400">Currently in this browser:</span> {summarize(state)}</p>
            <p>Importing replaces everything currently saved here. Export first if you want to keep it.</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all progress?"
        confirmLabel="Reset progress"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onReset();
          setConfirmReset(false);
          setFeedback({ tone: 'ok', text: 'Progress reset.' });
        }}
      >
        <p>This deletes every status, note, attempt and goal saved in this browser ({summarize(state)}). It cannot be undone.</p>
        <p>Export first if you might want it back.</p>
      </ConfirmDialog>
    </>
  );
}
