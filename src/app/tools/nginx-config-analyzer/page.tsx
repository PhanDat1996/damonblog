"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Severity = "high" | "medium" | "low";
type Category = "Security" | "Performance" | "SEO" | "Best Practice";
type TabKey   = "all" | "security" | "performance" | "seo" | "best";

interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  whyItMatters: string;
  evidence: string;
  recommendation: string;
}

interface AnalysisResult {
  score: number;
  findings: Finding[];
  summary: {
    security: number;
    performance: number;
    seo: number;
    bestPractice: number;
    serverBlocks: number;
    locations: number;
  };
}

// ─── SAMPLE CONFIG ────────────────────────────────────────────────────────────

const SAMPLE_CONFIG = `server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;

// ─── ANALYSIS ENGINE ──────────────────────────────────────────────────────────

function stripComments(config: string): string {
  return config.split("\n").map((l) => l.replace(/\s+#.*$/, "")).join("\n");
}

function hasDirective(config: string, directive: string): boolean {
  const p = new RegExp(
    `(^|\\n)\\s*${directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"
  );
  return p.test(config);
}

function findDirectiveValues(config: string, directive: string): string[] {
  const esc = directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx  = new RegExp(`^\\s*${esc}\\s+(.+?);`, "gim");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(config)) !== null) out.push(m[1].trim());
  return out;
}

function countMatches(config: string, pattern: RegExp): number {
  return (config.match(pattern) ?? []).length;
}

