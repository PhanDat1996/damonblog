"use client";

import {
  useState, useMemo, useCallback, useEffect, useRef, memo,
  useTransition, useId,
} from "react";
import Link from "next/link";
import { ConfigEditor, scrollEditorToLine } from "@/components/nginx-tools/ConfigEditor";
import { parseConfigs } from "@/app/tools/nginx-config-analyzer/v2/parser";
import { runAnalysis } from "@/app/tools/nginx-config-analyzer/v2/scoring";
import { simulateRequest } from "@/app/tools/nginx-config-analyzer/v2/simulator";
import { SAMPLE_CONFIGS, exportJson, exportMarkdown, exportPatch } from "@/app/tools/nginx-config-analyzer/v2/samples";
import type {
  ConfigFile, Finding, AnalysisCategory, Severity, ScoreStatus,
  SimulatorRequest, SimulatorResult, ParseError,
} from "@/app/tools/nginx-config-analyzer/v2/types";

// ─── Utilities ────────────────────────────────────────────────────────────────

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = Object.assign(document.createElement("textarea"), {
      value: text,
      style: "position:fixed;opacity:0",
    });
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

function downloadText(content: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEV_STYLES: Record<Severity, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-500/15 text-red-300 border border-red-500/30",         dot: "bg-red-500" },
  high:     { badge: "bg-orange-500/15 text-orange-300 border border-orange-500/30", dot: "bg-orange-500" },
  medium:   { badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30",    dot: "bg-amber-500" },
  low:      { badge: "bg-zinc-700/60 text-zinc-300 border border-zinc-600/50",        dot: "bg-zinc-400" },
  info:     { badge: "bg-blue-500/15 text-blue-300 border border-blue-500/30",        dot: "bg-blue-500" },
};

const ALL_CATEGORIES: AnalysisCategory[] = [
  "Security", "Performance", "Reverse Proxy", "Reliability", "Maintainability",
];

const STATUS_CFG: Record<ScoreStatus, { label: string; color: string; ring: string }> = {
  excellent:           { label: "Excellent",         color: "text-emerald-400", ring: "ring-emerald-500/20" },
  good:                { label: "Good",              color: "text-green-400",   ring: "ring-green-500/20" },
  "needs-improvement": { label: "Needs Improvement", color: "text-amber-400",   ring: "ring-amber-500/20" },
  risky:               { label: "Risky",             color: "text-red-400",     ring: "ring-red-500/20" },
};

const BTN = "font-mono text-xs px-3 py-2 rounded-lg border transition-colors";
const BTN_GHOST = `${BTN} border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100`;
const LABEL = "font-mono text-[11px] text-zinc-400 uppercase tracking-widest";

function scoreTone(score: number) {
  if (score >= 85) return { bar: "bg-emerald-500", text: "text-emerald-400" };
  if (score >= 65) return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-red-500", text: "text-red-400" };
}

function SevBadge({ severity }: { severity: Severity }) {
  const s = SEV_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {severity.toUpperCase()}
    </span>
  );
}

