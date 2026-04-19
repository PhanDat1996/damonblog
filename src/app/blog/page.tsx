import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import TagBadge from '@/components/TagBadge';
import TerminalHero from '@/components/TerminalHero';

export const metadata: Metadata = {
  title: 'Damon — DevOps, NGINX & Linux Troubleshooting',
  description:
    'In-depth guides on NGINX 502 debugging, Linux TIME_WAIT exhaustion, Docker infrastructure, and production incident response. Written by a senior DevOps engineer from real-world systems.',
};

const FEATURED_ARTICLES = [
  {
    slug: 'nginx-502-under-load',
    title: 'NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes',
    description:
      'Why NGINX returns 502 Bad Gateway only at high traffic — ephemeral port exhaustion, missing upstream keepalive, and proxy timeout misconfiguration. Includes step-by-step diagnosis commands and production-ready config fixes.',
  },
  {
    slug: 'nginx-upstream-keepalive',
    title: 'NGINX Upstream Keepalive Explained: Why Missing It Causes 502 Errors',
    description:
      'Deep dive into TCP connection reuse in NGINX reverse proxying — HTTP/1.0 vs 1.1, TIME_WAIT buildup at scale, and the exact keepalive configuration that eliminates connection refused errors under load.',
  },
  {
    slug: 'linux-time-wait-explained',
    title: 'Linux TIME_WAIT: The Hidden Cause of ECONNREFUSED and Port Exhaustion',
    description:
      'How Linux TIME_WAIT exhausts ephemeral ports and causes connection failures even when your application is healthy. Covers detection with ss and netstat, sysctl tuning, and why tcp_tw_recycle will break your server.',
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

const SKILLS = [
  { text: 'NGINX reverse proxy debugging — 502 errors, upstream timeouts, keepalive misconfiguration' },
  { text: 'Linux networking — TCP states, socket exhaustion, TIME_WAIT, sysctl tuning' },
  { text: 'Production incident response — log triage, root cause analysis, postmortems' },
  { text: 'Docker infrastructure — container networking, log rotation, resource limits' },
  { text: 'Security operations — SSL/TLS hardening, firewall rules, access log analysis' },
];

export default function HomePage() {
  const recentPosts = getAllPosts().slice(0, 5);

  return (
    <div className="space-y-24">

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-12 items-start pt-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2 font-mono text-xs text-green-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span>Senior DevOps &amp; Infrastructure Engineer</span>
          </div>

          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight tracking-tight text-white">
            DevOps, NGINX &amp; Linux{' '}
            <span className="text-green-400">Troubleshooting</span>{' '}
            in Production
          </h1>

          <p className="text-zinc-400 text-lg leading-relaxed">
            Practical write-ups on real production issues — NGINX 502 bad gateway
            errors, Linux connection refused failures, Docker infrastructure
            debugging, and security operations. Every post is a real incident,
            fully documented.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-all hover:bg-green-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]"
            >
              Browse all articles →
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
            >
              About me
            </Link>
          </div>
        </div>

        <div>
          <TerminalHero />
        </div>
      </section>

      {/* ── What You'll Find Here + About ───────────────────────── */}
      <section className="grid md:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">
            What This Blog Covers
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Written for engineers who are mid-incident, not mid-tutorial. Every
            post documents a real problem with the exact commands, configs, and
            reasoning behind the fix.
          </p>
          <ul className="space-y-3">
            {SKILLS.map(({ text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-green-500 font-mono flex-shrink-0">▸</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          {/* Keyword reinforcement paragraph */}
          <p className="mt-6 text-xs text-zinc-500 leading-relaxed border-l-2 border-zinc-800 pl-4">
            Common topics include diagnosing <strong className="text-zinc-400">nginx 502 errors</strong> and{' '}
            <strong className="text-zinc-400">connection refused</strong> failures caused by{' '}
            <strong className="text-zinc-400">TIME_WAIT</strong> socket exhaustion,
            tuning Linux kernel parameters for high-traffic systems, and{' '}
            <strong className="text-zinc-400">infrastructure debugging</strong> under
            production load.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">About Damon</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Senior DevOps and infrastructure engineer with a background in
            technical support on real-world production systems. That support
            background means I understand how things fail under load — not just
            how they look on architecture diagrams.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            I&apos;ve diagnosed NGINX upstream failures, traced Linux networking
            issues to kernel socket limits, and responded to security incidents
            across high-traffic infrastructure. This blog is where I document
            what actually worked.
          </p>
          <Link
            href="/about"
            className="inline-flex font-mono text-xs text-green-400 hover:underline"
          >
            Full background and experience →
          </Link>
        </div>
      </section>

      {/* ── Featured Articles ────────────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Featured Articles
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              In-depth guides on NGINX troubleshooting, Linux networking, and production debugging
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
              <span className="font-mono text-xs text-zinc-600 group-hover:text-green-400 transition-colors">
                Read article →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Topics ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Browse by Topic
            </h2>
            <p className="text-zinc-500 text-xs mt-0.5 font-mono">
              nginx troubleshooting · linux debugging · infrastructure · security operations
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            view all topics →
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

      {/* ── Latest Articles ──────────────────────────────────────── */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Latest Articles
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              Most recent posts on DevOps, Linux, NGINX, and production debugging
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
                <span className="font-mono text-xs text-zinc-600 group-hover:text-green-400 transition-colors whitespace-nowrap">
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
            View all DevOps &amp; Linux articles →
          </Link>
        </div>
      </section>

      {/*
        Suggested future sections:
        1. Newsletter — "Get notified when a new incident write-up drops. No spam."
        2. Site search — full-text search across posts (pagefind or fuse.js, both work with static Next.js)
      */}

    </div>
  );
}