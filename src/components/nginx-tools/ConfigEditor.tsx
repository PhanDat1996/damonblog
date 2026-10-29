"use client";

import { memo, useRef } from "react";

export const EDITOR_LINE_H = 20; // px — must match leading-5 on the editor and gutter

/** Scroll a ConfigEditor textarea to a 1-based line and select it (selection only on mouse/trackpad devices) */
export function scrollEditorToLine(ta: HTMLTextAreaElement, line: number): void {
  const lines = ta.value.split("\n");
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  ta.scrollTop = Math.max(0, (line - 1) * EDITOR_LINE_H - ta.clientHeight / 3);
  // Selecting the line needs focus; skip it on touch screens so the keyboard doesn't open
  if (window.matchMedia("(pointer: fine)").matches) {
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
  }
}

/** Monospace textarea with a synced line-number gutter */
export const ConfigEditor = memo(function ConfigEditor({
  value, onChange, highlightLine, inputRef, label = "NGINX configuration",
}: {
  value: string;
  onChange: (value: string) => void;
  highlightLine: number | null;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  label?: string;
}) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = value.split("\n").length;
  return (
    <div className="flex h-[360px] lg:h-[calc(100vh-17rem)] lg:min-h-[420px] rounded-lg border border-zinc-700 bg-zinc-950/60 overflow-hidden focus-within:border-zinc-500 transition-colors">
      <div ref={gutterRef} aria-hidden="true"
        className="flex-shrink-0 overflow-hidden select-none py-3 px-2 min-w-[2.75rem] text-right font-mono text-xs leading-5 text-zinc-500 bg-zinc-900/60 border-r border-zinc-800">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className={i + 1 === highlightLine ? "-mx-2 px-2 bg-amber-500/20 text-amber-200" : undefined}>{i + 1}</div>
        ))}
        {/* room for the textarea's horizontal scrollbar so both scroll to the same end */}
        <div className="h-4" />
      </div>
      <textarea ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
        wrap="off" spellCheck={false} aria-label={label} placeholder="Paste NGINX configuration here..."
        className="flex-1 min-w-0 resize-none bg-transparent px-3 py-3 font-mono text-xs leading-5 text-zinc-200 placeholder:text-zinc-500 outline-none whitespace-pre overflow-auto" />
    </div>
  );
});

