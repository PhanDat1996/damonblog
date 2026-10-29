import type { Metadata } from 'next';
import Link from 'next/link';

const BASE_URL = 'https://www.damonsec.com';

export const metadata: Metadata = {
  title: 'Free NGINX & PostgreSQL Security Tools',
  description:
    'Free browser-based tools to audit NGINX configs, check NGINX versions for CVEs, and harden PostgreSQL. Paste your config and get fixes. Nothing is uploaded.',
  alternates: { canonical: '/tools' },
};

interface WebTool {
  slug: string;
  title: string;
  glyph: string;
  tagline: string;
  input: string;
  checks: string[];
  note?: string;
}

interface CliTool {
  name: string;
  tagline: string;
  language: string;
  href: string;
}

// Browser tools — all analysis runs client-side; no config leaves the page.
const WEB_TOOLS: WebTool[] = [
  {
    slug: 'nginx-config-analyzer',
    title: 'NGINX Config Analyzer',
    glyph: '{ }',
    tagline: 'Scored security, performance and reliability audit of any NGINX config.',
    input: 'nginx.conf, server blocks, multiple files',
    checks: [
      '40+ context-aware rules',
      'Resolves include across multiple files',
      'Request flow simulator',
      'Export findings as JSON',
    ],
  },
  {
    slug: 'nginx-cis-hardening-checker',
    title: 'NGINX Hardening Checker',
    glyph: 'CIS',
    tagline: 'Check an NGINX config against CIS NGINX Benchmark topics and common hardening practice.',
    input: 'nginx.conf',
    checks: [
      'TLS, security headers, request limits, logging',
      'Each finding links to its config line',
      'Config fix snippet per finding',
      'Hardened baseline that passes every check',
    ],
  },
  {
    slug: 'nginx-cve-checker',
    title: 'NGINX CVE Checker',
    glyph: 'CVE',
    tagline: 'See which known CVEs affect your NGINX version and enabled modules.',
    input: 'nginx -v output or version number',
    checks: [
      'Accepts nginx/1.24.0 or plain 1.24.0',
      'Optional nginx.conf for module-aware matching',
      'Separates conditional and unconditional CVEs',
    ],
    note: 'Advisory database last updated Apr 28, 2026',
  },
  {
    slug: 'pg-hardening-checker',
    title: 'PostgreSQL Hardening Checker',
    glyph: 'PG',
    tagline: 'CIS-style security audit for postgresql.conf and pg_hba.conf.',
    input: 'postgresql.conf, pg_hba.conf',
    checks: [
      'Network exposure and pg_hba auth methods',
      'SSL/TLS, password hashing, audit logging',
      'Exact config fix for each finding',
      'Generates a hardened baseline for both files',
    ],
  },
];

const CLI_TOOLS: CliTool[] = [
  {
    name: 'tcp-port-checker',
    tagline: 'Threaded TCP port scanner with banner grabbing and CSV/JSON export. Standard library only.',
    language: 'Python',
    href: 'https://github.com/PhanDat1996/tcp-port-checker',
  },
  {
    name: 'sys-monitor',
    tagline: 'top-like system monitor in pure Bash: per-core CPU, memory, disk, network, top processes, with logging.',
    language: 'Bash',
    href: 'https://github.com/PhanDat1996/sys_monitor',
  },
  {
    name: 'seo-pro-audit',
    tagline: 'Crawls a sitemap and checks titles, meta, canonical, OG tags and JSON-LD, with optional PageSpeed scores.',
    language: 'Python',
    href: 'https://github.com/PhanDat1996/seo-pro-audit',
  },
];

const RELATED_GUIDES = [
  { slug: 'nginx-troubleshooting-guide', label: 'NGINX troubleshooting: 502, 504, 403 and config errors' },
  { slug: 'nginx-ssl-hardening', label: 'NGINX SSL hardening for an A+ on SSL Labs' },
  { slug: 'linux-security-hardening-guide', label: 'Applying CIS benchmarks without lockouts' },
];

const toolsJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: WEB_TOOLS.map((tool, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'WebApplication',
      name: tool.title,
      description: tool.tagline,
      url: `${BASE_URL}/tools/${tool.slug}`,
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Any (runs in browser)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  })),
};

