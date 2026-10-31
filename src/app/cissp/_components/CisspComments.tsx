'use client';

import { useState } from 'react';
import Giscus from '@giscus/react';
import type { LangMode } from '@/lib/cissp/trainer.ts';

// Comments live in GitHub Discussions (category "Announcements", so only the
// maintainer and the giscus app can open threads; visitors can only reply).
// giscus renders inside a cross-origin iframe on giscus.app, so comment content
// can never touch this page's DOM, cookies or localStorage. Nothing from a
// comment is ever rendered by this site directly.
const GISCUS = {
  repo: 'PhanDat1996/damonblog',
  repoId: 'R_kgDOSGwXbg',
  category: 'Announcements',
  categoryId: 'DIC_kwDOSGwXbs4DKEQ4',
} as const;

const BTN = 'inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:border-zinc-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400';

/** Loads giscus only after a click, so no third-party request happens by default. */
export function CisspComments({ scenarioId, mode }: { scenarioId: string; mode: LangMode }) {
  const [open, setOpen] = useState(false);
  const vi = mode === 'vi';

  if (!open) {
    return (
      <div className="space-y-1.5">
        <button type="button" className={BTN} onClick={() => setOpen(true)}>
          {vi ? 'Xem bình luận' : mode === 'en' ? 'Show comments' : 'Show comments / Xem bình luận'}
        </button>
        <p className="text-[11px] text-zinc-600">
          {vi
            ? 'Bình luận qua GitHub Discussions (giscus). Cần tài khoản GitHub để viết.'
            : 'Comments use GitHub Discussions via giscus. A GitHub account is needed to post.'}
        </p>
      </div>
    );
  }

  return (
    <Giscus
      {...GISCUS}
      mapping="specific"
      term={`cissp/${scenarioId}`}
      strict="1"
      reactionsEnabled="1"
      emitMetadata="0"
      inputPosition="top"
      theme="transparent_dark"
      lang={vi ? 'vi' : 'en'}
      loading="lazy"
    />
  );
}