function analyzeNginxConfig(rawConfig: string): AnalysisResult {
  const config   = stripComments(rawConfig || "");
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  if (!config.trim()) {
    return { score: 0, findings: [], summary: { security: 0, performance: 0, seo: 0, bestPractice: 0, serverBlocks: 0, locations: 0 } };
  }

  const mergedHeaders = findDirectiveValues(config, "add_header").join("\n").toLowerCase();

  // ── Security ──────────────────────────────────────────────────────────────
  if (!/strict-transport-security/i.test(mergedHeaders))
    add({ id: "missing-hsts", category: "Security", severity: "high",
      title: "Missing HSTS header",
      whyItMatters: "Without HSTS, browsers may still access the site over HTTP or be vulnerable to SSL stripping attacks.",
      evidence: "No add_header Strict-Transport-Security directive found.",
      recommendation: 'Add `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` inside the HTTPS server block.' });

  if (!/x-frame-options/i.test(mergedHeaders))
    add({ id: "missing-x-frame-options", category: "Security", severity: "medium",
      title: "Missing X-Frame-Options header",
      whyItMatters: "Absence increases clickjacking risk for browser-based applications.",
      evidence: "No add_header X-Frame-Options directive found.",
      recommendation: 'Add `add_header X-Frame-Options "SAMEORIGIN" always;` or use CSP frame-ancestors.' });

  if (!/x-content-type-options/i.test(mergedHeaders))
    add({ id: "missing-xcto", category: "Security", severity: "medium",
      title: "Missing X-Content-Type-Options header",
      whyItMatters: "Helps prevent MIME-sniffing attacks in browsers.",
      evidence: "No add_header X-Content-Type-Options directive found.",
      recommendation: 'Add `add_header X-Content-Type-Options "nosniff" always;`.' });

  if (!/content-security-policy/i.test(mergedHeaders))
    add({ id: "missing-csp", category: "Security", severity: "medium",
      title: "Missing Content-Security-Policy header",
      whyItMatters: "CSP reduces XSS and third-party script abuse risk if tuned correctly.",
      evidence: "No add_header Content-Security-Policy directive found.",
      recommendation: "Define a CSP matching your frontend assets. Start with report-only mode if unsure." });

  const sslProtocols = findDirectiveValues(config, "ssl_protocols").join(" ").toLowerCase();
  if (sslProtocols && /(tlsv1\b|tlsv1\.1\b)/i.test(sslProtocols))
    add({ id: "legacy-tls", category: "Security", severity: "high",
      title: "Legacy TLS versions enabled",
      whyItMatters: "TLS 1.0 and 1.1 are deprecated (RFC 8996) and will fail PCI-DSS, SOC 2, and most compliance audits.",
      evidence: `Configured ssl_protocols: ${sslProtocols}`,
      recommendation: "Use `ssl_protocols TLSv1.2 TLSv1.3;`" });

  if (hasDirective(config, "server_tokens")) {
    const vals = findDirectiveValues(config, "server_tokens");
    if (vals.some((v) => v.toLowerCase() !== "off"))
      add({ id: "server-tokens-on", category: "Security", severity: "low",
        title: "server_tokens is not disabled",
        whyItMatters: "NGINX version leaks in every Server header and error page, aiding attacker fingerprinting.",
        evidence: `server_tokens values: ${vals.join(", ")}`,
        recommendation: "Set `server_tokens off;` in the http block." });
  } else {
    add({ id: "server-tokens-missing", category: "Security", severity: "low",
      title: "server_tokens directive not explicitly set",
      whyItMatters: "Default is on — NGINX version leaks in every error page and Server response header.",
      evidence: "No server_tokens directive found.",
      recommendation: "Set `server_tokens off;` in the http block." });
  }

  if (!hasDirective(config, "limit_req_zone") && !hasDirective(config, "limit_req"))
    add({ id: "no-rate-limit", category: "Security", severity: "medium",
      title: "No rate limiting detected",
      whyItMatters: "Login, API, and password reset endpoints accept unlimited requests per client — no throttle on brute-force or scraping.",
      evidence: "No limit_req_zone or limit_req directive found.",
      recommendation: "Add limit_req_zone in the http block and limit_req on sensitive location blocks." });

  // ── Performance ───────────────────────────────────────────────────────────
  if (!findDirectiveValues(config, "client_max_body_size").length)
    add({ id: "client-body-size", category: "Performance", severity: "low",
      title: "client_max_body_size not explicitly defined",
      whyItMatters: "Default is 1MB — the most common cause of silent 413 errors on file upload endpoints.",
      evidence: "No client_max_body_size directive found.",
      recommendation: "Set `client_max_body_size 50M;` (or match your app's actual max upload size)." });

  if (!hasDirective(config, "gzip") && !hasDirective(config, "brotli on"))
    add({ id: "no-compression", category: "Performance", severity: "medium",
      title: "Compression not detected",
      whyItMatters: "Uncompressed text responses increase bandwidth cost and page load time for all users.",
      evidence: "No gzip or brotli enablement found.",
      recommendation: "Enable gzip or Brotli for HTML, CSS, JS, JSON, SVG, and plain text responses." });

  if (!hasDirective(config, "keepalive_timeout"))
    add({ id: "keepalive", category: "Performance", severity: "low",
      title: "keepalive_timeout not explicitly set",
      whyItMatters: "Untuned keepalive causes unnecessary connection churn or resource waste under sustained load.",
      evidence: "No keepalive_timeout directive found.",
      recommendation: "Set keepalive_timeout based on your traffic pattern (e.g. `keepalive_timeout 65;`)." });

  if (!hasDirective(config, "proxy_read_timeout") && /proxy_pass\s+/i.test(config))
    add({ id: "proxy-timeout", category: "Performance", severity: "medium",
      title: "Proxy timeouts not explicitly tuned",
      whyItMatters: "NGINX default is 60s — long-running backend operations (exports, reports) will 504 before completing.",
      evidence: "proxy_pass detected without proxy_read_timeout.",
      recommendation: "Set `proxy_connect_timeout`, `proxy_send_timeout`, and `proxy_read_timeout` based on actual p99 backend latency." });

  // ── Best Practice ─────────────────────────────────────────────────────────
  if (!hasDirective(config, "proxy_set_header X-Forwarded-For") && /proxy_pass\s+/i.test(config))
    add({ id: "x-forwarded-for", category: "Best Practice", severity: "medium",
      title: "Missing X-Forwarded-For header forwarding",
      whyItMatters: "Backend sees every request from 127.0.0.1. IP-based rate limiting, fraud detection, and access logs are silently broken.",
      evidence: "proxy_pass found without proxy_set_header X-Forwarded-For.",
      recommendation: "Add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`" });

  if (!hasDirective(config, "proxy_set_header X-Forwarded-Proto") && /proxy_pass\s+/i.test(config))
    add({ id: "x-forwarded-proto", category: "Best Practice", severity: "low",
      title: "Missing X-Forwarded-Proto header forwarding",
      whyItMatters: "Apps behind NGINX don't know if the original request was HTTP or HTTPS — breaks redirect logic and secure cookie handling.",
      evidence: "proxy_pass found without proxy_set_header X-Forwarded-Proto.",
      recommendation: "Add `proxy_set_header X-Forwarded-Proto $scheme;`" });

  // ── SEO ───────────────────────────────────────────────────────────────────
  if (/listen\s+80\b/i.test(config) && !/return\s+301\s+https:\/\//i.test(config) && !/rewrite\s+\^\s+https:\/\//i.test(config))
    add({ id: "http-no-redirect", category: "SEO", severity: "medium",
      title: "HTTP listener found without HTTPS redirect",
      whyItMatters: "Google indexes HTTP and HTTPS as separate URLs, splitting crawl budget and diluting link equity.",
      evidence: "listen 80 detected without an obvious 301 redirect to HTTPS.",
      recommendation: "Add a dedicated server block on port 80 with `return 301 https://$host$request_uri;`" });

  if (!hasDirective(config, "canonical") && !/return\s+301\s+https:\/\/www\./i.test(config) && !/return\s+301\s+https:\/\/[^$]*\$host/i.test(config))
    add({ id: "canonical-host", category: "SEO", severity: "low",
      title: "Canonical host redirect not detected",
      whyItMatters: "Serving both www and non-www without a redirect creates duplicate content and dilutes SEO signals.",
      evidence: "No clear canonical host redirect strategy found.",
      recommendation: "Enforce www or non-www consistently with a `return 301` redirect." });

  const severityWeights: Record<Severity, number> = { high: 18, medium: 10, low: 5 };
  const penalty = findings.reduce((sum, f) => sum + severityWeights[f.severity], 0);

  return {
    score: Math.max(0, 100 - penalty),
    findings,
    summary: {
      security:     findings.filter((f) => f.category === "Security").length,
      performance:  findings.filter((f) => f.category === "Performance").length,
      seo:          findings.filter((f) => f.category === "SEO").length,
      bestPractice: findings.filter((f) => f.category === "Best Practice").length,
      serverBlocks: countMatches(config, /^\s*server\s*\{/gim),
      locations:    countMatches(config, /^\s*location\s+/gim),
    },
  };
}

// ─── UI COMPONENTS ────────────────────────────────────────────────────────────

const SEV_STYLES: Record<Severity, string> = {
  high:   "bg-red-500/10 text-red-400 border border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  low:    "bg-zinc-700/60 text-zinc-400 border border-zinc-600/40",
};

const CAT_ICONS: Record<Category, string> = {
  Security:        "🛡",
  Performance:     "⚡",
  SEO:             "🔍",
  "Best Practice": "📋",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap ${SEV_STYLES[severity]}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const rec = finding.recommendation.replace(
    /`([^`]+)`/g,
    '<code class="font-mono text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-green-400">$1</code>'
  );
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 mb-1">
            <span>{CAT_ICONS[finding.category]}</span>
            <span>{finding.category}</span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">{finding.title}</h3>
        </div>
        <SeverityBadge severity={finding.severity} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Why it matters", content: finding.whyItMatters, html: undefined },
          { label: "Evidence",       content: finding.evidence,       html: undefined },
          { label: "Recommendation", content: undefined,              html: rec       },
        ].map(({ label, content, html }) => (
          <div key={label}>
            <div className="font-mono text-[10px] font-medium text-zinc-500 uppercase tracking-widest mb-1.5">
              {label}
            </div>
            {html !== undefined
              ? <p className="text-xs text-zinc-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="text-xs text-zinc-400 leading-relaxed">{content}</p>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 font-mono text-xs text-green-400 flex items-center gap-2">
      <span>✓</span> No findings in this section
    </div>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function NginxConfigAnalyzerPage() {
  const [config,    setConfig]    = useState(SAMPLE_CONFIG);
  const [domain,    setDomain]    = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [copied,    setCopied]    = useState(false);

  const result  = useMemo(() => analyzeNginxConfig(config), [config]);

  const grouped = useMemo(() => ({
    all:         result.findings,
    security:    result.findings.filter((f) => f.category === "Security"),
    performance: result.findings.filter((f) => f.category === "Performance"),
    seo:         result.findings.filter((f) => f.category === "SEO"),
    best:        result.findings.filter((f) => f.category === "Best Practice"),
  }), [result]);

  const scoreColor =
    result.score >= 85 ? "text-green-400"
    : result.score >= 65 ? "text-amber-400"
    : "text-red-400";

  const copyReport = useCallback(async () => {
    const lines = [
      "NGINX Config Analyzer Report",
      `Domain: ${domain || "N/A"}`,
      `Score: ${result.score}/100`,
      `Findings: ${result.findings.length}`,
      "",
      ...result.findings.map((f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\nCategory: ${f.category}\nEvidence: ${f.evidence}\nRecommendation: ${f.recommendation}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result, domain]);

  const downloadReport = useCallback(() => {
    const report = {
      tool: "nginx-config-analyzer",
      analyzed_domain: domain || null,
      score: result.score,
      summary: result.summary,
      findings: result.findings,
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "nginx-analysis-report.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [result, domain]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "all",         label: `All (${grouped.all.length})` },
    { key: "security",    label: `Security (${grouped.security.length})` },
    { key: "performance", label: `Performance (${grouped.performance.length})` },
    { key: "seo",         label: `SEO (${grouped.seo.length})` },
    { key: "best",        label: `Best Practice (${grouped.best.length})` },
  ];

  return (
    <div className="pb-24">

      {/* Breadcrumb */}
      <div className="font-mono text-xs text-zinc-500 mb-8">
        <Link href="/tools" className="hover:text-zinc-300 transition-colors">
          ~/tools
        </Link>
        <span className="mx-1 text-zinc-600">/</span>
        <span className="text-zinc-400">nginx-config-analyzer</span>
      </div>

      {/* Page header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
            Stable
          </span>
          <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Web tool
          </span>
        </div>
        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-zinc-100">
          nginx-config-analyzer
        </h1>
        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Paste your NGINX configuration — server block, reverse proxy config, or full nginx.conf — and get instant findings across security hardening gaps, performance tuning, SEO redirects, and proxy best practices. Scored report, exportable as JSON. Runs entirely in your browser.
        </p>
        <div className="flex flex-wrap gap-1.5 mt-4">
          {["#nginx", "#security", "#infrastructure", "#devops", "#web"].map((tag) => (
            <span key={tag} className="font-mono text-[11px] text-zinc-500 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Tool grid */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] items-start">

        {/* ── Input card ── */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <div className="font-mono text-sm font-semibold text-zinc-100">NGINX Config Analyzer</div>
            <div className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Paste your config to detect security hardening gaps, reverse proxy issues, performance risks, and SEO redirect problems.
            </div>
          </div>
          <div className="p-5 space-y-3">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Optional: domain being analyzed, e.g. www.example.com"
              className="w-full font-mono text-xs px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors"
            />
            <textarea
              value={config}
              onChange={(e) => setConfig(e.target.value)}
              placeholder="Paste nginx.conf, server block, or reverse proxy configuration here..."
              spellCheck={false}
              className="w-full min-h-[380px] font-mono text-xs px-3 py-3 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500 transition-colors resize-y leading-relaxed"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setConfig(SAMPLE_CONFIG)}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              >
                Load sample
              </button>
              <button
                onClick={() => setConfig("")}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={copyReport}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white transition-colors font-semibold"
              >
                {copied ? "✓ Copied" : "Copy report"}
              </button>
              <button
                onClick={downloadReport}
                className="font-mono text-xs px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              >
                Export JSON
              </button>
            </div>
            <div className="font-mono text-[11px] text-zinc-600 border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-900/40">
              ⚡ All analysis runs locally in your browser — no config data is sent to any server.
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-3">

          {/* Score */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-5">
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">Health score</div>
            <div className={`font-mono text-6xl font-bold leading-none ${scoreColor}`}>
              {result.score > 0 ? result.score : "—"}
            </div>
            <div className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Weighted across security, performance, SEO, and best practices.
            </div>
          </div>

          {/* Category summary */}
          <div className="grid grid-cols-2 gap-3">
            {([ ["Security", result.summary.security], ["Performance", result.summary.performance], ["SEO", result.summary.seo], ["Best Practice", result.summary.bestPractice] ] as [string, number][]).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3.5">
                <div className="font-mono text-[11px] text-zinc-500">{label}</div>
                <div className="font-mono text-3xl font-bold text-zinc-100 mt-1">{value}</div>
              </div>
            ))}
          </div>

          {/* Structure */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
            <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-3">Structure</div>
            <div className="grid grid-cols-2 gap-3">
              {([ ["Server blocks", result.summary.serverBlocks], ["Location blocks", result.summary.locations] ] as [string, number][]).map(([label, value]) => (
                <div key={label}>
                  <div className="font-mono text-[11px] text-zinc-500">{label}</div>
                  <div className="font-mono text-2xl font-bold text-zinc-100 mt-1">{value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Findings panel ── */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 mt-4">
        <div className="px-5 pt-5 pb-0">
          <div className="font-mono text-sm font-semibold text-zinc-100">Findings</div>
        </div>
        <div className="p-5">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 mb-5 pb-4 border-b border-zinc-800">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  activeTab === key
                    ? "bg-zinc-100 text-zinc-900 border-zinc-300 font-semibold"
                    : "bg-zinc-800/60 text-zinc-400 border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Results */}
          <div className="space-y-3">
            {grouped[activeTab].length === 0
              ? <EmptyState />
              : grouped[activeTab].map((f) => <FindingCard key={f.id} finding={f} />)
            }
          </div>
        </div>
      </div>

    </div>
  );
}