export default function ToolsPage() {
  return (
    <div className="space-y-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd) }}
      />

      {/* Header */}
      <header className="space-y-5 border-b border-zinc-800 pb-10">
        <div className="font-mono text-xs text-green-400">~/tools</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white">
          Free NGINX &amp; PostgreSQL security tools
        </h1>
        <p className="font-sans text-zinc-400 max-w-2xl leading-relaxed">
          Paste a config, get a list of problems and the exact lines to fix them.
          Each finding explains why it matters, so you can decide what applies to your setup.
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-zinc-400">
          {['Runs in your browser', 'Nothing is uploaded', 'No sign-up'].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-green-400">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </header>

      {/* Browser tools */}
      <section aria-labelledby="web-tools" className="space-y-6">
        <h2 id="web-tools" className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Browser tools
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {WEB_TOOLS.map((tool) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all hover:border-green-500/40 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400"
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-green-800/50 bg-green-900/20 font-mono text-xs font-semibold text-green-400"
                >
                  {tool.glyph}
                </span>
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold text-white group-hover:text-green-400 transition-colors">
                    {tool.title}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400 leading-snug">{tool.tagline}</p>
                </div>
              </div>

              <ul className="mt-5 space-y-1.5 flex-1">
                {tool.checks.map((check) => (
                  <li key={check} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-green-500/70 font-mono text-xs mt-0.5">▸</span>
                    {check}
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-zinc-800 pt-4">
                <div className="space-y-1 font-mono text-[11px] text-zinc-500">
                  <p>
                    <span className="text-zinc-600">input:</span> {tool.input}
                  </p>
                  {tool.note && <p>{tool.note}</p>}
                </div>
                <span className="inline-flex items-center gap-1 rounded-lg bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 group-hover:bg-green-300 transition-colors">
                  Open tool →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Study */}
      <section aria-labelledby="study-tools" className="space-y-6">
        <h2 id="study-tools" className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Study
        </h2>
        <Link
          href="/cka"
          className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all hover:border-green-500/40 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-400 sm:flex-row sm:items-center sm:gap-6"
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold text-white group-hover:text-green-400 transition-colors">
              CKA Study Tracker
            </h3>
            <p className="mt-1 text-sm text-zinc-400 leading-snug">
              Track your Certified Kubernetes Administrator prep against the official curriculum, log practice
              attempts, and work through hands-on lab tasks. Progress stays in your browser.
            </p>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1 self-start rounded-lg bg-green-400 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-950 group-hover:bg-green-300 transition-colors sm:self-center">
            Open tracker →
          </span>
        </Link>
      </section>

      {/* CLI tools */}
      <section aria-labelledby="cli-tools" className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cli-tools" className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            Command-line tools
          </h2>
          <a
            href="https://github.com/PhanDat1996"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-zinc-400 hover:text-green-400 transition-colors"
          >
            All repos on GitHub ↗
          </a>
        </div>
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
          {CLI_TOOLS.map((tool) => (
            <li key={tool.name}>
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:gap-6 hover:bg-zinc-900/60 transition-colors"
              >
                <div className="flex items-center gap-3 sm:w-56 sm:flex-shrink-0">
                  <span className="font-mono text-sm font-semibold text-white group-hover:text-green-400 transition-colors">
                    {tool.name}
                  </span>
                  <span className="rounded border border-zinc-700/60 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    {tool.language}
                  </span>
                </div>
                <p className="flex-1 text-sm text-zinc-400 leading-relaxed">{tool.tagline}</p>
                <span className="font-mono text-xs text-zinc-500 group-hover:text-white transition-colors">
                  GitHub ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Related guides */}
      <section aria-labelledby="related" className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 md:p-8">
        <h2 id="related" className="font-display text-lg font-bold text-white">
          Understand the findings
        </h2>
        <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
          The tools tell you what to change. These guides explain why.
        </p>
        <ul className="mt-4 space-y-2">
          {RELATED_GUIDES.map(({ slug, label }) => (
            <li key={slug}>
              <Link
                href={`/blog/${slug}`}
                className="inline-flex items-start gap-2 text-sm text-zinc-300 hover:text-green-400 transition-colors"
              >
                <span className="text-green-500 font-mono">→</span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
