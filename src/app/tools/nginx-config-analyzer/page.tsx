"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  analyzeNginxConfig,
  SAMPLE_CONFIGS,
  type Finding,
  type AnalysisCategory,
  type Severity,
  type ScoreStatus,
  type CategoryScore,
} from "./analyzer";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEV_STYLES: Record<Severity, { badge: string; dot: string; label: string }> = {
  critical: { badge: "bg-red-500/15 text-red-400 border border-red-500/30",           dot: "bg-red-500",    label: "Critical" },
  high:     { badge: "bg-orange-500/15 text-orange-400 border border-orange-500/30",   dot: "bg-orange-500", label: "High" },
  medium:   { badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",      dot: "bg-amber-500",  label: "Medium" },
  low:      { badge: "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40",         dot: "bg-zinc-500",   label: "Low" },
  info:     { badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30",         dot: "bg-blue-500",   label: "Info" },
};

const CAT_ICONS: Record<AnalysisCategory, string> = {
  Security:        "🛡",
  Performance:     "⚡",
  "Reverse Proxy": "🔀",
  Reliability:     "📡",
  Maintainability: "🔧",
};

const STATUS_CONFIG: Record<ScoreStatus, { label: string; color: string; ring: string }> = {
  excellent:           { label: "Excellent",          color: "text-emerald-400", ring: "ring-emerald-500/30" },
  good:                { label: "Good",               color: "text-green-400",   ring: "ring-green-500/30" },
  "needs-improvement": { label: "Needs Improvement",  color: "text-amber-400",   ring: "ring-amber-500/30" },
  risky:               { label: "Risky",              color: "text-red-400",     ring: "ring-red-500/30" },
};

const ALL_CATEGORIES: AnalysisCategory[] = [
  "Security", "Performance", "Reverse Proxy", "Reliability", "Maintainability",
];

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function SevBadge({ severity }: { severity: Severity }) {
  const s = SEV_STYLES[severity];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.label.toUpperCase()}
    </span>
  );
}

