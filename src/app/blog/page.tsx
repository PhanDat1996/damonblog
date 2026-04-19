import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import TagBadge from '@/components/TagBadge';
import TerminalHero from '@/components/TerminalHero';

export const metadata: Metadata = {
  title: 'Damon — DevOps, NGINX & Linux Troubleshooting',
  description:
    'Field notes from a senior DevOps and infrastructure engineer. Deep dives on NGINX debugging, Linux networking, 502 Bad Gateway, TIME_WAIT, Docker, and production incident response.',
};

const FEATURED_ARTICLES = [
  {
    slug: 'nginx-502-under-load',
    title: 'NGINX 502 Bad Gateway Under Load: Causes, Debugging, and Fixes',
    description:
      'Step-by-step diagnosis of NGINX 502 errors that only appear at high traffic — ephemeral port exhaustion, missing keepalive, timeout misconfiguration.',
  },
  {
    slug: 'nginx-upstream-keepalive',
    title: 'NGINX Upstream Keepalive Explained: Why Missing It Causes 502s',
    description:
      'Deep dive into TCP connection reuse, HTTP/1.0 vs 1.1 in NGINX proxying, TIME_WAIT buildup, and the production-ready keepalive config.',
  },
  {
    slug: 'linux-time-wait-explained',
    title: 'Linux TIME_WAIT Explained: The Hidden Cause of Connection Failures',
    description:
      'What TIME_WAIT is at the kernel level, when it exhausts ephemeral ports, how to detect it with ss and netstat, and the sysctl fixes that work.',
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
  { icon: '▸', text: 'NGINX reverse proxy debugging and performance tuning' },
  { icon: '▸', text: 'Linux networking — TCP states, socket exhaustion, sysctl' },
  { icon: '▸', text: 'Production incident response and root cause analysis' },
  { icon: '▸', text: 'Docker infrastructure, log management, container networking' },
  { icon: '▸', text: 'Security operations — SSL hardening, firewall rules, log correlation' },
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
            NGINX, Linux &amp;{' '}
            <span className="text-green-400">Infrastructure</span>{' '}
            Troubleshooting
          </h1>

          <p className="text-zinc-400 text-lg leading-relaxed">
            Real-world write-ups on production debugging — 502 errors, TCP
            connection failures, Docker log floods, Linux networking, and
            security operations. No theory. No fluff.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-all hover:bg-green-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.25)]"
            >
              Read the blog →
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

      {/* ── What You'll Find Here ────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">
            What This Blog Covers
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            Written for engineers who are mid-incident, not mid-tutorial. Every
            post documents a real problem — the symptoms, the debugging process,
            and the fix.
          </p>
          <ul className="space-y-3">
            {SKILLS.map(({ icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-green-500 font-mono flex-shrink-0">{icon}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">About</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            I&apos;m Damon — a senior DevOps and infrastructure engineer with a
            background in technical support. That support background means I
            understand how things break in production, not just how they look on
            architecture diagrams.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            This blog is my public notebook. When I solve something hard — a
            502 that only fires under load, a Docker container bleeding memory,
            an NGINX config that worked on staging — I write it up.
          </p>
          <Link
            href="/about"
            className="inline-flex font-mono text-xs text-green-400 hover:underline"
          >
            More about me →
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
              Deep dives on NGINX troubleshooting, Linux networking, and production debugging
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors hidden sm:block"
          >
            all posts →
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
                Read more →
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
              nginx troubleshooting · linux debugging · infrastructure · security
            </p>
          </div>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            all topics →
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
          <h2 className="font-display text-2xl font-bold text-white">
            Latest Posts
          </h2>
          <Link
            href="/blog"
            className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            all posts →
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
                <div className="flex gap-1.5 hidden sm:flex">
                  {post.tags.slice(0, 2).map((tag) => (
                    <TagBadge key={tag} tag={tag} linked={false} size="sm" />
                  ))}
                </div>
                <span className="font-mono text-xs text-zinc-600 group-hover:text-green-400 transition-colors">
                  {post.readingTime}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-6 py-2.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
          >
            View all posts →
          </Link>
        </div>
      </section>

      {/*
        Future sections to consider:
        1. Newsletter signup — "Get notified when a new incident write-up drops"
        2. Search bar — full-text search across all posts (use pagefind or fuse.js)
      */}

    </div>
  );
}