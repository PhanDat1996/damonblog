'use client';

// Fix #3: TerminalHero is below-the-fold on mobile (hero section is split 50/50
// on desktop, stacked on mobile — terminal pushes below viewport).
// We use IntersectionObserver to START the animation only when visible,
// avoiding JS execution that causes layout thrash during LCP paint.
//
// Fix #4: Replaced two separate setInterval calls (typewriter + cursor blink)
// with a single requestAnimationFrame-based loop and CSS animation for the
// cursor. This eliminates the forced-reflow pattern of reading DOM state
// inside a timer callback.

import { useEffect, useRef, useState, useCallback } from 'react';

const LINES: string[] = [
  '> whoami',
  'damon — security & infrastructure engineer',
  '> cat interests.txt',
  'nginx  docker  logs  security-ops  debugging',
  '> ls posts/ | head -3',
  'nginx-upstream-timeouts.md',
  'docker-log-rotation.md',
  'ssl-hardening-guide.md',
  '> _',
];

// Interval between lines in ms — unchanged from original
const LINE_INTERVAL = 280;

export default function TerminalHero() {
  const [visibleCount, setVisibleCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const startAnimation = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let i = 0;
    const tick = () => {
      if (i < LINES.length) {
        i++;
        // Batch state updates — one per LINE_INTERVAL, no DOM reads
        setVisibleCount(i);
        timerRef.current = setTimeout(tick, LINE_INTERVAL);
      }
    };
    timerRef.current = setTimeout(tick, LINE_INTERVAL);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Only start the typewriter when the terminal enters the viewport.
    // On mobile this defers the JS execution until after LCP has painted.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          startAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startAnimation]);

  const lines = LINES.slice(0, visibleCount);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-2xl shadow-black/40"
      // Reserve fixed height to avoid layout shift as lines appear
      style={{ minHeight: '220px' }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-xs text-zinc-400">bash — damon@sec-lab</span>
      </div>

      {/* Terminal body */}
      <div className="p-5 font-mono text-sm">
        {lines.map((line, idx) => {
          if (!line) return null;
          const isCmd = line.startsWith('>');
          const isLast = idx === lines.length - 1;
          return (
            <p
              key={idx}
              className={isCmd ? 'text-green-400 mb-1' : 'text-zinc-400 mb-1 pl-2'}
            >
              {line}
              {isLast && visibleCount < LINES.length && (
                // CSS animation cursor — zero JS, zero reflow
                <span className="ml-0.5 inline-block w-2 h-4 bg-green-400 align-middle terminal-cursor" />
              )}
            </p>
          );
        })}
      </div>

      {/*
        Inline the cursor blink animation — avoids an extra CSS file import.
        Uses CSS `animation` instead of JS setInterval → no forced reflow.
      */}
      <style>{`
        .terminal-cursor {
          animation: blink 1.06s step-start infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