function ScoreRing({ score, status }: { score: number; status: ScoreStatus }) {
  const cfg = STATUS_CFG[status];
  const r = 32; const sw = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex flex-shrink-0 items-center justify-center">
      <svg width={(r + sw) * 2} height={(r + sw) * 2} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-zinc-800" />
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke="currentColor" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className={`${cfg.color} transition-all duration-700`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono text-xl font-bold ${cfg.color}`}>{score}</span>
      </div>
    </div>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ finding, onJump }: { finding: Finding; onJump: (filename: string, line: number) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const copyFix = useCallback(async () => {
    await writeClipboard(finding.fixSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [finding.fixSnippet]);

  // Most recommendations just restate the fix snippet; only show the ones that add something.
  const firstFixLine = finding.fixSnippet.split("\n")[0].trim();
  const showRecommendation = !firstFixLine || !finding.recommendation.includes(firstFixLine);

  return (
    <div className={`rounded-lg border transition-colors ${open ? "border-zinc-700 bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/40"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 font-mono text-[11px] text-zinc-400">
        <SevBadge severity={finding.severity} />
        <span>{finding.category}</span>
        {finding.line > 0 && <>
          <span aria-hidden="true" className="text-zinc-600">·</span>
          <button onClick={() => onJump(finding.filename, finding.line)} title="Show in editor"
            className="py-1 underline decoration-zinc-600 underline-offset-2 hover:text-green-400 hover:decoration-green-400/60 transition-colors">
            {finding.filename}:{finding.line}
          </button>
        </>}
        <span className="ml-auto hidden sm:inline">{finding.confidence} confidence</span>
      </div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="w-full text-left px-4 pt-1 pb-3 flex items-start gap-3">
        <span className="flex-1 font-mono text-sm font-semibold text-zinc-100 leading-snug">{finding.title}</span>
        <span aria-hidden="true" className={`mt-1 text-[10px] text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 border-t border-zinc-800 pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className={`${LABEL} mb-1.5`}>Why it matters</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{finding.whyItMatters}</p>
            </div>
            <div>
              <p className={`${LABEL} mb-1.5`}>Evidence</p>
              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line break-words">{finding.evidence}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className={LABEL}>Fix</p>
              <button onClick={copyFix}
                className="font-mono text-[11px] text-zinc-300 hover:text-green-400 transition-colors px-2.5 py-1.5 rounded border border-zinc-700 hover:border-green-500/40">
                {copied ? "✓ copied" : "copy fix"}
              </button>
            </div>
            {showRecommendation && <p className="text-xs text-zinc-300 leading-relaxed mb-2">{finding.recommendation}</p>}
            <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
              <code>{finding.fixSnippet}</code>
            </pre>
          </div>
          <p className="font-mono text-[11px] text-zinc-500">{finding.confidence} confidence · ref: {finding.reference}</p>
        </div>
      )}
    </div>
  );
}

const defaultFile: ConfigFile = {
  id: "main", filename: "nginx.conf",
  content: SAMPLE_CONFIGS["bad-production"].files[0].content,
};

export default function NginxConfigAnalyzerPage() {
  const [files, setFiles]         = useState<ConfigFile[]>([defaultFile]);
  const [activeFileId, setActive] = useState("main");
  const [isAnalyzing, startAnalysis] = useTransition();
  const [domain, setDomain]       = useState("");
  const [activeCategory, setActiveCat]  = useState<AnalysisCategory | "all">("all");
  const [activeSeverity, setActiveSev]  = useState<Severity | "all">("all");
  const [search, setSearch]       = useState("");
  const [copied, setCopied]       = useState<string | null>(null);
  const [showSim, setShowSim]     = useState(false);
  const [simReq, setSimReq]       = useState<SimulatorRequest>({ scheme: "http", host: "example.com", path: "/", method: "GET" });
  const [simResult, setSimResult] = useState<SimulatorResult | null>(null);
  const [jump, setJump]           = useState<{ fileId: string; line: number; nonce: number } | null>(null);
  const editorRef    = useRef<HTMLTextAreaElement>(null);
  const editorBoxRef = useRef<HTMLDivElement>(null);
  const exportRef    = useRef<HTMLDetailsElement>(null);

  // <details> menus don't close on outside clicks by themselves
  useEffect(() => {
    const close = (e: PointerEvent) => {
      const menu = exportRef.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const ast    = useMemo(() => parseConfigs(files), [files]);
  const result = useMemo(() => runAnalysis(ast), [ast]);

  const filtered = useMemo(() => {
    let f = result.findings;
    if (activeCategory !== "all") f = f.filter((x: Finding) => x.category === activeCategory);
    if (activeSeverity !== "all") f = f.filter((x: Finding) => x.severity === activeSeverity);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter((x: Finding) => x.title.toLowerCase().includes(q) || x.evidence.toLowerCase().includes(q) || x.recommendation.toLowerCase().includes(q));
    }
    return [...f].sort((a: Finding, b: Finding) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  }, [result.findings, activeCategory, activeSeverity, search]);

  const sevCounts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    result.findings.forEach((f: Finding) => { c[f.severity]++; });
    return c;
  }, [result.findings]);

  const addFile = useCallback(() => {
    const id = `file-${Date.now()}`;
    setFiles((f: ConfigFile[]) => [...f, { id, filename: "untitled.conf", content: "" }]);
    setActive(id);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((f: ConfigFile[]) => {
      const next = f.filter((x: ConfigFile) => x.id !== id);
      if (activeFileId === id && next.length > 0) setActive(next[0].id);
      return next.length > 0 ? next : f;
    });
  }, [activeFileId]);

  const updateFile = useCallback((id: string, field: "filename" | "content", value: string) => {
    if (field === "content") setJump(null);
    startAnalysis(() => {
      setFiles((f: ConfigFile[]) => f.map((x: ConfigFile) => x.id === id ? { ...x, [field]: value } : x));
    });
  }, []);

  const loadSample = useCallback((key: string) => {
    const s = SAMPLE_CONFIGS[key];
    if (!s) return;
    setFiles(s.files as ConfigFile[]);
    setActive(s.files[0].id);
    setJump(null);
  }, []);

  const jumpTo = useCallback((filename: string, line: number) => {
    const target = files.find((f) => f.filename === filename) ?? files[0];
    setActive(target.id);
    setJump({ fileId: target.id, line, nonce: Date.now() });
  }, [files]);

  // Scroll the editor to the jumped-to line once the right file is shown
  useEffect(() => {
    if (!jump || jump.fileId !== activeFileId || !editorRef.current) return;
    scrollEditorToLine(editorRef.current, jump.line);
    editorBoxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [jump, activeFileId]);

  const copyText = useCallback(async (text: string, key: string) => {
    await writeClipboard(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const download = useCallback((type: "json" | "md") => {
    downloadText(type === "json" ? exportJson(result, domain) : exportMarkdown(result, domain), `nginx-analysis-${Date.now()}.${type}`);
  }, [result, domain]);

  const runSim = useCallback(() => setSimResult(simulateRequest(ast, simReq)), [ast, simReq]);

  const syntaxErrors = result.parseErrors.filter((e: ParseError) => e.kind === "syntax");
  const statusCfg = STATUS_CFG[result.status];
  const active = files.find((f) => f.id === activeFileId);
  const highlightLine = jump && jump.fileId === activeFileId ? jump.line : null;

  return (
    <div className="pb-24">
      <div className="font-mono text-xs text-zinc-400 mb-6">
        <Link href="/tools" className="hover:text-zinc-200 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-300">nginx-config-analyzer</span>
      </div>

      <div className="mb-6">
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">NGINX Config Analyzer</h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste one or more NGINX config files and get a scored security, performance, and reliability audit across 40+ context-aware rules.
          Supports multi-file configs with include resolution and a request flow simulator.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-400">
          v2.0 · runs in your browser, nothing is uploaded · static analysis only, confirm with <code className="text-green-400">nginx -t</code>
          {isAnalyzing && <span className="ml-2 text-zinc-500 animate-pulse" aria-live="polite">analyzing…</span>}
        </p>
      </div>

      <div className="xl:-mx-24">
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* Editor */}
          <div ref={editorBoxRef} className="lg:sticky lg:top-20 scroll-mt-20 rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 pt-3 border-b border-zinc-800">
              <div className="flex items-end gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {files.map((f: ConfigFile) => (
                  <div key={f.id}
                    className={`flex items-center rounded-t-lg border border-b-0 font-mono text-xs transition-colors ${
                      f.id === activeFileId ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"
                    }`}>
                    <button onClick={() => setActive(f.id)} className="px-3 py-2 max-w-[140px] truncate">{f.filename || "untitled"}</button>
                    {files.length > 1 && (
                      <button onClick={() => removeFile(f.id)} aria-label={`Close ${f.filename || "untitled"}`}
                        className="pr-2.5 pl-0.5 py-2 text-zinc-500 hover:text-red-400 transition-colors">×</button>
                    )}
                  </div>
                ))}
                <button onClick={addFile} aria-label="Add file" title="Add file"
                  className="px-3 py-2 rounded text-zinc-400 hover:text-zinc-100 font-mono text-sm transition-colors">+</button>
              </div>
              <select aria-label="Load sample config" value="" onChange={(e) => loadSample(e.target.value)}
                className="mb-2 flex-shrink-0 font-mono text-xs px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 outline-none focus:border-zinc-500">
                <option value="" disabled>Load sample…</option>
                {(Object.entries(SAMPLE_CONFIGS) as [string, { label: string; files: ConfigFile[] }][]).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            {active && (
              <div className="p-3 space-y-2">
                <input type="text" value={active.filename} onChange={(e) => updateFile(active.id, "filename", e.target.value)}
                  aria-label="File name" placeholder="filename (e.g. nginx.conf, conf.d/api.conf)"
                  className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 transition-colors" />
                <ConfigEditor value={active.content} onChange={(v) => updateFile(active.id, "content", v)}
                  highlightLine={highlightLine} inputRef={editorRef} />
              </div>
            )}
          </div>

          {/* Results */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 ring-1 ${statusCfg.ring}`}>
              <div className="flex flex-wrap items-center gap-4">
                <ScoreRing score={result.overallScore} status={result.status} />
                <div className="flex-1 min-w-[10rem] space-y-1">
                  <div className={`font-mono text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</div>
                  <div className="font-mono text-xs text-zinc-400">{result.findings.length} findings · {files.length} file{files.length > 1 ? "s" : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => copyText(exportMarkdown(result, domain), "md")}
                    className={`${BTN} border-zinc-300 bg-zinc-100 text-zinc-900 hover:bg-white font-semibold`}>
                    {copied === "md" ? "✓ Copied" : "Copy report"}
                  </button>
                  <details ref={exportRef} className="relative">
                    <summary className={`${BTN_GHOST} list-none cursor-pointer select-none`}>Export ▾</summary>
                    <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl space-y-1">
                      <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                        aria-label="Domain for the report" placeholder="Domain for report (optional)"
                        className="w-full font-mono text-xs px-2.5 py-2 mb-1 rounded border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500" />
                      {([
                        { label: copied === "patch" ? "✓ Copied" : "Copy all fixes", run: () => copyText(exportPatch(result), "patch") },
                        { label: "Download Markdown", run: () => download("md") },
                        { label: "Download JSON", run: () => download("json") },
                      ]).map(({ label, run }) => (
                        <button key={label} onClick={() => { run(); if (exportRef.current && !label.startsWith("Copy")) exportRef.current.open = false; }}
                          className="block w-full text-left font-mono text-xs px-2.5 py-2 rounded text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
                          {label}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </div>

              <div className="mt-4 grid gap-0.5" role="group" aria-label="Filter by category">
                {ALL_CATEGORIES.map((cat) => {
                  const s = result.categoryScores[cat];
                  const tone = scoreTone(s.score);
                  const selected = activeCategory === cat;
                  return (
                    <button key={cat} onClick={() => setActiveCat(selected ? "all" : cat)} aria-pressed={selected}
                      className={`grid grid-cols-[7rem_1fr_2rem] sm:grid-cols-[7.5rem_1fr_2rem_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
                        selected ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                      }`}>
                      <span className={`font-mono text-xs ${selected ? "text-zinc-100 font-semibold" : "text-zinc-300"}`}>{cat}</span>
                      <span className="h-1.5 bg-zinc-800 rounded-full overflow-hidden" aria-hidden="true">
                        <span className={`block h-full rounded-full transition-all duration-700 ${tone.bar}`} style={{ width: `${s.score}%` }} />
                      </span>
                      <span className={`font-mono text-xs font-bold text-right ${tone.text}`}>{s.score}</span>
                      <span className="hidden sm:inline font-mono text-[11px] text-zinc-400 text-right">{s.findingCount} finding{s.findingCount !== 1 ? "s" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {syntaxErrors.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 space-y-1">
                <div className="font-mono text-xs font-semibold text-red-300">✖ Syntax errors: nginx -t would reject this config</div>
                {syntaxErrors.map((e: ParseError, i: number) => (
                  <button key={i} onClick={() => jumpTo(e.file, e.line)}
                    className="block text-left font-mono text-xs text-red-300/90 hover:text-red-200 underline decoration-red-500/30 underline-offset-2 py-0.5">
                    {e.file}:{e.line} — {e.message}
                  </button>
                ))}
                <p className="font-mono text-[11px] text-zinc-400">Findings below may be incomplete until these are fixed.</p>
              </div>
            )}

            {result.hasIncompleteAnalysis && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 space-y-1.5">
                <div className="font-mono text-xs font-semibold text-amber-300">Incomplete analysis</div>
                {result.incompleteReasons.map((r: string, i: number) => (
                  <p key={i} className="font-mono text-xs text-amber-300/80">{r}</p>
                ))}
              </div>
            )}

            {/* Findings */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="px-4 pt-4 pb-3 space-y-3 border-b border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-sm font-semibold text-zinc-100">
                    Findings <span className="text-zinc-400 font-normal text-xs">({filtered.length} of {result.findings.length})</span>
                  </h2>
                  {activeCategory !== "all" && (
                    <button onClick={() => setActiveCat("all")}
                      className="font-mono text-[11px] px-2 py-1 rounded border border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
                      {activeCategory} ×
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search findings" placeholder="Search findings..."
                    className="flex-1 min-w-[10rem] font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 transition-colors" />
                  {(["all", ...SEV_ORDER] as (Severity | "all")[]).map((sev) => {
                    const count = sev === "all" ? result.findings.length : sevCounts[sev];
                    if (sev !== "all" && count === 0) return null;
                    const selected = activeSeverity === sev;
                    return (
                      <button key={sev} onClick={() => setActiveSev(sev)} aria-pressed={selected}
                        className={`font-mono text-xs px-2.5 py-2 rounded-lg border transition-colors ${
                          selected ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                            : sev === "all" ? "bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:text-zinc-100"
                            : `${SEV_STYLES[sev].badge} hover:brightness-125`
                        }`}>
                        {sev === "all" ? "All" : sev} {count}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-3 space-y-2">
                {filtered.length === 0 ? (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 font-mono text-xs text-emerald-300">
                    {result.findings.length === 0 ? "✓ No findings" : "No findings match the current filters"}
                  </div>
                ) : filtered.map((f) => <FindingCard key={f.id} finding={f} onJump={jumpTo} />)}
              </div>
            </div>
          </div>
        </div>

        {/* Simulator */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 mt-4">
          <button onClick={() => setShowSim((s) => !s)} aria-expanded={showSim}
            className="w-full text-left px-5 py-4 flex items-center justify-between">
            <div>
              <div className="font-mono text-sm font-semibold text-zinc-100">Request Flow Test</div>
              <div className="text-xs text-zinc-400 mt-0.5">Simulate how NGINX routes a request through your config</div>
            </div>
            <span aria-hidden="true" className={`text-zinc-400 transition-transform duration-200 text-xs ${showSim ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showSim && (
            <div className="px-5 pb-5 border-t border-zinc-800 pt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "Scheme", key: "scheme" as const, type: "select", options: ["http","https"] },
                  { label: "Host",   key: "host"   as const, type: "text", placeholder: "example.com" },
                  { label: "Path",   key: "path"   as const, type: "text", placeholder: "/" },
                  { label: "Method", key: "method" as const, type: "select", options: ["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"] },
                ].map(field => (
                  <div key={field.key}>
                    <label htmlFor={`sim-${field.key}`} className={`${LABEL} block mb-1`}>{field.label}</label>
                    {field.type === "select" ? (
                      <select id={`sim-${field.key}`} value={simReq[field.key]} onChange={(e) => setSimReq((r: SimulatorRequest) => ({ ...r, [field.key]: e.target.value }))}
                        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 outline-none focus:border-zinc-500">
                        {field.options!.map((o: string) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input id={`sim-${field.key}`} type="text" value={simReq[field.key]} placeholder={field.placeholder}
                        onChange={(e) => setSimReq((r: SimulatorRequest) => ({ ...r, [field.key]: e.target.value }))}
                        className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 transition-colors" />
                    )}
                  </div>
                ))}
              </div>
              <button onClick={runSim} className={`${BTN} border-zinc-300 bg-zinc-100 text-zinc-900 hover:bg-white font-semibold`}>
                Run test →
              </button>
              <p className="font-mono text-xs text-amber-300/80 border border-amber-500/15 bg-amber-500/5 rounded-lg px-3 py-2">
                Simplified simulation: cannot emulate complex rewrites, variables, map/geo blocks, or Lua/njs.
              </p>
              {simResult && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm font-semibold text-zinc-100">Result</div>
                    <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${
                      simResult.confidence === "definite" ? "border-green-500/30 bg-green-500/10 text-green-300"
                      : simResult.confidence === "probable" ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-zinc-600 bg-zinc-800 text-zinc-300"
                    }`}>{simResult.confidence} confidence</span>
                  </div>
                  <div className="space-y-1">
                    {simResult.matchPath.map((step: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-green-400 font-mono flex-shrink-0">{i+1}.</span>
                        <span className="text-zinc-300 font-mono">{step}</span>
                      </div>
                    ))}
                  </div>
                  {simResult.proxyPass && (
                    <div>
                      <p className={`${LABEL} mb-1`}>Proxy pass</p>
                      <code className="font-mono text-xs text-green-400 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 block break-all">{simResult.proxyPass}</code>
                    </div>
                  )}
                  {simResult.appliedHeaders.length > 0 && (
                    <div>
                      <p className={`${LABEL} mb-1`}>Applied headers</p>
                      <div className="space-y-1">
                        {simResult.appliedHeaders.slice(0,6).map((h: string, i: number) => (
                          <code key={i} className="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 block truncate">{h}</code>
                        ))}
                      </div>
                    </div>
                  )}
                  {simResult.warnings.map((w: string, i: number) => (
                    <p key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-mono text-xs text-amber-300/90">{w}</p>
                  ))}
                  {!simResult.matched && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-300">
                      No matching server block found.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SEO content */}
      <div className="mt-20 space-y-16">
        <div className="border-t border-zinc-800" />

        <section className="max-w-3xl space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">What this analyzer checks</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This analyzer builds an AST from your NGINX configuration, then runs 40+ context-aware rules.
            Rules follow NGINX inheritance for add_header, proxy_set_header and ssl_* directives, and skip servers that only redirect. HSTS only fires when an HTTPS listener exists, proxy header rules only apply when <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 mx-0.5">proxy_pass</code> is present, upstream keepalive rules only apply when upstream blocks are defined.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Supports multi-file configs — add included files as additional tabs and the analyzer links them together.
            The request flow simulator tests server block selection, location matching, and proxy_pass routing without sending any traffic.
          </p>
        </section>

        <section className="space-y-5">
          {([
            { cat: "Security" as AnalysisCategory, items: ["HSTS on HTTPS servers", "X-Frame-Options / CSP frame-ancestors", "X-Content-Type-Options nosniff", "Content-Security-Policy", "server_tokens off", "add_header inheritance dropping security headers", "Security headers without always", "Legacy SSL/TLS 1.0/1.1", "ssl_protocols missing", "Weak ssl_ciphers", "ssl_session_cache", "autoindex on", "Dotfile exposure (.git, .env)", "HTTP to HTTPS redirect", "alias off-by-slash path traversal", "SSRF / open proxy via proxy_pass variables", "CRLF injection via $uri", "Rate limiting on login/auth endpoints"] },
            { cat: "Performance" as AnalysisCategory, items: ["worker_processes auto", "worker_connections sizing", "gzip / Brotli compression", "client_max_body_size", "sendfile / tcp_nopush / tcp_nodelay", "HTTP/2 on TLS", "proxy_read_timeout", "Upstream keepalive"] },
            { cat: "Reverse Proxy" as AnalysisCategory, items: ["Host / X-Forwarded-For / X-Forwarded-Proto forwarding (with inheritance)", "proxy_http_version 1.1 with keepalive", "WebSocket Upgrade/Connection headers", "proxy_pass variable without resolver", "proxy_buffering global disable"] },
            { cat: "Reliability" as AnalysisCategory, items: ["error_log", "access_log with upstream timing", "proxy_next_upstream", "max_fails/fail_timeout on upstream servers", "default_server block", "error_page for 502/503/504"] },
            { cat: "Maintainability" as AnalysisCategory, items: ["Syntax errors (missing ;, unclosed blocks)", "Deprecated listen ... http2", "if inside location", "Unused upstream blocks", "Missing include files", "Partial config (snippet) detection"] },
          ] as { cat: AnalysisCategory; items: string[] }[]).map(({ cat, items }) => (
            <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <h3 className="font-mono text-sm font-semibold text-zinc-100">{cat}</h3>
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {items.map(item => (
                  <li key={item} className="flex gap-2 text-xs text-zinc-400">
                    <span className="text-green-400 font-mono flex-shrink-0">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">How to validate fixes safely</h2>
          <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-green-400 overflow-x-auto leading-relaxed whitespace-pre max-w-3xl">
            <code>{`nginx -t && nginx -T | head -50\nsystemctl reload nginx\ncurl -sI https://yourdomain.com | grep -E "Strict-Transport|X-Frame|X-Content-Type"`}</code>
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Related guides</h2>
          <ul className="space-y-2">
            {[
              { text: "Fix NGINX 502 Bad Gateway errors in production",           href: "/blog/nginx-502-bad-gateway-fix-linux" },
              { text: "NGINX 502 errors under load — diagnosis and fixes",        href: "/blog/nginx-502-under-load" },
              { text: "Configure upstream keepalive to prevent connection drops", href: "/blog/nginx-upstream-keepalive" },
              { text: "NGINX rate limiting for API and login endpoints",          href: "/blog/nginx-rate-limiting-config" },
              { text: "NGINX production troubleshooting reference",               href: "/blog/nginx-troubleshooting-guide" },
              { text: "NGINX Hardening Checker (CIS NGINX Benchmark topics)",    href: "/tools/nginx-cis-hardening-checker" },
            ].map(({ text, href }) => (
              <li key={href}><Link href={href} className="font-mono text-sm text-green-400 hover:underline">→ {text}</Link></li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">FAQ</h2>
          <div className="space-y-3">
            {([
              { q: "Is my NGINX config uploaded anywhere?", a: "No. All parsing and analysis runs in JavaScript in your browser. No data is sent to any server. Open DevTools → Network while pasting and you will see zero outbound requests." },
              { q: "Can this replace nginx -t?", a: "No. nginx -t validates syntax against your actual NGINX binary and loaded modules. This tool provides semantic analysis — finding issues that are syntactically valid but operationally or security-problematic. Use both." },
              { q: "Does it support multiple config files?", a: "Yes. Click + to add file tabs. Name them to match your include paths (e.g. conf.d/api.conf). The analyzer resolves include directives by matching against provided filenames." },
              { q: "Can it detect security issues?", a: "Yes — missing or silently dropped security headers (add_header inheritance), TLS misconfiguration, weak ciphers, autoindex exposure, unprotected dotfiles, alias path traversal, SSRF through proxy_pass variables, CRLF injection via $uri, and missing rate limits on login endpoints." },
              { q: "I pasted only a conf.d file. Why are some checks skipped?", a: "Without an http{} or events{} block the analyzer treats the input as a snippet and skips main/http-level checks such as worker_processes, logging and gzip. Settings from your nginx.conf are not visible, so paste nginx -T output for a complete picture." },
              { q: "Can it analyze reverse proxy configs?", a: "Yes. Proxy header rules only fire when proxy_pass is present. Upstream keepalive rules apply when upstream blocks exist. WebSocket header rules fire only when WebSocket-like routes are detected." },
              { q: "How accurate is the request flow test?", a: "The simulator handles exact, prefix, ^~, regex, and default location matching with correct NGINX priority order. It cannot emulate complex rewrites, variable-based routing, map/geo lookups, or Lua/njs. Confidence level (definite/probable/uncertain) is shown with each result." },
            ] as { q: string; a: string }[]).map(({ q, a }) => (
              <details key={q} className="group rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none font-mono text-sm font-medium text-zinc-200 hover:text-white transition-colors select-none">
                  {q}
                  <span className="text-zinc-600 group-open:rotate-180 transition-transform flex-shrink-0 text-[10px]">▼</span>
                </summary>
                <div className="px-5 pb-5 pt-1">
                  <p className="text-sm text-zinc-400 leading-relaxed">{a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}