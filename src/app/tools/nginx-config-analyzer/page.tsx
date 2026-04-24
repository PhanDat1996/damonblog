"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { parseConfigs } from "@/app/tools/nginx-config-analyzer/v2/parser";
import { runAnalysis } from "@/app/tools/nginx-config-analyzer/v2/scoring";
import { simulateRequest } from "@/app/tools/nginx-config-analyzer/v2/simulator";
import { SAMPLE_CONFIGS, exportJson, exportMarkdown, exportPatch } from "@/app/tools/nginx-config-analyzer/v2/samples";
import type {
  ConfigFile, Finding, AnalysisCategory, Severity, ScoreStatus,
  SimulatorRequest, SimulatorResult, ParseError,
} from "@/app/tools/nginx-config-analyzer/v2/types";

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEV_STYLES: Record<Severity, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-500/15 text-red-400 border border-red-500/25",         dot: "bg-red-500" },
  high:     { badge: "bg-orange-500/15 text-orange-400 border border-orange-500/25", dot: "bg-orange-500" },
  medium:   { badge: "bg-amber-500/15 text-amber-400 border border-amber-500/25",    dot: "bg-amber-500" },
  low:      { badge: "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40",        dot: "bg-zinc-500" },
  info:     { badge: "bg-blue-500/15 text-blue-400 border border-blue-500/25",        dot: "bg-blue-500" },
};

const CAT_ICONS: Record<AnalysisCategory, string> = {
  Security: "🛡", Performance: "⚡", "Reverse Proxy": "🔀", Reliability: "📡", Maintainability: "🔧",
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

function SevBadge({ severity }: { severity: Severity }) {
  const s = SEV_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {severity.toUpperCase()}
    </span>
  );
}

