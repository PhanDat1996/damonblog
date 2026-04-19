'use client';

import { useEffect, useState } from 'react';

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

export default function TerminalHero() {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < LINES.length) {
        const line = LINES[i];
        if (line !== undefined) {
          setVisibleLines((prev) => [...prev, line]);
        }
        i++;
      } else {
        clearInterval(interval);
      }
    }, 280);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const blink = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 font-mono text-xs text-zinc-500">bash — damon@sec-lab</span>
      </div>
      <div className="p-5 font-mono text-sm min-h-[200px]">
        {visibleLines.map((line, idx) => {
          if (!line) return null;
          const isCmd = line.startsWith('>');
          const isLast = idx === visibleLines.length - 1;
          return (
            <p
              key={idx}
              className={isCmd ? 'text-green-400 mb-1' : 'text-zinc-400 mb-1 pl-2'}
            >
              {line}
              {isLast && cursor && (
                <span className="ml-0.5 inline-block w-2 h-4 bg-green-400 align-middle" />
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}