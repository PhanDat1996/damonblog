'use client';

// Client Component wrapper for CodeCopy dynamic import.
// ssr:false requires a Client Component.

import dynamic from 'next/dynamic';

const CodeCopy = dynamic(() => import('./CodeCopy'), {
  ssr: false,
});

export default function CodeCopyLazy() {
  return <CodeCopy />;
}
