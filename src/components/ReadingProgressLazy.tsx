'use client';

// Client Component wrapper for ReadingProgress dynamic import.
// Same reason as TerminalHeroLazy — ssr:false requires a Client Component.

import dynamic from 'next/dynamic';

const ReadingProgress = dynamic(() => import('./ReadingProgress'), {
  ssr: false,
});

export default function ReadingProgressLazy() {
  return <ReadingProgress />;
}
