"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Severity = "high" | "medium" | "low";
type Category = "Security" | "Performance" | "Best Practice";
type TabKey   = "all" | "security" | "performance" | "best";

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
    return { score: 0, findings: [], summary: { security: 0, performance: 0, bestPractice: 0, serverBlocks: 0, locations: 0 } };
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

  const severityWeights: Record<Severity, number> = { high: 18, medium: 10, low: 5 };
  const penalty = findings.reduce((sum, f) => sum + severityWeights[f.severity], 0);

  return {
    score: Math.max(0, 100 - penalty),
    findings,
    summary: {
      security:     findings.filter((f) => f.category === "Security").length,
      performance:  findings.filter((f) => f.category === "Performance").length,
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
          Paste your NGINX configuration — server block, reverse proxy config, or full nginx.conf — and get instant findings across security hardening gaps, performance tuning, and proxy best practices. Scored report, exportable as JSON. Runs entirely in your browser.
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
              Paste your config to detect security hardening gaps, reverse proxy issues, and performance risks.
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
              Weighted across security, performance, and best practices.
            </div>
          </div>

          {/* Category summary */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ["Security",      result.summary.security],
              ["Performance",   result.summary.performance],
              ["Best Practice", result.summary.bestPractice],
            ] as [string, number][]).map(([label, value]) => (
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
              {([
                ["Server blocks",   result.summary.serverBlocks],
                ["Location blocks", result.summary.locations],
              ] as [string, number][]).map(([label, value]) => (
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

      {/* ── Landing / SEO content ─────────────────────────────────────────── */}
      <div className="mt-20 space-y-16">

        <div className="border-t border-zinc-800" />

        {/* Intro */}
        <section className="max-w-3xl space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your app is behind NGINX. Requests are flowing. Everything <em>looks</em> fine.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Then a 413 error starts hitting your file upload endpoint because{" "}
            <Code>client_max_body_size</Code> defaults to 1MB and nobody set it explicitly.
            Or your backend logs show every request coming from <Code>127.0.0.1</Code> because{" "}
            <Code>X-Forwarded-For</Code> was never forwarded. Or your monitoring flags that{" "}
            <Code>server_tokens</Code> is still on and your NGINX version is leaking in every
            response header — visible to any scanner on the internet.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            None of these show up in <Code>nginx -t</Code>. The config is syntactically valid.
            It&apos;s just wrong.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This is the gap the <strong className="text-zinc-200">NGINX Config Analyzer</strong> fills.
            It&apos;s not a linter — it&apos;s a security and operational audit tool that checks
            your config against real hardening standards, reverse proxy best practices, and
            production-grade defaults. Paste the config, get findings in seconds, know exactly
            what to fix before it becomes an incident.
          </p>
        </section>

        {/* What this tool checks */}
        <section className="space-y-6">
          <h2 className="font-mono text-xl font-bold text-zinc-100">What this tool checks</h2>
          {([
            { title: "Security", icon: "🛡", items: [
              { label: "HSTS (Strict-Transport-Security)", desc: "Missing on most configs. Without it, browsers can be downgraded to HTTP even with a valid certificate." },
              { label: "X-Frame-Options", desc: "Absence opens clickjacking vectors on any page that renders iframe-embeddable content." },
              { label: "X-Content-Type-Options: nosniff", desc: "Prevents MIME-sniffing attacks in older and non-compliant browsers." },
              { label: "Content-Security-Policy", desc: "Presence detected; policy quality is out of scope, but absence is flagged." },
              { label: "TLS version enforcement", desc: "Checks for TLS 1.0 / 1.1 in ssl_protocols — deprecated by RFC, will fail PCI-DSS and SOC 2." },
              { label: "server_tokens", desc: "Checks whether NGINX version disclosure is explicitly disabled." },
              { label: "Rate limiting", desc: "Checks for limit_req_zone / limit_req on configs exposing login or API endpoints." },
            ]},
            { title: "Performance", icon: "⚡", items: [
              { label: "Compression", desc: "Checks for gzip or brotli. Uncompressed text responses are a measurable cost on high-traffic sites." },
              { label: "keepalive_timeout", desc: "Explicit tuning prevents resource waste (too high) and connection churn (not set at all)." },
              { label: "client_max_body_size", desc: "Most common cause of silent 413 errors in production. Default is 1MB." },
              { label: "Proxy timeouts", desc: "Missing proxy_read/connect/send_timeout means NGINX defaults may not match backend latency under load." },
            ]},
            { title: "Reverse Proxy", icon: "📋", items: [
              { label: "X-Forwarded-For", desc: "Without this, backend sees 127.0.0.1 for every request. IP-based rate limiting and geo logic break silently." },
              { label: "X-Forwarded-Proto", desc: "Without this, apps don't know if the original request was HTTP or HTTPS — breaks redirects, CSRF tokens, and secure cookies." },
            ]},
          ] as { title: string; icon: string; items: { label: string; desc: string }[] }[]).map(({ title, icon, items }) => (
            <div key={title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
              <h3 className="font-mono text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{icon}</span>{title}
              </h3>
              <ul className="space-y-2.5">
                {items.map(({ label, desc }) => (
                  <li key={label} className="flex gap-3 text-sm">
                    <span className="text-green-400 font-mono mt-0.5 flex-shrink-0">—</span>
                    <span>
                      <span className="text-zinc-200 font-medium">{label}</span>
                      <span className="text-zinc-500"> — {desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Why dangerous */}
        <section className="space-y-5">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Why NGINX misconfiguration is dangerous</h2>
          <div className="space-y-4 max-w-3xl">
            {([
              { h: "Missing security headers are exploitable.", b: "Clickjacking via missing X-Frame-Options, MIME confusion via missing X-Content-Type-Options, and SSL stripping via missing HSTS are real attack classes with documented CVEs. They're consistently the easiest findings on any external pentest — zero specialized knowledge required." },
              { h: "Proxy header gaps corrupt application behavior.", b: "In a typical NGINX-in-front-of-Node.js/Django setup, the backend has no visibility into the real client IP unless NGINX forwards it. IP-based rate limiting, fraud detection, and geo-restriction all receive 127.0.0.1 for every request. The security control silently fails." },
              { h: "Silent failures are the worst kind.", b: "A 413 error that only appears when users upload a file over 1MB doesn't fail at deployment — it fails in production, reported by a user, often months after launch. Same story for proxy timeouts that only surface under load." },
              { h: "Legacy TLS fails compliance.", b: "TLS 1.0 and 1.1 were deprecated in RFC 8996 (2021). Any org running PCI-DSS, HIPAA, ISO 27001, or SOC 2 Type II will fail audit if they're reachable. The fix is one line." },
              { h: "Version disclosure is free reconnaissance.", b: "server_tokens on (the default) appends the NGINX version to every error response and Server header. An attacker scanning for vulnerable versions doesn't need to guess — you're advertising it." },
            ] as { h: string; b: string }[]).map(({ h, b }) => (
              <p key={h} className="text-sm text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">{h}</strong>{" "}{b}
              </p>
            ))}
          </div>
        </section>

        {/* Common issues */}
        <section className="space-y-5">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Common issues found in real configs</h2>
          <div className="space-y-4">
            {([
              { num: "01", title: "Missing HSTS header", sev: "HIGH",
                body: "The most common high-severity finding. Nearly every config handling HTTPS is missing Strict-Transport-Security. Without it: MITM attackers can SSL-strip to HTTP, browsers won't cache the HTTPS preference, and subdomains stay unprotected.",
                code: `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;` },
              { num: "02", title: "client_max_body_size not set", sev: "LOW",
                body: "Default is 1MB. Any file upload endpoint returns 413 silently once a user exceeds it. The error appears as a generic failed request — no one thinks to check NGINX.",
                code: `client_max_body_size 50M;` },
              { num: "03", title: "Proxy headers not forwarded", sev: "MEDIUM",
                body: "proxy_pass present, no X-Forwarded-For or X-Forwarded-Proto. Backend logs show 127.0.0.1 for everything. IP-based rate limiting, fraud detection, and $scheme logic all break silently.",
                code: `proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;` },
              { num: "04", title: "Proxy timeouts not tuned", sev: "MEDIUM",
                body: "NGINX default is 60s for all proxy timeouts. Long-running operations (report generation, exports) will 504 before completing regardless of whether the backend finished.",
                code: `proxy_connect_timeout 10s;\nproxy_send_timeout    90s;\nproxy_read_timeout    90s;` },
              { num: "05", title: "server_tokens not disabled", sev: "LOW",
                body: "One line fix. Removes NGINX version from Server headers and error pages. Zero operational impact.",
                code: `server_tokens off;` },
              { num: "06", title: "No rate limiting", sev: "MEDIUM",
                body: "No limit_req_zone or limit_req found. Every exposed endpoint — login, password reset, API — accepts unlimited requests per client with no throttle.",
                code: `# http{} block\nlimit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;\n\n# location block\nlimit_req zone=api burst=20 nodelay;` },
            ] as { num: string; title: string; sev: string; body: string; code: string }[]).map(({ num, title, sev, body, code }) => {
              const sevStyle = sev === "HIGH"
                ? "bg-red-500/10 text-red-400 border-red-500/20"
                : sev === "MEDIUM"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                : "bg-zinc-700/60 text-zinc-400 border-zinc-600/40";
              return (
                <div key={num} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 md:p-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-zinc-600">{num}</span>
                      <h3 className="font-mono text-sm font-semibold text-zinc-100">{title}</h3>
                    </div>
                    <span className={`font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border flex-shrink-0 ${sevStyle}`}>
                      {sev}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
                  <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
                    <code>{code}</code>
                  </pre>
                </div>
              );
            })}
          </div>
        </section>

        {/* How to apply fixes */}
        <section className="space-y-5">
          <h2 className="font-mono text-xl font-bold text-zinc-100">How to validate and apply fixes</h2>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
            After making changes, always validate syntax before reloading. Never use{" "}
            <Code>systemctl restart nginx</Code> for config changes in production — it drops
            active connections. <Code>reload</Code> sends SIGHUP and drains existing connections
            gracefully.
          </p>
          <pre className="font-mono text-xs bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-green-400 overflow-x-auto leading-relaxed whitespace-pre">
            <code>{`# Test config syntax
nginx -t

# If output is "syntax is ok" and "test is successful":
systemctl reload nginx

# Verify changes applied
nginx -T | grep server_tokens
nginx -T | grep Strict-Transport-Security

# Verify headers are being served
curl -I https://yourdomain.com | grep -E "Strict-Transport|X-Frame|X-Content-Type|Content-Security"

# Confirm real IPs in backend logs after fixing X-Forwarded-For
tail -f /var/log/app/access.log | grep -v "127.0.0.1"`}</code>
          </pre>
        </section>

        {/* Real production scenarios */}
        <section className="space-y-5">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Real production scenarios</h2>
          <div className="space-y-4 max-w-3xl">
            {([
              { label: "Financial services / banking portals",
                body: "Every external pentest of a regulated web app checks for security headers in the first five minutes. Missing HSTS, X-Frame-Options, and X-Content-Type-Options appear on every report. In one case a bank's payment portal was flagged for leaking its NGINX version via server_tokens and serving TLS 1.0 — both caught by static config analysis before the pentest ran a single active scan." },
              { label: "SaaS platforms with file upload features",
                body: "A SaaS app handles document uploads fine in staging because test files are small. In production, a customer uploads a 12MB PDF. NGINX returns 413. The customer reports 'the upload is broken.' The team checks application logs — nothing there, because NGINX rejected the request before it reached the app. Twenty minutes of debugging later, someone remembers client_max_body_size." },
              { label: "E-commerce behind a reverse proxy",
                body: "An e-commerce platform running NGINX in front of Django. After a deployment, the fraud detection system stopped triggering on high-risk IPs. Root cause: a config change removed proxy_set_header X-Forwarded-For. The app received every request from 127.0.0.1, so all IP-based rules evaluated against localhost. The fraud detection system was silently disabled for three days." },
              { label: "Microservice API gateways",
                body: "NGINX routing /api/v1/users to one service, /api/v1/orders to another. Without per-location timeout tuning, a slow upstream (p99 latency ~45s) causes NGINX to return 504 on every request exceeding the 60s default — even when the upstream successfully completes. The symptom looks like an application bug; the root cause is in NGINX config." },
            ] as { label: string; body: string }[]).map(({ label, body }) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-2">
                <div className="font-mono text-xs font-semibold text-green-400">{label}</div>
                <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Related */}
        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">Related</h2>
          <ul className="space-y-2">
            {([
              { label: "NGINX Security Hardening Guide: Headers, TLS, and Rate Limiting", href: "" },
              { label: "How to Fix 413 Request Entity Too Large in NGINX", href: "" },
              { label: "Check Open Ports in Linux: ss vs netstat", href: "https://www.damonsec.com/blog/check-open-ports-linux-ss-netstat-guide" },
              { label: "systemctl Restart Service Not Working: Fix Guide", href: "https://www.damonsec.com/blog/systemctl-restart-service-not-working-fix" },
            ] as { label: string; href: string }[]).map(({ label, href }) =>
              href ? (
                <li key={label}>
                  <a href={href} className="font-mono text-sm text-green-400 hover:underline">→ {label}</a>
                </li>
              ) : (
                <li key={label} className="flex items-center gap-2">
                  <span className="font-mono text-sm text-zinc-600">→ {label}</span>
                  <span className="font-mono text-xs text-zinc-700">(coming soon)</span>
                </li>
              )
            )}
          </ul>
        </section>

        {/* FAQ */}
        <section className="space-y-4">
          <h2 className="font-mono text-xl font-bold text-zinc-100">FAQ</h2>
          <div className="space-y-3">
            {([
              { q: "What is the NGINX Config Analyzer?",
                a: "A browser-based static analysis tool that parses your NGINX configuration and checks it against a rule set covering security hardening, performance tuning, and reverse proxy best practices. It produces a scored report with categorized findings — each with the directive that triggered it, why it matters, and the exact fix. It is not a connectivity tester or live scanner." },
              { q: "Is it safe to paste my NGINX config here?",
                a: "Yes. The entire analysis runs in JavaScript inside your browser. No config data is transmitted to any server — no API calls, no logging, no backend. Verify it yourself: open DevTools → Network tab before pasting and you'll see zero outbound requests." },
              { q: "What are the most dangerous NGINX misconfigurations?",
                a: "Ranked by impact: (1) TLS 1.0/1.1 enabled — fails compliance, allows downgrade attacks; (2) Missing HSTS — enables SSL stripping even with a valid cert; (3) X-Forwarded-For not forwarded — silently breaks all IP-based security controls in the app layer; (4) No rate limiting on auth endpoints; (5) server_tokens on — free version fingerprinting. All five are fixed with one or two config lines." },
              { q: "Can this tool detect all NGINX issues?",
                a: "No. Static config analysis can't test actual connectivity, verify TLS certificate validity, check upstream health, or evaluate CSP policy quality. It catches structural and configurational issues — the class of bugs nginx -t accepts but that cause real problems. For a complete picture, pair it with Mozilla Observatory, testssl.sh, and nginx -T to verify the full compiled config." },
              { q: "Does it support multi-file configs with include directives?",
                a: "Not yet. The analyzer evaluates the pasted text as a single unit. If your config uses include directives, paste the specific server or location block you want to audit, or manually concatenate the relevant files. Include-aware parsing is on the roadmap." },
              { q: "Why does it flag missing CSP even though CSP is hard to configure?",
                a: "Because absence is unambiguously worse than an imperfect policy. No CSP means no constraints on script execution. The recommendation is to start with Content-Security-Policy-Report-Only to observe violations before enforcing. The tool flags absence, not imperfection." },
            ] as { q: string; a: string }[]).map(({ q, a }) => (
              <details key={q} className="group rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none font-mono text-sm font-medium text-zinc-200 hover:text-white transition-colors select-none">
                  {q}
                  <span className="text-zinc-600 group-open:rotate-180 transition-transform flex-shrink-0 text-base leading-none">↓</span>
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

// ─── INLINE HELPER ────────────────────────────────────────────────────────────

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-green-400">
      {children}
    </code>
  );
}