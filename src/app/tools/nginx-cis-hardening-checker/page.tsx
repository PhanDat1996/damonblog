"use client";

import { useState, useCallback, useRef, useEffect, useMemo, useDeferredValue, useId, memo } from "react";
import Link from "next/link";
import {
  scanConfig, generateHardenedConfig, generateQuickFix, PENALTY,
  type CISScanResult, type ScanStatus,
} from "@/lib/nginx-cis/analyzer";
import { CIS_RULES, type Severity, type CISResult, type Framework, type SourceRef } from "@/lib/nginx-cis/rules";
import type { ParseError } from "@/app/tools/nginx-config-analyzer/v2/types";
import { ConfigEditor, scrollEditorToLine } from "@/components/nginx-tools/ConfigEditor";

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_CONFIG = `# Intentionally insecure NGINX config for the demo
worker_processes 1;

events { worker_connections 256; }

http {
    server_tokens on;

    server {
        listen 80;
        server_name example.com;
        autoindex on;
        root /var/www/html;

        location / {
            proxy_pass         http://127.0.0.1:3000;
            proxy_http_version 1.0;
            proxy_set_header   Host $host;
        }

        location /static/ {
            add_header Cache-Control "public";
        }
    }

    server {
        listen 443 ssl;
        server_name example.com;
        ssl_certificate     /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;
        ssl_ciphers RC4:HIGH:!aNULL:!MD5;
        root /var/www/html;
    }
}`;

const SEV_ORDER: Severity[] = ["high", "medium", "low"];

const SEV: Record<Severity, { label: string; badge: string; dot: string }> = {
  high:   { label: "HIGH",   badge: "bg-red-500/15 text-red-300 border border-red-500/30",       dot: "bg-red-500" },
  medium: { label: "MEDIUM", badge: "bg-amber-500/15 text-amber-300 border border-amber-500/30", dot: "bg-amber-500" },
  low:    { label: "LOW",    badge: "bg-zinc-700/60 text-zinc-300 border border-zinc-600/50",    dot: "bg-zinc-400" },
};

const STATUS_STYLE: Record<ScanStatus, { color: string; ring: string; bar: string }> = {
  PASS:    { color: "text-emerald-400", ring: "ring-emerald-500/20", bar: "bg-emerald-500" },
  PARTIAL: { color: "text-amber-400",   ring: "ring-amber-500/20",   bar: "bg-amber-500" },
  FAIL:    { color: "text-red-400",     ring: "ring-red-500/20",     bar: "bg-red-500" },
  EMPTY:   { color: "text-zinc-400",    ring: "ring-zinc-500/10",    bar: "bg-zinc-600" },
};

const FRAMEWORK_LABEL: Record<Framework, string> = { cis: "CIS topic", "best-practice": "Best practice" };

const BTN = "font-mono text-xs px-3 py-2 rounded-lg border transition-colors";
const BTN_GHOST = `${BTN} border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100`;
const LABEL = "font-mono text-[11px] text-zinc-400 uppercase tracking-widest";

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
    <span className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
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
      className="font-mono text-[11px] px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:text-green-400 hover:border-green-500/40 transition-colors">
      {done ? "✓ copied" : label}
    </button>
  );
}

function RefLinks({ refs, onJump }: { refs: SourceRef[]; onJump: (line: number) => void }) {
  if (refs.length === 0) return null;
  const shown = refs.slice(0, 4);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((r, i) => (
        <button key={`${r.line}-${i}`} onClick={() => onJump(r.line)} title="Show in editor"
          className="max-w-full truncate font-mono text-[11px] px-2 py-1 rounded border border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:text-green-400 hover:border-green-500/40 transition-colors">
          line {r.line} · {r.label}
        </button>
      ))}
      {refs.length > shown.length && <span className="font-mono text-[11px] text-zinc-400 py-1">+{refs.length - shown.length} more</span>}
    </div>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

