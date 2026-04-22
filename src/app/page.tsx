import type { Metadata } from 'next';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { getAllPosts } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import TagBadge from '@/components/TagBadge';

// Dynamic import: TerminalHero is a 'use client' component with animation JS.
// Loading it lazily means its JS bundle is NOT included in the initial page
// parse — removes it from the critical path entirely.
// ssr:false because it uses IntersectionObserver and window — server can't render it.
// The placeholder div reserves space so there's zero CLS when it hydrates.
const TerminalHero = dynamic(() => import('@/components/TerminalHero'), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
      style={{ minHeight: '220px' }}
      aria-hidden="true"
    />
  ),
});

// SEO Fix: keyword-optimized title + meta description
export const metadata: Metadata = {
  title: 'Linux Troubleshooting & Performance Tuning — Damon',
  description:
    'Real-world Linux troubleshooting guides from a Senior L3 engineer — debug high CPU, memory leaks, NGINX 502s, and production incidents. No theory, no fluff.',
};

const FEATURED_ARTICLES = [
  {
    slug: 'linux-performance-troubleshooting-guide',
    title: 'Linux Performance Troubleshooting: Complete Engineer\'s Guide',
    description:
      'CPU, memory, I/O, process states — the full diagnostic workflow with real commands and decision trees. Start here when a server is slow and you don\'t know why.',
  },
  {
    slug: 'nginx-502-under-load',
    title: 'NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes',
    description:
      'The most common NGINX failure pattern in production. Covers port exhaustion, missing keepalive, and proxy timeouts — with the exact config that fixes each one.',
  },
  {
    slug: 'linux-security-hardening-guide',
    title: 'Linux Security Hardening: CIS Benchmarks for Production',
    description:
      'CIS Level 1 hardening for Ubuntu, RHEL, and Windows Server. What each control does, what breaks in production, and how to apply it safely.',
  },
];

const TOPIC_CLUSTERS = [
  {
    heading: 'Linux Commands',
    description: 'ps, top, htop, strace, ss — the tools you reach for first',
    links: [
      { label: 'ps command linux', slug: 'ps-command-linux-troubleshooting-guide' },
      { label: 'top command linux', slug: 'top-command-linux-guide' },
      { label: 'htop vs top', slug: 'htop-vs-top-linux-comparison' },
      { label: 'check open ports', slug: 'check-open-ports-linux-ss-netstat' },
    ],
  },
  {
    heading: 'Troubleshooting',
    description: 'High CPU, memory leaks, zombie processes, 502 errors',
    links: [
      { label: 'linux high cpu usage', slug: 'linux-high-cpu-usage-troubleshooting' },
      { label: 'memory leak linux', slug: 'linux-memory-leak-troubleshooting-rss-vsz' },
      { label: 'linux process states', slug: 'linux-process-states-guide' },
      { label: 'nginx 502 bad gateway', slug: 'nginx-502-under-load' },
    ],
  },
  {
    heading: 'Monitoring & Debugging',
    description: 'strace, lsof, auditd, log analysis',
    links: [
      { label: 'strace tutorial', slug: 'strace-tutorial-linux-debugging' },
      { label: 'linux debugging tools', slug: 'linux-debugging-tools-guide' },
      { label: 'linux log analysis', slug: 'linux-log-analysis-debugging-guide' },
      { label: 'strace lsof ss', slug: 'strace-lsof-ss-debugging' },
    ],
  },
  {
    heading: 'Security & Infrastructure',
    description: 'CIS hardening, firewall, Docker, NGINX config',
    links: [
      { label: 'CIS ubuntu hardening', slug: 'cis-level1-ubuntu-hardening' },
      { label: 'CIS RHEL hardening', slug: 'cis-rhel-level1-hardening' },
      { label: 'nginx ssl hardening', slug: 'nginx-ssl-hardening' },
      { label: 'docker log rotation', slug: 'docker-log-rotation' },
    ],
  },
];