function ScoreRing({ score, status }: { score: number; status: ScoreStatus }) {
  const cfg = STATUS_CONFIG[status];
  const r = 36;
  const stroke = 5;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const dim = (r + stroke) * 2;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={dim} height={dim} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-zinc-800" />
        <circle
          cx={r + stroke} cy={r + stroke} r={r} fill="none"
          stroke="currentColor" strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${cfg.color} transition-all duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono text-2xl font-bold leading-none ${cfg.color}`}>{score}</span>
      </div>
    </div>
  );
}

function CategoryScoreCard({ catScore }: { catScore: CategoryScore }) {
  const pct = catScore.score;
  const barColor = pct >= 85 ? "bg-emerald-500" : pct >= 65 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 85 ? "text-emerald-400" : pct >= 65 ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{CAT_ICONS[catScore.label]}</span>
          <span className="font-mono text-xs font-semibold text-zinc-300">{catScore.label}</span>
        </div>
        <span className={`font-mono text-sm font-bold ${textColor}`}>{pct}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[10px] text-zinc-600">
        {catScore.findingCount} finding{catScore.findingCount !== 1 ? "s" : ""}
        {catScore.penalty > 0 && ` · −${catScore.penalty} pts`}
      </p>
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
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left p-4 flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0 text-base">{CAT_ICONS[finding.category]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="font-mono text-[10px] text-zinc-500">{finding.category}</span>
            <span className="font-mono text-[10px] text-zinc-700">·</span>
            <span className="font-mono text-[10px] text-zinc-600 capitalize">{finding.confidence} confidence</span>
          </div>
          <p className="font-mono text-sm font-semibold text-zinc-100 leading-snug">{finding.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <SevBadge severity={finding.severity} />
          <span className={`text-zinc-600 transition-transform duration-200 text-[10px] ${open ? "rotate-180" : ""}`}>▼</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Why it matters", text: finding.whyItMatters },
              { label: "Evidence",       text: finding.evidence },
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
              <button
                onClick={copyFix}
                className="font-mono text-[10px] text-zinc-400 hover:text-green-400 transition-colors px-2 py-0.5 rounded border border-zinc-700 hover:border-green-500/40"
              >
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

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function NginxConfigAnalyzerPage() {
  const [config, setConfig] = useState(SAMPLE_CONFIGS["bad-production"].config);
  const [domain, setDomain] = useState("");
  const [activeCategory, setActiveCategory] = useState<AnalysisCategory | "all">("all");
  const [activeSeverity, setActiveSeverity] = useState<Severity | "all">("all");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<"report" | "patch" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const result = useMemo(() => analyzeNginxConfig(config), [config]);

  const filteredFindings = useMemo(() => {
    let f = result.findings;
    if (activeCategory !== "all") f = f.filter((x) => x.category === activeCategory);
    if (activeSeverity !== "all") f = f.filter((x) => x.severity === activeSeverity);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.whyItMatters.toLowerCase().includes(q) ||
          x.recommendation.toLowerCase().includes(q)
      );
    }
    return [...f].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  }, [result.findings, activeCategory, activeSeverity, search]);

  const sevCounts = useMemo(() => {
    const counts: Partial<Record<Severity, number>> = {};
    for (const sev of SEV_ORDER) counts[sev] = result.findings.filter((f) => f.severity === sev).length;
    return counts as Record<Severity, number>;
  }, [result.findings]);

  const copyReport = useCallback(async () => {
    const lines = [
      `NGINX Config Analyzer Report`,
      `Domain: ${domain || "N/A"}`,
      `Score: ${result.overallScore}/100 (${STATUS_CONFIG[result.status].label})`,
      `Findings: ${result.findings.length}`,
      ``,
      `Category Scores:`,
      ...ALL_CATEGORIES.map((c) => `  ${c}: ${result.categoryScores[c].score}/100`),
      ``,
      ...result.findings.map(
        (f, i) =>
          `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Category: ${f.category}\n   Evidence: ${f.evidence}\n   Fix:\n${f.fixSnippet.split("\n").map((l) => `      ${l}`).join("\n")}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied("report");
    setTimeout(() => setCopied(null), 2000);
  }, [result, domain]);

  const copyPatch = useCallback(async () => {
    const patch = result.findings
      .filter((f) => f.severity !== "info")
      .map((f) => `# Fix: ${f.title}\n${f.fixSnippet}`)
      .join("\n\n");
    await navigator.clipboard.writeText(patch || "# No fixes needed");
    setCopied("patch");
    setTimeout(() => setCopied(null), 2000);
  }, [result.findings]);

  const exportJson = useCallback(() => {
    const report = {
      tool: "nginx-config-analyzer",
      version: "2.0",
      analyzed_domain: domain || null,
      generated_at: new Date().toISOString(),
      overall_score: result.overallScore,
      status: result.status,
      category_scores: result.categoryScores,
      context: result.context,
      findings: result.findings,
      incomplete_analysis: result.hasIncompleteAnalysis,
      incomplete_reasons: result.incompleteReasons,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nginx-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, domain]);

  const exportMarkdown = useCallback(() => {
    const md = [
      `# NGINX Config Analysis Report`,
      ``,
      `**Domain:** ${domain || "N/A"}  `,
      `**Score:** ${result.overallScore}/100 — ${STATUS_CONFIG[result.status].label}  `,
      `**Generated:** ${new Date().toLocaleString()}`,
      ``,
      `## Category Scores`,
      ``,
      `| Category | Score | Findings |`,
      `|---|---|---|`,
      ...ALL_CATEGORIES.map(
        (c) => `| ${CAT_ICONS[c]} ${c} | ${result.categoryScores[c].score}/100 | ${result.categoryScores[c].findingCount} |`
      ),
      ``,
      `## Findings (${result.findings.length} total)`,
      ``,
      ...result.findings.map((f, i) =>
        [
          `### ${i + 1}. ${f.title}`,
          ``,
          `**Severity:** ${f.severity} | **Category:** ${f.category} | **Confidence:** ${f.confidence}`,
          ``,
          `**Why it matters:** ${f.whyItMatters}`,
          ``,
          `**Evidence:** ${f.evidence}`,
          ``,
          `**Recommendation:** ${f.recommendation}`,
          ``,
          "```nginx",
          f.fixSnippet,
          "```",
          ``,
          `*Ref: ${f.reference}*`,
          ``,
        ].join("\n")
      ),
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nginx-analysis-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, domain]);

  const statusCfg = STATUS_CONFIG[result.status];

  return (
    <div className="pb-24">

      {/* Breadcrumb */}
      <div className="font-mono text-xs text-zinc-500 mb-8">
        <Link href="/tools" className="hover:text-zinc-300 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-400">nginx-config-analyzer</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Stable</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Browser-only</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/40">v2.0</span>
        </div>
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">
          NGINX Config Analyzer
        </h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste any NGINX configuration and get a scored security, performance, and reliability audit across 30+ rules.
          Context-aware — proxy rules only fire when <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5">proxy_pass</code> is present, HSTS only when HTTPS is detected. Runs entirely in your browser.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {["#nginx", "#security", "#devops", "#infrastructure"].map((t) => (
            <span key={t} className="font-mono text-[11px] text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-2.5 flex items-start gap-3">
        <span className="text-amber-500 text-sm flex-shrink-0">⚠</span>
        <p className="font-mono text-xs text-zinc-500 leading-relaxed">
          Static analysis only — cannot test live connectivity or validate SSL certificates.
          Always verify with{" "}
          <code className="text-green-400">nginx -t</code> and{" "}
          <code className="text-green-400">nginx -T</code> before reloading.
        </p>
      </div>

      {/* Tool grid */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr] items-start">

        {/* ── Input ── */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-5 pt-5 pb-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="font-mono text-sm font-semibold text-zinc-100">Config input</div>
              <div className="flex flex-wrap gap-1 justify-end">
                {Object.entries(SAMPLE_CONFIGS).map(([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => setConfig(SAMPLE_CONFIGS[key].config)}
                    className="font-mono text-[10px] px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800/60 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Optional: domain (e.g. api.example.com)"
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
            />
            <textarea
              ref={textareaRef}
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              spellCheck={false}
              placeholder="Paste nginx.conf, server block, upstream config, or any NGINX configuration section..."
              className="w-full min-h-[420px] font-mono text-xs px-3 py-3 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors resize-y leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setConfig("")} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
                Clear
              </button>
              <button onClick={copyReport} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-semibold">
                {copied === "report" ? "✓ Copied" : "Copy report"}
              </button>
              <button onClick={copyPatch} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
                {copied === "patch" ? "✓ Copied" : "Copy all fixes"}
              </button>
              <button onClick={exportJson} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
                Export JSON
              </button>
              <button onClick={exportMarkdown} className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors">
                Export Markdown
              </button>
            </div>
            <div className="font-mono text-[11px] text-zinc-700 border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-900/40">
              ⚡ All analysis runs in your browser — no config data is transmitted anywhere.
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-3">

          {/* Overall score */}
          <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-5 ring-1 ${statusCfg.ring}`}>
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-4">Overall score</div>
            <div className="flex items-center gap-5">
              <ScoreRing score={result.overallScore} status={result.status} />
              <div className="space-y-1">
                <div className={`font-mono text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</div>
                <div className="font-mono text-xs text-zinc-500">{result.findings.length} finding{result.findings.length !== 1 ? "s" : ""}</div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SEV_ORDER.filter((s) => sevCounts[s] > 0).map((s) => (
                    <span key={s} className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${SEV_STYLES[s].badge}`}>
                      {sevCounts[s]} {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Category scores */}
          <div className="grid gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <CategoryScoreCard key={cat} catScore={result.categoryScores[cat]} />
            ))}
          </div>

          {/* Context */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-4">
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">Detected context</div>
            <div className="space-y-2">
              {[
                ["HTTPS listener",       result.context.hasHttps],
                ["proxy_pass",           result.context.hasProxyPass],
                ["upstream block",       result.context.hasUpstreamBlock],
                ["upstream keepalive",   result.context.hasUpstreamKeepalive],
                ["WebSocket",            result.context.hasWebSocket],
                ["include directives",   result.context.hasIncludeDirectives],
              ].map(([label, val]) => (
                <div key={label as string} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-zinc-500">{label as string}</span>
                  <span className={`font-mono text-[10px] font-semibold ${val ? "text-green-400" : "text-zinc-700"}`}>
                    {val ? "✓" : "—"}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <span className="font-mono text-xs text-zinc-500">server blocks</span>
                <span className="font-mono text-xs text-zinc-400">{result.context.serverBlockCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-zinc-500">location blocks</span>
                <span className="font-mono text-xs text-zinc-400">{result.context.locationBlockCount}</span>
              </div>
            </div>
          </div>

          {/* Incomplete analysis warning */}
          {result.hasIncompleteAnalysis && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1.5">
              <div className="font-mono text-xs font-semibold text-amber-400">⚠ Incomplete analysis</div>
              {result.incompleteReasons.map((r) => (
                <p key={r} className="font-mono text-xs text-amber-500/70">{r}</p>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* ── Findings ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 mt-4">
        <div className="px-5 pt-5 pb-0">
          <div className="font-mono text-sm font-semibold text-zinc-100 mb-4">
            Findings{" "}
            <span className="text-zinc-600 font-normal text-xs">({filteredFindings.length} shown)</span>
          </div>

          <div className="space-y-3 pb-4 border-b border-zinc-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings by title, description, or recommendation..."
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
            />
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...ALL_CATEGORIES] as (AnalysisCategory | "all")[]).map((cat) => {
                const count = cat === "all" ? result.findings.length : result.categoryScores[cat].findingCount;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`font-mono text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      activeCategory === cat
                        ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                        : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {cat === "all" ? `All (${count})` : `${CAT_ICONS[cat]} ${cat} (${count})`}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveSeverity("all")}
                className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${activeSeverity === "all" ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold" : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200"}`}
              >
                All severities
              </button>
              {SEV_ORDER.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setActiveSeverity(sev)}
                  className={`font-mono text-xs px-2 py-1 rounded border transition-colors ${
                    activeSeverity === sev
                      ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                      : `${SEV_STYLES[sev].badge} opacity-70 hover:opacity-100`
                  }`}
                >
                  {sev} ({sevCounts[sev]})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-2">
          {filteredFindings.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 font-mono text-xs text-emerald-400 flex items-center gap-2">
              <span>✓</span> No findings match the current filters
            </div>
          ) : (
            filteredFindings.map((f) => <FindingCard key={f.id} finding={f} />)
          )}
        </div>
      </div>

      {/* ── Landing / SEO content ── */}
      <div className="mt-20 space-y-16">
        <div className="border-t border-zinc-800" />

        <section className="max-w-3xl space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">What this NGINX analyzer checks</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">nginx -t</code>{" "}
            validates syntax. It doesn&apos;t tell you that your upstream keepalive configuration will exhaust ephemeral ports at 400 req/s,
            that <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">server_tokens on</code> is leaking your NGINX version to every scanner,
            or that missing <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">X-Forwarded-For</code> means your backend IP-based rate limiting silently does nothing.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This analyzer checks 30+ rules across five categories. Detection is context-aware — HSTS only flagged if HTTPS listener exists,
            proxy header rules only apply if <code className="font-mono text-xs text-green-400 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">proxy_pass</code> is present,
            upstream keepalive rules only fire when an upstream block exists.
          </p>
        </section>

        <section className="space-y-5">
          {([
            { cat: "Security" as AnalysisCategory, items: ["HSTS on HTTPS blocks", "X-Frame-Options / CSP frame-ancestors", "X-Content-Type-Options: nosniff", "Content-Security-Policy", "server_tokens disclosure", "Legacy TLS 1.0/1.1", "Missing ssl_protocols", "Weak cipher suites", "Rate limiting on /login /api /auth /admin", "autoindex on", "Unprotected dotfiles (.git, .env, .htaccess)"] },
            { cat: "Performance" as AnalysisCategory, items: ["gzip / Brotli compression", "client_max_body_size (413 prevention)", "keepalive_timeout", "worker_processes auto", "worker_connections sizing", "sendfile / tcp_nopush / tcp_nodelay", "proxy_buffering global disable", "proxy_read_timeout", "Upstream keepalive for connection reuse", "HTTP/2 on TLS listeners"] },
            { cat: "Reverse Proxy" as AnalysisCategory, items: ["Host header forwarding", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto", "proxy_http_version 1.1 with upstream keepalive", "WebSocket Upgrade / Connection headers"] },
            { cat: "Reliability" as AnalysisCategory, items: ["error_log directive", "access_log directive", "proxy_next_upstream for failover", "max_fails / fail_timeout on upstream servers", "default_server block", "HTTP → HTTPS redirect"] },
          ] as { cat: AnalysisCategory; items: string[] }[]).map(({ cat, items }) => (
            <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
              <h3 className="font-mono text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{CAT_ICONS[cat]}</span> {cat}
              </h3>
              <ul className="grid sm:grid-cols-2 gap-1.5">
                {items.map((item) => (
                  <li key={item} className="flex gap-2 text-xs text-zinc-400">
                    <span className="text-green-400 font-mono flex-shrink-0">—</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="space-y-5">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Common NGINX misconfigurations</h2>
          <div className="space-y-4 max-w-3xl">
            {[
              { h: "Upstream keepalive not configured.", b: "NGINX opens a new TCP connection for every proxied request. Under load, ephemeral ports exhaust — you see EADDRINUSE errors before the upstream is actually overloaded. Fix: add keepalive 32 to the upstream block, set proxy_http_version 1.1, and proxy_set_header Connection \"\"." },
              { h: "client_max_body_size left at default 1MB.", b: "File upload endpoints return 413 silently the moment a user uploads something larger. The error never reaches your application — NGINX rejects it at the connection level. The team checks app logs, finds nothing, and spends 20 minutes before someone checks NGINX." },
              { h: "X-Forwarded-For not forwarded.", b: "Backend sees 127.0.0.1 for every request. IP-based rate limiting doesn't work. Fraud detection evaluates against localhost. Access logs are useless. Nobody notices until an IP block fails to stop an attack." },
              { h: "Dotfiles accessible (.git, .env).", b: "Without a deny block for dotfiles, .git exposes full source history, .env exposes credentials and API keys. These are indexed by automated scanners within minutes of a server going online." },
              { h: "server_tokens on (default).", b: "NGINX version leaks in every Server response header and error page. Shodan indexes these. An attacker targeting your NGINX version's CVEs doesn't need to scan — they can query a public database. One directive: server_tokens off;" },
            ].map(({ h, b }) => (
              <p key={h} className="text-sm text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">{h}</strong>{" "}{b}
              </p>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">How to validate and apply fixes safely</h2>
          <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-green-400 overflow-x-auto leading-relaxed whitespace-pre max-w-3xl">
            <code>{`# Test syntax before applying any changes
nginx -t

# Review full compiled config (resolves all include directives)
nginx -T

# Apply — graceful reload, no dropped connections
systemctl reload nginx

# Verify security headers are live
curl -sI https://yourdomain.com | grep -E "Strict-Transport|X-Frame|X-Content-Type"

# Verify real IPs appearing after fixing X-Forwarded-For
tail -f /var/log/nginx/access.log | grep -v "127.0.0.1"`}</code>
          </pre>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Related NGINX guides</h2>
          <ul className="space-y-2">
            {[
              { text: "Fix NGINX 502 Bad Gateway errors in production",             href: "/blog/nginx-502-bad-gateway-fix-linux" },
              { text: "NGINX 502 errors that only appear under load",               href: "/blog/nginx-502-under-load" },
              { text: "Configure upstream keepalive to prevent connection drops",   href: "/blog/nginx-upstream-keepalive" },
              { text: "NGINX rate limiting for API and login endpoints",            href: "/blog/nginx-rate-limiting-config" },
              { text: "NGINX production troubleshooting reference",                 href: "/blog/nginx-troubleshooting-guide" },
            ].map(({ text, href }) => (
              <li key={href}>
                <Link href={href} className="font-mono text-sm text-green-400 hover:underline">→ {text}</Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">FAQ</h2>
          <div className="space-y-3">
            {([
              { q: "Is it safe to paste my NGINX config here?", a: "Yes. All analysis runs in JavaScript in your browser. No config data is sent anywhere — no API calls, no logging, no backend. Open DevTools → Network tab while pasting and you will see zero outbound requests." },
              { q: "Why does the tool show fewer findings than I expected?", a: "Detection is context-aware. HSTS is only checked if an HTTPS listener exists. Proxy header rules only apply if proxy_pass is present. Upstream rules only fire if an upstream block exists. This is intentional to prevent false positives." },
              { q: "Can it analyze configs that use include directives?", a: "The analyzer evaluates the pasted text as a single unit. include directives reference files not available here. The tool flags this with an 'Incomplete analysis' warning. For complete analysis, run nginx -T to get the full compiled config with all includes resolved, then paste that output." },
              { q: "How is the score calculated?", a: "Overall score starts at 100 and deducts for each finding: Critical −20, High −12, Medium −7, Low −3, Info −0. The same weighting applies per-category. A perfect 100 means no findings detected in that category." },
              { q: "How do I prioritize fixes?", a: "Critical first (dotfile exposure, autoindex), then High (missing HSTS, weak TLS, upstream keepalive). Most High-severity fixes are single directives. Medium findings like compression and timeout tuning matter under load but do not need to be fixed before security issues." },
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