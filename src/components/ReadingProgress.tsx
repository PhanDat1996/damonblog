'use client';

// Fix #4: Original version called document.documentElement.scrollHeight
// inside the scroll handler — that's a forced synchronous layout (reflow).
// The browser must pause, compute the full document layout, then return
// the value. At 60fps that's a reflow every ~16ms.
//
// Fix: cache docHeight once on mount (it doesn't change while reading),
// and use only scrollY in the hot scroll path. No DOM reads in handler.
// Also wraps the update in requestAnimationFrame to throttle to display
// refresh rate and batch with any other paint work.

import { useEffect, useRef } from 'react';

export default function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  // Cache document height — only changes on resize, not scroll
  const docHeightRef = useRef(0);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    // Measure once on mount — reading scrollHeight here is fine,
    // it's outside the scroll hot path
    const measureDocHeight = () => {
      docHeightRef.current =
        document.documentElement.scrollHeight - window.innerHeight;
    };
    measureDocHeight();

    const onScroll = () => {
      // Cancel any pending frame — only process the latest scroll position
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const dh = docHeightRef.current;
        if (dh <= 0) return;
        // Only reads scrollY — no layout-triggering property access
        const pct = Math.min((window.scrollY / dh) * 100, 100);
        // Mutate the DOM directly via ref — no React re-render, no reconciler,
        // no setState → zero risk of triggering a new layout pass
        bar.style.transform = `scaleX(${pct / 100})`;
      });
    };

    // Recalculate docHeight on resize (images load, content expands, etc.)
    const onResize = () => {
      measureDocHeight();
      onScroll();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-zinc-900"
      aria-hidden="true"
    >
      <div
        ref={barRef}
        className="h-full bg-green-400 origin-left"
        // transform: scaleX() is GPU-composited — triggers neither layout
        // nor paint, only the compositor layer. This is the fastest possible
        // way to animate a progress bar.
        style={{ transform: 'scaleX(0)', willChange: 'transform' }}
      />
    </div>
  );
}