function ScoreRing({ score, status }: { score: number; status: ScoreStatus }) {
  const cfg = STATUS_CFG[status];
  const r = 38; const sw = 5;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={(r + sw) * 2} height={(r + sw) * 2} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke="currentColor" strokeWidth={sw} className="text-zinc-800" />
        <circle cx={r+sw} cy={r+sw} r={r} fill="none" stroke="currentColor" strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className={`${cfg.color} transition-all duration-700`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono text-2xl font-bold ${cfg.color}`}>{score}</span>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyFix = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(finding.fixSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [finding.fixSnippet]);

  return (
    <div className={`rounded-xl border transition-all ${open ? "border-zinc-700 bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/40"}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-4 flex items-start gap-3">
        <span className="flex-shrink-0 text-base mt-0.5">{CAT_ICONS[finding.category]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-mono text-[10px] text-zinc-500">{finding.category}</span>
            {finding.filename && <>
              <span className="text-zinc-700 text-[10px]">·</span>
              <span className="font-mono text-[10px] text-zinc-600">{finding.filename}:{finding.line}</span>
            </>}
            <span className="text-zinc-700 text-[10px]">·</span>
            <span className="font-mono text-[10px] text-zinc-600 capitalize">{finding.confidence} confidence</span>
          </div>
          <p className="font-mono text-sm font-semibold text-zinc-100 leading-snug">{finding.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <SevBadge severity={finding.severity} />
          <span className={`text-[10px] text-zinc-600 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Why it matters", text: finding.whyItMatters },
              { label: "Evidence", text: finding.evidence },
              { label: "Recommendation", text: finding.recommendation },
            ].map(({ label, text }) => (
              <div key={label}>
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">{label}</p>
                <p className="text-xs text-zinc-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Fix</p>
              <button onClick={copyFix} className="font-mono text-[10px] text-zinc-400 hover:text-green-400 transition-colors px-2 py-0.5 rounded border border-zinc-700 hover:border-green-500/40">
                {copied ? "✓ copied" : "copy fix"}
              </button>
            </div>
            <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
              <code>{finding.fixSnippet}</code>
            </pre>
          </div>
          <p className="font-mono text-[10px] text-zinc-700">ref: {finding.reference}</p>
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
  const [domain, setDomain]       = useState("");
  const [activeCategory, setActiveCat]  = useState<AnalysisCategory | "all">("all");
  const [activeSeverity, setActiveSev]  = useState<Severity | "all">("all");
  const [search, setSearch]       = useState("");
  const [copied, setCopied]       = useState<string | null>(null);
  const [showSim, setShowSim]     = useState(false);
  const [simReq, setSimReq]       = useState<SimulatorRequest>({ scheme: "http", host: "example.com", path: "/", method: "GET" });
  const [simResult, setSimResult] = useState<SimulatorResult | null>(null);

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
    setFiles((f: ConfigFile[]) => f.map((x: ConfigFile) => x.id === id ? { ...x, [field]: value } : x));
  }, []);

  const loadSample = useCallback((key: string) => {
    const s = SAMPLE_CONFIGS[key];
    if (!s) return;
    setFiles(s.files as ConfigFile[]);
    setActive(s.files[0].id);
  }, []);

  const doExport = useCallback((type: "json" | "md" | "patch") => {
    const content = type === "json" ? exportJson(result, domain)
      : type === "md" ? exportMarkdown(result, domain)
      : exportPatch(result);
    const ext = type === "json" ? "json" : type === "md" ? "md" : "conf";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nginx-analysis-${Date.now()}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  }, [result, domain]);

  const copyText = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const runSim = useCallback(() => setSimResult(simulateRequest(ast, simReq)), [ast, simReq]);

  const statusCfg = STATUS_CFG[result.status];
  const active = files.find(f => f.id === activeFileId);

  return (
    <div className="pb-24">
      <div className="font-mono text-xs text-zinc-500 mb-8">
        <Link href="/tools" className="hover:text-zinc-300 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-400">nginx-config-analyzer</span>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Stable</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Browser-only</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/40">v2.0</span>
        </div>
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">NGINX Config Analyzer</h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste one or more NGINX config files and get a scored security, performance, and reliability audit across 35+ context-aware rules.
          Supports multi-file configs with include resolution and a request flow simulator.
          Your configuration is analyzed locally — never uploaded.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {["#nginx","#security","#devops","#infrastructure"].map(t => (
            <span key={t} className="font-mono text-[11px] text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-2.5 flex items-start gap-2.5">
          <span className="text-green-400 flex-shrink-0">🔒</span>
          <p className="font-mono text-xs text-zinc-500">Your NGINX configuration is analyzed locally in your browser and is never uploaded to any server.</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-2.5 flex items-start gap-2.5">
          <span className="text-amber-500 flex-shrink-0">⚠</span>
          <p className="font-mono text-xs text-zinc-500">Static analysis only. Always verify with <code className="text-green-400">nginx -t</code> and <code className="text-green-400">nginx -T</code> before applying changes.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <span className="font-mono text-xs text-zinc-600">Load sample:</span>
        {(Object.entries(SAMPLE_CONFIGS) as [string, { label: string; files: ConfigFile[] }][]).map(([key, { label }]) => (
          <button key={key} onClick={() => loadSample(key)}
            className="font-mono text-xs px-2.5 py-1 rounded border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr] items-start">
        {/* Editor */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="flex items-center gap-1 px-3 pt-3 pb-0 border-b border-zinc-800 flex-wrap">
            {files.map((f: ConfigFile) => (
              <div key={f.id} onClick={() => setActive(f.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg border border-b-0 font-mono text-xs cursor-pointer transition-colors ${
                  f.id === activeFileId ? "border-zinc-700 bg-zinc-800 text-zinc-200" : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}>
                <span className="max-w-[120px] truncate">{f.filename || "untitled"}</span>
                {files.length > 1 && (
                  <button onClick={e => { e.stopPropagation(); removeFile(f.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all">×</button>
                )}
              </div>
            ))}
            <button onClick={addFile} className="px-2 py-1 rounded text-zinc-600 hover:text-zinc-300 font-mono text-sm transition-colors" title="Add file">+</button>
          </div>
          {active && (
            <div className="p-3 space-y-2">
              <input type="text" value={active.filename} onChange={e => updateFile(active.id, "filename", e.target.value)}
                placeholder="filename (e.g. nginx.conf, conf.d/api.conf)"
                className="w-full font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors" />
              <textarea value={active.content} onChange={e => updateFile(active.id, "content", e.target.value)}
                spellCheck={false} placeholder="Paste NGINX configuration here..."
                className="w-full min-h-[400px] font-mono text-xs px-3 py-3 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors resize-y leading-relaxed" />
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            <input type="text" value={domain} onChange={e => setDomain(e.target.value)}
              placeholder="Optional: domain (e.g. api.example.com)"
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copyText(exportMarkdown(result, domain), "md")}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-semibold">
                {copied === "md" ? "✓ Copied" : "Copy report"}
              </button>
              <button onClick={() => copyText(exportPatch(result), "patch")}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors">
                {copied === "patch" ? "✓" : "Copy fixes"}
              </button>
              <button onClick={() => doExport("json")} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors">JSON</button>
              <button onClick={() => doExport("md")} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors">Markdown</button>
            </div>
          </div>

          <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-5 ring-1 ${statusCfg.ring}`}>
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-4">Overall score</div>
            <div className="flex items-center gap-5">
              <ScoreRing score={result.overallScore} status={result.status} />
              <div className="space-y-1">
                <div className={`font-mono text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</div>
                <div className="font-mono text-xs text-zinc-500">{result.findings.length} findings · {files.length} file{files.length > 1 ? "s" : ""}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => (
                    <span key={s} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${SEV_STYLES[s].badge}`}>
                      {sevCounts[s]} {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {ALL_CATEGORIES.map(cat => {
              const s = result.categoryScores[cat];
              const pct = s.score;
              const barColor = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-500" : "bg-red-500";
              const textColor = pct >= 85 ? "text-emerald-400" : pct >= 65 ? "text-amber-400" : "text-red-400";
              return (
                <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{CAT_ICONS[cat]}</span>
                      <span className="font-mono text-xs font-semibold text-zinc-300">{cat}</span>
                    </div>
                    <span className={`font-mono text-sm font-bold ${textColor}`}>{pct}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="font-mono text-[10px] text-zinc-600">{s.findingCount} findings{s.penalty > 0 ? ` · −${s.penalty} pts` : ""}</p>
                </div>
              );
            })}
          </div>

          {result.hasIncompleteAnalysis && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 space-y-1.5">
              <div className="font-mono text-xs font-semibold text-amber-400">⚠ Incomplete analysis</div>
              {result.incompleteReasons.map((r: string, i: number) => (
                <p key={i} className="font-mono text-xs text-amber-500/70">{r}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Findings */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 mt-4">
        <div className="px-5 pt-5 pb-0">
          <div className="font-mono text-sm font-semibold text-zinc-100 mb-4">
            Findings <span className="text-zinc-600 font-normal text-xs">({filtered.length} shown of {result.findings.length})</span>
          </div>
          <div className="space-y-3 pb-4 border-b border-zinc-800">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search findings..."
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors" />
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...ALL_CATEGORIES] as (AnalysisCategory | "all")[]).map(cat => {
                const count = cat === "all" ? result.findings.length : result.categoryScores[cat].findingCount;
                return (
                  <button key={cat} onClick={() => setActiveCat(cat)}
                    className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      activeCategory === cat ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}>
                    {cat === "all" ? `All (${count})` : `${CAT_ICONS[cat]} ${cat} (${count})`}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setActiveSev("all")}
                className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${activeSeverity === "all" ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold" : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200"}`}>
                All
              </button>
              {SEV_ORDER.map(sev => (
                <button key={sev} onClick={() => setActiveSev(sev)}
                  className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${
                    activeSeverity === sev ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                      : `${SEV_STYLES[sev].badge} opacity-70 hover:opacity-100`
                  }`}>
                  {sev} ({sevCounts[sev]})
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 font-mono text-xs text-emerald-400 flex items-center gap-2">
              ✓ No findings match current filters
            </div>
          ) : filtered.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      </div>

      {/* Simulator */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 mt-4">
        <button onClick={() => setShowSim(s => !s)} className="w-full text-left px-5 py-4 flex items-center justify-between">
          <div>
            <div className="font-mono text-sm font-semibold text-zinc-100">Request Flow Test</div>
            <div className="text-xs text-zinc-500 mt-0.5">Simulate how NGINX routes a request through your config</div>
          </div>
          <span className={`text-zinc-500 transition-transform duration-200 text-xs ${showSim ? "rotate-180" : ""}`}>▼</span>
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
                  <label className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">{field.label}</label>
                  {field.type === "select" ? (
                    <select value={simReq[field.key]} onChange={(e) => setSimReq((r: SimulatorRequest) => ({ ...r, [field.key]: e.target.value }))}
                      className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 outline-none focus:border-zinc-500">
                      {field.options!.map((o: string) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={simReq[field.key]} placeholder={field.placeholder}
                      onChange={(e) => setSimReq((r: SimulatorRequest) => ({ ...r, [field.key]: e.target.value }))}
                      className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors" />
                  )}
                </div>
              ))}
            </div>
            <button onClick={runSim} className="font-mono text-xs px-4 py-2 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-semibold">
              Run test →
            </button>
            <p className="font-mono text-xs text-amber-400/60 border border-amber-500/15 bg-amber-500/5 rounded-lg px-3 py-2">
              Simplified simulation — cannot emulate complex rewrites, variables, map/geo blocks, or Lua/njs.
            </p>
            {simResult && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm font-semibold text-zinc-100">Result</div>
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                    simResult.confidence === "definite" ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : simResult.confidence === "probable" ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-zinc-600 bg-zinc-800 text-zinc-400"
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
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Proxy pass</p>
                    <code className="font-mono text-xs text-green-400 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 block">{simResult.proxyPass}</code>
                  </div>
                )}
                {simResult.appliedHeaders.length > 0 && (
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Applied headers</p>
                    <div className="space-y-1">
                      {simResult.appliedHeaders.slice(0,6).map((h: string, i: number) => (
                        <code key={i} className="font-mono text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded px-2 py-0.5 block truncate">{h}</code>
                      ))}
                    </div>
                  </div>
                )}
                {simResult.warnings.map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <span className="text-amber-400 flex-shrink-0">⚠</span>
                    <p className="font-mono text-xs text-amber-400/80">{w}</p>
                  </div>
                ))}
                {!simResult.matched && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-400">
                    No matching server block found.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SEO content */}
      <div className="mt-20 space-y-16">
        <div className="border-t border-zinc-800" />

        <section className="max-w-3xl space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">What this analyzer checks</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This analyzer builds an AST from your NGINX configuration, then runs 35+ context-aware rules.
            Rules understand scope — HSTS only fires when an HTTPS listener exists, proxy header rules only apply when <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 mx-0.5">proxy_pass</code> is present, upstream keepalive rules only apply when upstream blocks are defined.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Supports multi-file configs — add included files as additional tabs and the analyzer links them together.
            The request flow simulator tests server block selection, location matching, and proxy_pass routing without sending any traffic.
          </p>
        </section>

        <section className="space-y-5">
          {([
            { cat: "Security" as AnalysisCategory, items: ["HSTS on HTTPS servers", "X-Frame-Options / CSP frame-ancestors", "X-Content-Type-Options nosniff", "Content-Security-Policy", "server_tokens off", "Legacy TLS 1.0/1.1", "ssl_protocols missing", "Weak ssl_ciphers", "ssl_session_cache", "autoindex on", "Dotfile exposure (.git, .env)", "HTTP to HTTPS redirect"] },
            { cat: "Performance" as AnalysisCategory, items: ["worker_processes auto", "worker_connections sizing", "gzip / Brotli compression", "client_max_body_size", "sendfile / tcp_nopush / tcp_nodelay", "HTTP/2 on TLS", "proxy_read_timeout", "Upstream keepalive"] },
            { cat: "Reverse Proxy" as AnalysisCategory, items: ["Host header forwarding", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto", "proxy_http_version 1.1 with keepalive", "WebSocket Upgrade/Connection headers", "proxy_pass variable without resolver", "proxy_buffering global disable"] },
            { cat: "Reliability" as AnalysisCategory, items: ["error_log", "access_log with upstream timing", "proxy_next_upstream", "max_fails/fail_timeout on upstream servers", "default_server block", "error_page for 502/503/504"] },
          ] as { cat: AnalysisCategory; items: string[] }[]).map(({ cat, items }) => (
            <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <h3 className="font-mono text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{CAT_ICONS[cat]}</span> {cat}
              </h3>
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
              { q: "Can it detect security issues?", a: "Yes — missing security headers, TLS misconfiguration, weak ciphers, autoindex exposure, unprotected dotfiles, rate limiting gaps, HSTS on HTTPS servers. All rules are context-aware." },
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