const FindingCard = memo(function FindingCard({ result, onJump }: { result: CISResult; onJump: (line: number) => void }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { rule } = result;

  return (
    <div className={`rounded-lg border transition-colors ${open ? "border-zinc-700 bg-zinc-900/70" : "border-zinc-800 bg-zinc-900/40"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pt-3 font-mono text-[11px] text-zinc-400">
        <SevBadge severity={rule.severity} />
        <span>{rule.id}</span>
        <span aria-hidden="true" className="text-zinc-600">·</span>
        <span>{rule.category}</span>
        <span className="ml-auto">{FRAMEWORK_LABEL[rule.framework]}</span>
      </div>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
        className="w-full text-left px-4 pt-1 pb-2 flex items-start gap-3">
        <span className="flex-1 font-mono text-sm font-semibold text-zinc-100 leading-snug">{rule.title}</span>
        <span aria-hidden="true" className={`mt-1 text-[10px] text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      <div className="px-4 pb-3">
        <RefLinks refs={result.refs} onJump={onJump} />
      </div>

      {open && (
        <div id={panelId} className="px-4 pb-4 border-t border-zinc-800 pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className={`${LABEL} mb-1.5`}>What was found</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{rule.description}</p>
              {result.evidence && <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed whitespace-pre-line">{result.evidence}</p>}
            </div>
            <div>
              <p className={`${LABEL} mb-1.5`}>Why it matters</p>
              <p className="text-xs text-zinc-300 leading-relaxed">{rule.why_it_matters}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className={LABEL}>Fix</p>
              <CopyBtn text={rule.config_fix} label="copy fix" />
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed mb-2">{rule.remediation}</p>
            <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
              <code>{rule.config_fix}</code>
            </pre>
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 font-mono text-[11px]">
            {[
              ["How it's checked", rule.detection_logic],
              ["Attack", rule.attack_type],
              ["OWASP", rule.owasp_mapping],
              ["Confidence", rule.confidence],
              ["Reference", rule.reference],
            ].map(([k, v]) => (
              <div key={k} className={k === "How it's checked" ? "sm:col-span-2" : undefined}>
                <dt className="inline text-zinc-500">{k}: </dt>
                <dd className="inline text-zinc-300">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
});

function ResultList({ title, results }: { title: string; results: CISResult[] }) {
  if (results.length === 0) return null;
  return (
    <details className="group rounded-xl border border-zinc-800 bg-zinc-900/40">
      <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none font-mono text-xs text-zinc-300 hover:text-zinc-100">
        <span>{title} <span className="text-zinc-400">({results.length})</span></span>
        <span aria-hidden="true" className="text-[10px] text-zinc-400 group-open:rotate-180 transition-transform">▼</span>
      </summary>
      <ul className="px-4 pb-3 space-y-1.5">
        {results.map((r) => (
          <li key={r.rule.id} className="flex gap-3 font-mono text-xs">
            <span className="w-16 flex-shrink-0 text-zinc-400">{r.rule.id}</span>
            <span className="text-zinc-300">{r.rule.title}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NginxCisCheckerPage() {
  const [config, setConfig]       = useState(SAMPLE_CONFIG);
  const [framework, setFramework] = useState<Framework | "all">("all");
  const [jump, setJump]           = useState<{ line: number; nonce: number } | null>(null);
  const [panel, setPanel]         = useState<"none" | "hardened" | "patch">("none");
  const editorRef    = useRef<HTMLTextAreaElement>(null);
  const editorBoxRef = useRef<HTMLDivElement>(null);

  // Scan as you type; the deferred value keeps typing responsive on large configs
  const deferredConfig = useDeferredValue(config);
  const result: CISScanResult = useMemo(() => scanConfig(deferredConfig), [deferredConfig]);
  const scanning = deferredConfig !== config;

  const updateConfig = useCallback((v: string) => { setConfig(v); setJump(null); }, []);
  const jumpTo = useCallback((line: number) => setJump({ line, nonce: Date.now() }), []);

  useEffect(() => {
    if (!jump || !editorRef.current) return;
    scrollEditorToLine(editorRef.current, jump.line);
    editorBoxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [jump]);

  const inFramework = (r: CISResult) => framework === "all" || r.rule.framework === framework;
  const failed = result.results
    .filter((r) => r.status === "fail" && inFramework(r))
    .sort((a, b) => SEV_ORDER.indexOf(a.rule.severity) - SEV_ORDER.indexOf(b.rule.severity));
  const passed = result.results.filter((r) => r.status === "pass" && inFramework(r));
  const notApplicable = result.results.filter((r) => r.status === "n/a" && inFramework(r));
  const st = STATUS_STYLE[result.status];
  const empty = result.status === "EMPTY";

  return (
    <div className="pb-24">
      <nav className="font-mono text-xs text-zinc-400 mb-6" aria-label="Breadcrumb">
        <Link href="/tools" className="hover:text-zinc-200 transition-colors">~/tools</Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-300">nginx-cis-hardening-checker</span>
      </nav>

      <header className="mb-6">
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">NGINX Hardening Checker</h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste an NGINX configuration to check it against {CIS_RULES.length} hardening rules: topics from the CIS NGINX Benchmark
          plus common best practices. Each finding links to the line it comes from and includes a config fix.
          This is not an official CIS assessment.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-400">
          v4 · runs in your browser, nothing is uploaded · static analysis only, confirm with <code className="text-green-400">nginx -t</code>
          {scanning && <span className="ml-2 text-zinc-500 animate-pulse" aria-live="polite">scanning…</span>}
        </p>
      </header>

      <div className="xl:-mx-24">
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* Editor */}
          <div ref={editorBoxRef} className="lg:sticky lg:top-20 scroll-mt-20 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300 flex-1">nginx.conf</span>
              <select aria-label="Load a config" value="" onChange={(e) => {
                const v = e.target.value;
                updateConfig(v === "insecure" ? SAMPLE_CONFIG : v === "hardened" ? generateHardenedConfig() : "");
              }}
                className="font-mono text-xs px-2 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 outline-none focus:border-zinc-500">
                <option value="" disabled>Load…</option>
                <option value="insecure">Insecure sample</option>
                <option value="hardened">Hardened baseline</option>
                <option value="clear">Empty editor</option>
              </select>
            </div>
            <ConfigEditor value={config} onChange={updateConfig} highlightLine={jump?.line ?? null} inputRef={editorRef} />
          </div>

          {/* Results */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 ring-1 ${st.ring}`}>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="flex items-end gap-2">
                  <span className={`font-mono text-5xl font-bold leading-none ${st.color}`}>{empty ? "–" : result.score}</span>
                  <span className="font-mono text-sm text-zinc-400 mb-1">/ 100</span>
                </div>
                <div className="flex-1 min-w-[10rem] mb-0.5">
                  <p className={`font-mono text-lg font-bold ${st.color}`}>{result.riskLabel}</p>
                  <p className="font-mono text-xs text-zinc-400">Hardening score</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden" role="progressbar"
                aria-valuenow={result.score} aria-valuemin={0} aria-valuemax={100} aria-label={`Hardening score: ${result.score}/100`}>
                <div className={`h-full rounded-full transition-all duration-700 ${st.bar}`} style={{ width: `${empty ? 0 : result.score}%` }} />
              </div>
              <p className="mt-3 text-xs text-zinc-300">{result.message}</p>
              {!empty && (
                <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {SEV_ORDER.map((s) => (
                    <span key={s} className={`px-2 py-1 rounded ${result.counts[s] ? SEV[s].badge : "border border-zinc-800 text-zinc-500"}`}>
                      {result.counts[s]} {s}
                    </span>
                  ))}
                  <span className="px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">{result.counts.passed} passed</span>
                  <span className="px-2 py-1 rounded border border-zinc-700 text-zinc-400">{result.counts.notApplicable} not applicable</span>
                </div>
              )}
              {result.snippet && (
                <p className="mt-3 font-mono text-[11px] text-zinc-400">
                  No http{"{}"} block found: treating this as a partial config. Checks for nginx.conf-level settings are marked not applicable.
                </p>
              )}
            </div>

            {result.syntaxErrors.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 space-y-1">
                <div className="font-mono text-xs font-semibold text-red-300">✖ Syntax errors: nginx -t would reject this config</div>
                {result.syntaxErrors.map((e: ParseError, i: number) => (
                  <button key={i} onClick={() => jumpTo(e.line)}
                    className="block text-left font-mono text-xs text-red-300/90 hover:text-red-200 underline decoration-red-500/30 underline-offset-2 py-0.5">
                    line {e.line} — {e.message}
                  </button>
                ))}
              </div>
            )}

            {!empty && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
                <div className="px-4 pt-4 pb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800">
                  <h2 className="font-mono text-sm font-semibold text-zinc-100">
                    Issues <span className="text-zinc-400 font-normal text-xs">({failed.length})</span>
                  </h2>
                  <div className="flex gap-1.5" role="group" aria-label="Filter by rule source">
                    {([["all", "All rules"], ["cis", "CIS topics"], ["best-practice", "Best practice"]] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setFramework(v)} aria-pressed={framework === v}
                        className={`font-mono text-xs px-2.5 py-2 rounded-lg border transition-colors ${
                          framework === v ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                            : "bg-zinc-800/60 text-zinc-300 border-zinc-700 hover:text-zinc-100"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {failed.length === 0
                    ? <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 font-mono text-xs text-emerald-300">✓ No issues in this set of rules</p>
                    : failed.map((r) => <FindingCard key={r.rule.id} result={r} onJump={jumpTo} />)}
                </div>
              </div>
            )}

            {!empty && <>
              <ResultList title="Passed" results={passed} />
              <ResultList title="Not applicable to this config" results={notApplicable} />
            </>}
          </div>
        </div>

        {/* Hardened config / patch */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([
            { key: "hardened" as const, title: "Hardened baseline config", desc: "A full nginx.conf that passes every check here.", content: generateHardenedConfig(), copy: "copy config" },
            { key: "patch" as const, title: "Fixes for this config", desc: `Config snippets for the ${result.results.filter((r) => r.status === "fail").length} failing checks.`, content: generateQuickFix(result.results), copy: "copy fixes" },
          ]).map((p) => (
            <div key={p.key} className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3 ${panel === p.key ? "sm:col-span-2" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-mono text-sm font-semibold text-zinc-100">{p.title}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{p.desc}</p>
                </div>
                <button onClick={() => setPanel((cur) => cur === p.key ? "none" : p.key)} aria-expanded={panel === p.key} className={BTN_GHOST}>
                  {panel === p.key ? "Hide" : "Show"}
                </button>
              </div>
              {panel === p.key && (
                <div>
                  <div className="flex justify-end mb-1.5"><CopyBtn text={p.content} label={p.copy} /></div>
                  <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-green-400 overflow-auto leading-relaxed whitespace-pre max-h-[500px]">
                    <code>{p.content}</code>
                  </pre>
                  {p.key === "hardened" && (
                    <p className="font-mono text-[11px] text-zinc-400 mt-2">
                      Update server_name, certificate paths and the upstream. Validate with <code className="text-zinc-300">nginx -t</code>.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Static content */}
      <div className="mt-16 space-y-12 max-w-3xl">
        <div className="border-t border-zinc-800" />

        <section className="space-y-4">
          <h2 className="font-mono text-lg font-bold text-zinc-100">What this checker covers</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Rules marked <span className="text-zinc-200">CIS topic</span> cover subjects from the CIS NGINX Benchmark.
            Rules marked <span className="text-zinc-200">Best practice</span> are common hardening or operational settings that the benchmark does not include.
            The config is parsed into blocks first, so comments are ignored and inherited settings (add_header, proxy_set_header, ssl_*) are resolved the way NGINX resolves them.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(CIS_RULES.reduce<Record<string, typeof CIS_RULES>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {}))
              .map(([cat, rules]) => (
                <div key={cat} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
                  <h3 className="font-mono text-sm font-semibold text-zinc-100">{cat}</h3>
                  <ul className="space-y-1">
                    {rules.map((r) => (
                      <li key={r.id} className="flex gap-2 text-xs text-zinc-400">
                        <span className="text-zinc-500 flex-shrink-0">—</span>
                        <span>{r.title} <span className="text-zinc-500">({FRAMEWORK_LABEL[r.framework].toLowerCase()})</span></span>
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
            The score starts at 100. Each failing check deducts points by severity: high −{PENALTY.high}, medium −{PENALTY.medium}, low −{PENALTY.low}.
            One high-severity issue caps the score at 69, two at 49, three or more at 39, and syntax errors cap it at 49.
            Checks that do not apply to the config (for example HSTS when there is no HTTPS server) are listed separately and cost nothing.
            The score is a prioritisation aid, not a compliance result.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-lg font-bold text-zinc-100">Related</h2>
          <ul className="space-y-2">
            {[
              { text: "NGINX Config Analyzer — security, performance and reverse proxy audit", href: "/tools/nginx-config-analyzer" },
              { text: "Fix NGINX 502 Bad Gateway under load",                                href: "/blog/nginx-502-under-load" },
              { text: "Configure upstream keepalive",                                         href: "/blog/nginx-upstream-keepalive" },
              { text: "NGINX rate limiting for APIs and login endpoints",                     href: "/blog/nginx-rate-limiting-config" },
            ].map(({ text, href }) => (
              <li key={href}>
                <Link href={href} className="font-mono text-sm text-green-400 hover:underline">→ {text}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