const TOPICS = [
  { label: 'NGINX', tag: 'nginx' },
  { label: 'Linux', tag: 'linux' },
  { label: 'Docker', tag: 'docker' },
  { label: 'Networking', tag: 'networking' },
  { label: 'Debugging', tag: 'debugging' },
  { label: 'Security', tag: 'security' },
  { label: 'Logs', tag: 'logs' },
  { label: 'Monitoring', tag: 'monitoring' },
  { label: 'SSL/TLS', tag: 'ssl' },
  { label: 'Firewall', tag: 'firewall' },
];

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 5);

  return (
    <div className="space-y-24">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-12 items-start pt-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2 font-mono text-xs text-green-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span>Senior L3 Infrastructure &amp; Security Engineer</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight tracking-tight text-white">
            Linux{' '}
            <span className="text-green-400">Troubleshooting</span>{' '}
            &amp; Performance — From Production
          </h1>

          <p className="text-zinc-400 text-lg leading-relaxed">
            If you&apos;ve ever stared at a server with 100% CPU, a 502 waterfall, or a
            hung process that won&apos;t die — this blog is for you. Real incidents, real
            commands, real fixes. No padding.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-all hover:bg-green-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]"
            >
              Read the guides →
            </Link>
            <Link
              href="/blog/linux-performance-troubleshooting-guide"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
            >
              Start troubleshooting
            </Link>
          </div>
        </div>

        <div>
          <TerminalHero />
        </div>
      </section>

      {/* ── E-E-A-T: About + What You'll Find ──────────────────── */}
      <section className="grid md:grid-cols-2 gap-10 items-start">

        {/* Author authority block */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <p className="font-mono text-xs text-zinc-400 uppercase tracking-widest">About Damon</p>
          <p className="text-sm font-semibold text-white">Senior Technical Support Engineer · L3</p>
          <p className="font-mono text-xs text-green-400">OPSWAT · Ho Chi Minh City</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            7+ years working on Linux systems in production — from running server fleets
            at an Anti-DDoS company to L3 support for enterprise deployments at OPSWAT,
            where the bugs are always someone else&apos;s OS-level problem.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Most of what I write comes from incidents that took too long to diagnose the
            first time. The goal is to make it faster for you.
          </p>
          <Link
            href="/about"
            className="inline-flex font-mono text-xs text-green-400 hover:underline"
          >
            Full background →
          </Link>
        </div>

        {/* What the blog covers */}
        <div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">
            What This Blog Covers
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Written for engineers who are mid-incident, not mid-tutorial. Every
            post has the exact commands and the reasoning behind each one —
            not just the fix, but why it works.
          </p>
          <ul className="space-y-3">
            {[
              'Linux performance troubleshooting — CPU, memory, load average, I/O wait',
              'Process debugging — ps, top, strace, lsof, process states (D, Z, R)',
              'NGINX production issues — 502 errors, upstream keepalive, SSL hardening',
              'Security hardening — CIS benchmarks for Ubuntu, RHEL, Windows Server',
              'Incident response — log analysis, root cause, postmortem workflows',
            ].map((text) => (
              <li key={text} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-green-500 font-mono flex-shrink-0">▸</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-zinc-500 leading-relaxed border-l-2 border-zinc-800 pl-4">
            Common searches that land here:{' '}
            <strong className="text-zinc-400">linux high cpu usage</strong>,{' '}
            <strong className="text-zinc-400">debug linux server</strong>,{' '}
            <strong className="text-zinc-400">load average explained</strong>,{' '}
            <strong className="text-zinc-400">nginx 502 under load</strong>,{' '}
            <strong className="text-zinc-400">linux process monitoring</strong>.
          </p>
        </div>
      </section>

      {/* ── Featured Articles ─────────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Start Here
            </h2>
            <p className="text-zinc-400 text-sm mt-1">
              The three guides most engineers need first
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors hidden sm:block"
          >
            all articles →
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {FEATURED_ARTICLES.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-green-500/30 hover:bg-zinc-900 transition-all duration-200"
            >
              <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-green-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                Featured
              </div>
              <h3 className="text-sm font-bold text-white leading-snug group-hover:text-green-400 transition-colors">
                {article.title}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed flex-1">
                {article.description}
              </p>
              <span className="font-mono text-xs text-zinc-400 group-hover:text-green-400 transition-colors">
                Read article →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Topic Clusters ────────────────────────────────────── */}
      <section className="cv-auto">
        <div className="mb-6">
          <h2 className="font-display text-2xl font-bold text-white">
            Browse by Topic
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Grouped by what you are actually trying to do
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOPIC_CLUSTERS.map((cluster) => (
            <div
              key={cluster.heading}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-3"
            >
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  {cluster.heading}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">{cluster.description}</p>
              </div>
              <ul className="space-y-1.5">
                {cluster.links.map(({ label, slug }) => (
                  <li key={slug}>
                    <Link
                      href={`/blog/${slug}`}
                      className="font-mono text-xs text-zinc-400 hover:text-green-400 transition-colors"
                    >
                      → {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tag cloud ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 cv-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              All Topics
            </h2>
            <p className="text-zinc-500 text-xs mt-0.5 font-mono">
              linux troubleshooting · nginx debugging · security hardening · infrastructure
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            view all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map(({ label, tag }) => (
            <Link
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className="inline-flex items-center rounded border border-zinc-700/60 bg-zinc-800/60 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:border-green-500/40 hover:text-green-400 transition-all"
            >
              #{label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Latest Articles ──────────────────────────────────── */}
      <section className="cv-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Latest Articles
            </h2>
            <p className="text-zinc-400 text-sm mt-1">
              Most recent Linux and DevOps troubleshooting guides
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            all articles →
          </Link>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {recentPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 hover:bg-zinc-900/30 px-3 -mx-3 rounded-lg transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-white group-hover:text-green-400 transition-colors truncate">
                  {post.title}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{post.excerpt}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="gap-1.5 hidden sm:flex">
                  {post.tags.slice(0, 2).map((tag) => (
                    <TagBadge key={tag} tag={tag} linked={false} size="sm" />
                  ))}
                </div>
                <span className="font-mono text-xs text-zinc-400 group-hover:text-green-400 transition-colors whitespace-nowrap">
                  {post.readingTime}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-6 py-2.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
          >
            All Linux &amp; DevOps articles →
          </Link>
        </div>
      </section>

      {/* ── Resources / Soft monetization ─────────────────────── */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-8 cv-auto">
        <h2 className="font-display text-lg font-bold text-white mb-1">
          Tools &amp; Resources
        </h2>
        <p className="text-sm text-zinc-400 mb-6 max-w-xl">
          Beyond the blog — scripts, CLI tools, and guides built from the same
          production experience. If you find yourself doing the same thing manually
          three times, it becomes a tool.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              label: 'CLI Tools',
              desc: 'sys-monitor and seo-pro-audit — open-source utilities from this blog',
              href: '/tools',
              cta: 'Browse tools →',
            },
            {
              label: 'Troubleshooting Guides',
              desc: 'Deep-dive walkthroughs for the incidents that take the longest to debug',
              href: '/blog/linux-performance-troubleshooting-guide',
              cta: 'Start with Linux →',
            },
            {
              label: 'Security Hardening',
              desc: 'CIS benchmark implementation guides for Ubuntu, RHEL, and Windows Server',
              href: '/blog/linux-security-hardening-guide',
              cta: 'Read the guide →',
            },
          ].map(({ label, desc, href, cta }) => (
            <div key={label} className="space-y-2">
              <p className="font-mono text-xs text-green-400 uppercase tracking-widest">{label}</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
              <Link
                href={href}
                className="inline-flex font-mono text-xs text-zinc-400 hover:text-green-400 transition-colors"
              >
                {cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
