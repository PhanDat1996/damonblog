'use client';

// Client Component wrapper for TerminalHero dynamic import.
// next/dynamic with ssr:false is only valid inside Client Components —
// Next.js 15.x enforces this. The Server Component (page.tsx) imports
// this wrapper instead, which is allowed.

import dynamic from 'next/dynamic';

const TerminalHero = dynamic(() => import('./TerminalHero'), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
      style={{ minHeight: '220px' }}
      aria-hidden="true"
    />
  ),
});

export default function TerminalHeroLazy() {
  return <TerminalHero />;
}
