"use client";

import { useState, useCallback, useRef, memo } from "react";
import Link from "next/link";
import {
  scanConfig, generateHardenedConfig, generateQuickFix,
  levelLabel, type CISScanResult,
} from "@/lib/nginx-cis/analyzer";
import type { Severity, Confidence, CISResult } from "@/lib/nginx-cis/rules";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_CONFIG = `# Intentionally insecure NGINX config — for demo
worker_processes 1;

events { worker_connections 256; }

http {
    server_tokens on;

    server {
        listen 80;
        server_name example.com;
        autoindex on;

        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
        ssl_ciphers RC4:HIGH:!aNULL:!MD5;

        location / {
            proxy_pass         http://127.0.0.1:3000;
            proxy_http_version 1.0;
            proxy_set_header   Host $host;
        }
    }
}`;

const SEV: Record<Severity, { label: string; badge: string; dot: string; bar: string; left: string }> = {
  high:   { label: "HIGH",   badge: "bg-red-500/15 text-red-400 border border-red-500/30",       dot: "bg-red-500",    bar: "bg-red-500",    left: "border-l-red-500" },
  medium: { label: "MEDIUM", badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",  dot: "bg-amber-500",  bar: "bg-amber-500",  left: "border-l-amber-500" },
  low:    { label: "LOW",    badge: "bg-yellow-400/15 text-yellow-400 border border-yellow-400/30",dot: "bg-yellow-400", bar: "bg-yellow-400", left: "border-l-yellow-500" },
};

const CONF: Record<Confidence, { badge: string }> = {
  high:   { badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  medium: { badge: "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40" },
  low:    { badge: "bg-zinc-800/60 text-zinc-500 border border-zinc-700/40" },
};

const LEVEL = {
  pass:    { color: "text-emerald-400", ring: "ring-emerald-500/20", bar: "bg-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  partial: { color: "text-amber-400",   ring: "ring-amber-500/20",   bar: "bg-amber-500",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  fail:    { color: "text-red-400",     ring: "ring-red-500/20",     bar: "bg-red-500",     bg: "bg-red-500/10",     border: "border-red-500/20" },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const el = Object.assign(document.createElement("textarea"), { value: text, style: "position:fixed;opacity:0" });
    document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el);
  }
}

// ─── Small components ─────────────────────────────────────────────────────────

const SevBadge = memo(function SevBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
});

const ConfidenceBadge = memo(function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${CONF[confidence].badge}`}>
      {confidence} confidence
    </span>
  );
});

function CopyBtn({ text, label = "copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const handle = useCallback(async () => {
    await copyText(text); setDone(true); setTimeout(() => setDone(false), 2000);
  }, [text]);
  return (
    <button onClick={handle}
      className="font-mono text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-green-400 hover:border-green-500/40 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500/50">
      {done ? "✓ copied" : label}
    </button>
  );
}

// ─── Finding Card ─────────────────────────────────────────────────────────────

const FindingCard = memo(function FindingCard({ result }: { result: CISResult }) {
  const [open, setOpen] = useState(false);
  const { rule } = result;
  const s = SEV[rule.severity];

  return (
    <div className={`rounded-xl border border-zinc-800 border-l-2 ${s.left} bg-zinc-900/40 overflow-hidden`}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-white/[0.02] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-500"
        aria-expanded={open}
      >
        <span className="font-mono text-[11px] text-zinc-600 flex-shrink-0 mt-0.5 w-[3.5rem]">{rule.id}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <SevBadge severity={rule.severity} />
            <span className="font-mono text-[10px] text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded bg-zinc-800/50">{rule.category}</span>
            <span className="font-mono text-[10px] text-zinc-700">{rule.attack_type}</span>
          </div>
          <p className="font-mono text-sm font-semibold text-zinc-100 leading-snug">{rule.title}</p>
          {!open && (
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-1">{rule.description}</p>
          )}
        </div>
        <span className={`text-[10px] text-zinc-600 transition-transform duration-200 flex-shrink-0 mt-1 ${open ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-zinc-800/80 divide-y divide-zinc-800/60">

          {/* Description + Why It Matters */}
          <div className="p-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Description</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{rule.description}</p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="font-mono text-[10px] text-amber-400 uppercase tracking-widest mb-1.5">⚠ Why this matters</p>
              <p className="text-xs text-amber-300/80 leading-relaxed">{rule.why_it_matters}</p>
            </div>
          </div>

          {/* Metadata strip */}
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">OWASP</span>
              <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded">{rule.owasp_mapping}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">Attack</span>
              <span className="font-mono text-[10px] text-zinc-400">{rule.attack_type}</span>
            </div>
            <ConfidenceBadge confidence={rule.confidence} />
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="font-mono text-[10px] text-zinc-600">Detection:</span>
              <span className="font-mono text-[10px] text-zinc-500 italic">{rule.detection_logic}</span>
            </div>
          </div>

          {/* Remediation + Fix */}
          <div className="p-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Remediation</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{rule.remediation}</p>
              <p className="font-mono text-[10px] text-zinc-700 mt-2">ref: {rule.reference}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">Config fix</p>
                <CopyBtn text={rule.config_fix} />
              </div>
              <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
                <code>{rule.config_fix}</code>
              </pre>
            </div>
          </div>

        </div>
      )}
    </div>
  );
});

