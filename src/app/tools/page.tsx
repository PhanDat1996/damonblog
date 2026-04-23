import type { Metadata } from 'next';
import { plusJakartaSans } from '@/lib/fonts';
import { clsx } from 'clsx';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Open-source tools and utilities built by Damon for DevOps, security operations, and infrastructure engineering.',
};

const TOOLS: Tool[] = [
  {
    name: 'seo-pro-audit',
    tagline: 'CLI tool to audit website SEO with optional Google PageSpeed integration',
    description: 'Crawls your site from sitemap, checks on-page SEO — title, meta, canonical, OG tags, JSON-LD, missing alt — and optionally pulls Lighthouse scores via PageSpeed Insights API. Outputs scored HTML + JSON reports.',
    tags: ['seo', 'python', 'cli', 'devops'],
    status: 'stable',
    href: 'https://github.com/PhanDat1996/seo-pro-audit',
  },
  {
    name: 'sys-monitor',
    tagline: 'top-like system monitor in pure Bash with log output',
    description: 'Live system stats in the terminal — CPU per-core, RAM, swap, disk per mount, network I/O, and top processes by CPU. No dependencies beyond standard coreutils. Writes every snapshot to a log file. Runs as a systemd service.',
    tags: ['bash', 'linux', 'monitoring', 'sysadmin'],
    status: 'stable',
    href: 'https://github.com/PhanDat1996/sys_monitor',
  },
  {
    name: 'tcp-port-checker',
    tagline: 'Fast threaded TCP port scanner — pure Python, no dependencies',
    description: 'Scan one or more hosts across port lists or ranges. Reports open/closed/timeout with latency, optional banner grabbing, and CSV/JSON export. Built for quick network audits and connectivity checks in production.',
    tags: ['python', 'networking', 'security', 'cli', 'devops'],
    status: 'stable',
    href: 'https://github.com/PhanDat1996/tcp-port-checker',
  },
];

type ToolStatus = 'stable' | 'beta' | 'wip';

interface Tool {
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  status: ToolStatus;
  href?: string;
  docs?: string;
}

const STATUS_STYLES: Record<ToolStatus, string> = {
  stable: 'bg-green-900/40 text-green-400 border-green-800/60',
  beta:   'bg-yellow-900/40 text-yellow-400 border-yellow-800/60',
  wip:    'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
};

const STATUS_LABEL: Record<ToolStatus, string> = {
  stable: 'Stable',
  beta:   'Beta',
  wip:    'In Progress',
};

export default function ToolsPage() {
  return (
    <div className={clsx("space-y-16", plusJakartaSans.variable)}>

      {/* Header */}
      <div className="space-y-4 border-b border-zinc-800 pb-10">
        <div className="font-mono text-xs text-green-400">~/tools</div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">
          Tools
        </h1>
        <p className="font-sans text-zinc-400 max-w-xl leading-relaxed">
          Utilities I&apos;ve built to solve real problems in security operations,
          infrastructure debugging, and DevOps workflows. Open-source and built
          from production experience.
        </p>
      </div>

      {/* Tools grid or empty state */}
      {TOOLS.length > 0 ? (
        <section>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 hover:border-zinc-700 transition-all"
              >
                {/* Name + status */}
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-mono text-base font-semibold text-white">
                    {tool.name}
                  </h2>
                  <span className={`flex-shrink-0 inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${STATUS_STYLES[tool.status]}`}>
                    {STATUS_LABEL[tool.status]}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-sm font-medium text-zinc-300 leading-snug">
                  {tool.tagline}
                </p>

                {/* Description */}
                <p className="text-sm text-zinc-400 leading-relaxed flex-1">
                  {tool.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {tool.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded border border-zinc-700/60 bg-zinc-800/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Links */}
                <div className="flex items-center gap-3 pt-1">
                  {tool.docs && (
                    <Link
                      href={tool.docs}
                      className="font-mono text-xs text-green-400 hover:underline"
                    >
                      Docs →
                    </Link>
                  )}
                  {tool.href && (
                    <a
                      href={tool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      GitHub ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        /* Empty state */
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/20 px-8 py-20 text-center">
          <div className="font-mono text-4xl text-zinc-700 mb-4">[ ]</div>
          <p className="font-mono text-sm text-zinc-500 mb-2">
            No tools yet — building in progress.
          </p>
          <p className="text-xs text-zinc-600 max-w-sm mx-auto leading-relaxed">
            Tools will appear here as they are completed. Check back soon, or
            follow along on GitHub.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
            >
              GitHub ↗
            </a>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 font-mono text-xs text-green-400 hover:underline"
            >
              Read the blog →
            </Link>
          </div>
        </section>
      )}

      {/* What's coming */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-8">
        <h2 className="font-display text-lg font-bold text-white mb-3">
          What&apos;s Coming
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">
          Tools are built to solve real problems I run into — not as side projects
          for the sake of it. When something takes too long to do manually, I build
          a tool for it.
        </p>
        <p className="text-sm text-zinc-500 font-mono">
          <span className="text-green-400">$</span> stay tuned.
        </p>
      </section>

    </div>
  );
}