// ─── Passed item ──────────────────────────────────────────────────────────────

function PassedRow({ result }: { result: CISResult }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-zinc-800/50 bg-zinc-900/20">
      <span className="font-mono text-[11px] text-zinc-700 w-14 flex-shrink-0">{result.rule.id}</span>
      <span className="text-emerald-500 font-mono text-xs flex-shrink-0">✓</span>
      <div className="min-w-0">
        <p className="font-mono text-xs font-semibold text-zinc-500 truncate">{result.rule.title}</p>
        <p className="font-mono text-[10px] text-zinc-700">{result.rule.category}</p>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({ name, results }: { name: string; results: CISResult[] }) {
  const [open, setOpen] = useState(true);
  const issues = results.filter((r) => !r.passed);
  const passed = results.filter((r) => r.passed);

  return (
    <div className="space-y-2">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-1 px-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500">
        <span className="font-mono text-xs font-semibold text-zinc-300 flex-1 text-left">{name}</span>
        <div className="flex items-center gap-2">
          {issues.length > 0 && (
            <span className="font-mono text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
              {issues.length} issue{issues.length > 1 ? "s" : ""}
            </span>
          )}
          {passed.length > 0 && (
            <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
              {passed.length} ✓
            </span>
          )}
          <span className={`text-[10px] text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">▼</span>
        </div>
      </button>

      {open && (
        <div className="space-y-2">
          {issues.map((r) => <FindingCard key={r.rule.id} result={r} />)}
          {passed.map((r) => <PassedRow key={r.rule.id} result={r} />)}
        </div>
      )}
    </div>
  );
}

// ─── Score display ────────────────────────────────────────────────────────────

function ScoreDisplay({ result }: { result: CISScanResult }) {
  const lv  = LEVEL[result.level];
  const pct = result.score;

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 ring-1 ${lv.ring}`}>
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">CIS Compliance Score</p>
            <span className={`font-mono text-[11px] font-bold px-2.5 py-1 rounded border ${lv.bg} ${lv.border} ${lv.color}`}>
              {levelLabel(result.level)}
            </span>
          </div>

          <div className="flex items-end gap-3">
            <span className={`font-mono text-6xl font-bold leading-none ${lv.color}`}>{pct}</span>
            <span className="font-mono text-sm text-zinc-500 mb-2">/ 100</span>
          </div>

          <div className="space-y-1.5">
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden"
              role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-all duration-700 ${lv.bar}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="font-mono text-xs text-zinc-600">
              {result.results.length} checks · −10 High · −5 Medium · −2 Low
            </p>
          </div>
        </div>

        {/* Count cards */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:w-36">
          {([
            { key: "high",   label: "High",   c: "text-red-400",     bg: "bg-red-500/10",     b: "border-red-500/20" },
            { key: "medium", label: "Medium",  c: "text-amber-400",   bg: "bg-amber-500/10",   b: "border-amber-500/20" },
            { key: "low",    label: "Low",     c: "text-yellow-400",  bg: "bg-yellow-400/10",  b: "border-yellow-400/20" },
            { key: "passed", label: "Passed",  c: "text-emerald-400", bg: "bg-emerald-500/10", b: "border-emerald-500/20" },
          ] as const).map(({ key, label, c, bg, b }) => (
            <div key={key} className={`rounded-lg border ${b} ${bg} px-3 py-2 flex items-center justify-between`}>
              <span className={`font-mono text-[11px] ${c} opacity-70`}>{label}</span>
              <span className={`font-mono text-xl font-bold ${c}`}>{result.counts[key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NginxCisCheckerPage() {
  const [config,      setConfig]      = useState(SAMPLE_CONFIG);
  const [result,      setResult]      = useState<CISScanResult | null>(null);
  const [view,        setView]        = useState<"category" | "severity">("category");
  const [showHardened, setShowHardened] = useState(false);
  const [showQuickFix, setShowQuickFix] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const analyze = useCallback(() => {
    if (!config.trim()) return;
    const r = scanConfig(config);
    setResult(r);
    setShowHardened(false);
    setShowQuickFix(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, [config]);

  const totalIssues = result
    ? result.counts.high + result.counts.medium + result.counts.low
    : 0;

  const severityGroups = result ? ([
    { sev: "high"   as Severity, label: "High Risk",   items: result.results.filter((r) => !r.passed && r.rule.severity === "high") },
    { sev: "medium" as Severity, label: "Medium Risk",  items: result.results.filter((r) => !r.passed && r.rule.severity === "medium") },
    { sev: "low"    as Severity, label: "Low Risk",     items: result.results.filter((r) => !r.passed && r.rule.severity === "low") },
  ]) : [];

  return (
    <div className="pb-24">

      {/* Breadcrumb */}
      <nav className="font-mono text-xs text-zinc-500 mb-8" aria-label="Breadcrumb">
        <Link href="/tools" className="hover:text-zinc-300 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-400">nginx-cis-hardening-checker</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Free</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Browser-only</span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/40">v3.0</span>
        </div>
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">
          NGINX CIS Hardening Checker
        </h1>
        <p className="mt-2 font-mono text-xs text-zinc-500">
          Based on CIS-style NGINX hardening recommendations
        </p>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste your NGINX configuration and get a structured security audit.
          Each finding includes real-world attack context, OWASP mapping, detection confidence,
          and an exact config fix. Generate a fully hardened baseline config or export a minimal patch.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {["#nginx","#cis","#security","#hardening","#devsecops"].map((t) => (
            <span key={t} className="font-mono text-[11px] text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
      </header>

      {/* Privacy */}
      <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 py-2.5 flex items-start gap-2.5 max-w-2xl">
        <span className="text-green-400 flex-shrink-0" aria-hidden="true">🔒</span>
        <p className="font-mono text-xs text-zinc-500">
          Configuration analyzed locally in your browser. Nothing is uploaded or transmitted.
        </p>
      </div>

      {/* Input area */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="cis-config" className="font-mono text-xs text-zinc-400 font-semibold uppercase tracking-widest">
            NGINX configuration
          </label>
          <button onClick={() => setConfig(SAMPLE_CONFIG)}
            className="font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">
            load insecure sample
          </button>
        </div>
        <textarea
          id="cis-config"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder="Paste your nginx.conf, server block, or any NGINX configuration here…"
          className="w-full font-mono text-xs px-4 py-3 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-700 outline-none focus:border-zinc-500 transition-colors resize-y leading-relaxed"
        />
        <div className="flex flex-wrap gap-3">
          <button onClick={analyze} disabled={!config.trim()}
            className="font-mono text-sm px-5 py-2.5 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-bold disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">
            Run CIS scan →
          </button>
          {config !== SAMPLE_CONFIG && (
            <button onClick={() => setConfig("")}
              className="font-mono text-sm px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Results ── */}
      {result && (
        <div ref={resultsRef} className="mt-12 space-y-8">

          {/* Score card */}
          <ScoreDisplay result={result} />

          {/* Issues */}
          {totalIssues > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-mono text-sm font-semibold text-zinc-100">
                  Issues <span className="text-zinc-600 font-normal">({totalIssues})</span>
                </h2>
                <div className="flex gap-1.5" role="group" aria-label="Group findings by">
                  {(["category", "severity"] as const).map((v) => (
                    <button key={v} onClick={() => setView(v)}
                      className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                        view === v
                          ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                          : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700"
                      }`}>
                      {v === "category" ? "By category" : "By severity"}
                    </button>
                  ))}
                </div>
              </div>

              {view === "category" ? (
                <div className="space-y-6">
                  {Object.entries(result.byCategory)
                    .sort(([, a], [, b]) =>
                      b.filter((r) => !r.passed).length - a.filter((r) => !r.passed).length
                    )
                    .map(([cat, items]) => (
                      <CategorySection key={cat} name={cat} results={items} />
                    ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {severityGroups.filter((g) => g.items.length > 0).map(({ sev, label, items }) => (
                    <div key={sev} className="space-y-2">
                      <h3 className="font-mono text-xs text-zinc-500 uppercase tracking-widest px-1">
                        {label} ({items.length})
                      </h3>
                      {items.map((r) => <FindingCard key={r.rule.id} result={r} />)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {totalIssues === 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 font-mono text-sm text-emerald-400">
              ✓ All {result.results.length} CIS-style checks passed — no issues found.
            </div>
          )}

          {/* Action buttons */}
          <div className="grid gap-4 sm:grid-cols-2">

            {/* Generate hardened config */}
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono text-sm font-semibold text-zinc-100">Generate Hardened Config</h3>
                  <p className="font-mono text-xs text-zinc-500 mt-0.5">Full config with all remediations applied</p>
                </div>
                <button onClick={() => { setShowHardened((s) => !s); setShowQuickFix(false); }}
                  className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 flex-shrink-0">
                  {showHardened ? "Hide" : "Generate →"}
                </button>
              </div>
              {showHardened && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">nginx.conf</p>
                    <CopyBtn text={generateHardenedConfig()} label="copy config" />
                  </div>
                  <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-green-400 overflow-x-auto leading-relaxed whitespace-pre max-h-[500px] overflow-y-auto">
                    <code>{generateHardenedConfig()}</code>
                  </pre>
                  <p className="font-mono text-[10px] text-zinc-700 mt-2">
                    Update example.com and certificate paths. Validate with <code className="text-zinc-600">nginx -t</code>.
                  </p>
                </div>
              )}
            </div>

            {/* Quick fix patch */}
            <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono text-sm font-semibold text-zinc-100">Quick Fix Mode</h3>
                  <p className="font-mono text-xs text-zinc-500 mt-0.5">Minimal patch for detected issues only</p>
                </div>
                <button onClick={() => { setShowQuickFix((s) => !s); setShowHardened(false); }}
                  className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 flex-shrink-0">
                  {showQuickFix ? "Hide" : "Export patch →"}
                </button>
              </div>
              {showQuickFix && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                      {totalIssues} fix{totalIssues !== 1 ? "es" : ""}
                    </p>
                    <CopyBtn text={generateQuickFix(result.results)} label="copy patch" />
                  </div>
                  <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-green-400 overflow-x-auto leading-relaxed whitespace-pre max-h-[500px] overflow-y-auto">
                    <code>{generateQuickFix(result.results)}</code>
                  </pre>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* ── Static SEO content ── */}
      {!result && (
        <div className="mt-16 space-y-12 max-w-3xl">
          <div className="border-t border-zinc-800" />

          <section className="space-y-4">
            <h2 className="font-mono text-lg font-bold text-zinc-100">What this scanner checks</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { sev: "high"   as Severity, items: ["server_tokens on","autoindex on","Legacy TLS 1.0/1.1","No HTTPS","Missing HSTS","Dotfile exposure","Weak ciphers"] },
                { sev: "medium" as Severity, items: ["X-Frame-Options","X-Content-Type-Options","Content-Security-Policy","Referrer-Policy","HTTP/1.0 proxying","Upstream keepalive","Proxy header forwarding"] },
                { sev: "low"    as Severity, items: ["Rate limiting","Gzip compression","keepalive_timeout","client_max_body_size","sendfile","Permissions-Policy","TLS session cache"] },
              ]).map(({ sev, items }) => (
                <div key={sev} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
                  <SevBadge severity={sev} />
                  <ul className="space-y-1">
                    {items.map((i) => (
                      <li key={i} className="flex gap-2 text-xs text-zinc-400">
                        <span className="text-zinc-600 flex-shrink-0">—</span>{i}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-mono text-lg font-bold text-zinc-100">Scoring</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Score starts at 100. Deductions: High −10, Medium −5, Low −2. Each finding includes
              OWASP mapping, attack type, detection confidence, and a real-world impact explanation.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { range: "80–100", label: "CIS Compliant",  c: "text-emerald-400", bg: "bg-emerald-500/10", b: "border-emerald-500/20" },
                { range: "50–79",  label: "Partial",        c: "text-amber-400",   bg: "bg-amber-500/10",   b: "border-amber-500/20" },
                { range: "0–49",   label: "Non-Compliant",  c: "text-red-400",     bg: "bg-red-500/10",     b: "border-red-500/20" },
              ].map(({ range, label, c, bg, b }) => (
                <div key={label} className={`rounded-xl border ${b} ${bg} p-3 text-center`}>
                  <p className={`font-mono text-lg font-bold ${c}`}>{range}</p>
                  <p className={`font-mono text-[11px] ${c} opacity-70 mt-0.5`}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-mono text-lg font-bold text-zinc-100">Related tools</h2>
            <nav aria-label="Related tools and guides">
              <ul className="space-y-2">
                {[
                  { text: "NGINX Config Analyzer — AST-based full config audit",  href: "/tools/nginx-config-analyzer" },
                  { text: "NGINX Hardening Checker",                               href: "/tools/nginx-hardening-checker" },
                  { text: "Fix NGINX 502 Bad Gateway under load",                  href: "/blog/nginx-502-under-load" },
                  { text: "Configure upstream keepalive — prevent 502s",           href: "/blog/nginx-upstream-keepalive" },
                  { text: "NGINX rate limiting for APIs and login endpoints",       href: "/blog/nginx-rate-limiting-config" },
                ].map(({ text, href }) => (
                  <li key={href}>
                    <Link href={href} className="font-mono text-sm text-green-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 rounded">
                      → {text}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </section>
        </div>
      )}

    </div>
  );
}