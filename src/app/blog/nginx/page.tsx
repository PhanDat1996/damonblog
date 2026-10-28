import type { Metadata } from 'next';
import Link from 'next/link';
import { getPostsByCategory } from '@/lib/posts';
import { CATEGORIES } from '@/lib/categories';
import PostCard from '@/components/PostCard';

const BASE_URL = 'https://www.damonsec.com';

export const metadata: Metadata = {
  title: 'NGINX Configuration & Troubleshooting Guides',
  description:
    'NGINX troubleshooting notes: 502, 504 and 413 errors reproduced on a lab VM, upstream keepalive, rate limiting and TLS hardening.',
  alternates: { canonical: `${BASE_URL}/blog/nginx` },
  openGraph: {
    title: 'NGINX Configuration & Troubleshooting Guides — damonsec.com',
    description:
      'NGINX troubleshooting notes: 502, 504 and 413 errors reproduced on a lab VM, upstream keepalive, rate limiting and TLS hardening.',
    url: `${BASE_URL}/blog/nginx`,
    type: 'website',
    siteName: 'damonsec.com',
  },
  twitter: {
    card: 'summary',
    title: 'NGINX Configuration & Troubleshooting Guides — damonsec.com',
    description:
      'NGINX troubleshooting notes: 502, 504 and 413 errors reproduced on a lab VM, upstream keepalive, rate limiting and TLS hardening.',
  },
};

const RECOMMENDED = [
  { text: 'Fix NGINX 502 Bad Gateway errors in production',           href: '/blog/nginx-502-bad-gateway-fix-linux' },
  { text: 'Diagnose NGINX 502 errors that only appear under load',    href: '/blog/nginx-502-under-load' },
  { text: 'Configure upstream keepalive to prevent connection drops',  href: '/blog/nginx-upstream-keepalive' },
  { text: 'Set up NGINX rate limiting for API and login endpoints',   href: '/blog/nginx-rate-limiting-config' },
  { text: 'NGINX troubleshooting reference for production incidents',  href: '/blog/nginx-troubleshooting-guide' },
];

const CORE_CONCEPTS = [
  'Worker processes and the event-driven connection model',
  'How NGINX handles upstream connections vs client connections',
  'The request processing phases: rewrite, access, content, log',
  'Upstream blocks — defining backend pools and load balancing',
  'Location matching order: exact, prefix, regex',
  'Connection limits: worker_connections, worker_rlimit_nofile, and OS ulimits',
  'How keep-alive differs between client-side and upstream-side',
];

const PERFORMANCE_TOPICS = [
  'upstream keepalive — connection reuse to prevent ephemeral port exhaustion',
  'proxy_read_timeout / proxy_send_timeout / proxy_connect_timeout — tuning for real backend latency',
  'worker_processes auto and worker_cpu_affinity for multi-core systems',
  'sendfile, tcp_nopush, tcp_nodelay — reducing syscall overhead for static assets',
  'Buffer sizing: proxy_buffers, proxy_buffer_size, proxy_busy_buffers_size',
  'gzip and Brotli compression — when to enable, what to compress',
  'open_file_cache — reducing stat() calls under high request volume',
];

const TROUBLESHOOTING_TOPICS = [
  '502 Bad Gateway — upstream process down, keepalive exhausted, or proxy_pass misconfigured',
  '504 Gateway Timeout — proxy_read_timeout too short for slow upstream responses',
  'Connection reset by peer — upstream closed connection before NGINX finished reading',
  '499 Client Closed Request — client timeout shorter than upstream processing time',
  'upstream timed out (110: Operation timed out) — what the error log is actually telling you',
  'connect() failed (111: Connection refused) — port not listening or firewall drop',
  'no live upstreams while connecting to upstream — all backends failed health checks',
  'SSL handshake errors — certificate chain issues and TLS version mismatches',
];

const OTHER_CATEGORIES = Object.values(CATEGORIES).filter((c) => c.slug !== 'nginx');

export default function NginxCategoryPage() {
  const posts = getPostsByCategory('nginx');

  return (
    <div className="space-y-16">

      {/* Breadcrumb */}
      <nav className="font-mono text-xs text-zinc-500">
        <Link href="/blog" className="hover:text-zinc-300 transition-colors">~/blog</Link>
        <span className="mx-1 text-zinc-700">/</span>
        <span className="text-zinc-400">nginx</span>
      </nav>

      {/* ── Header ── */}
      <header className="space-y-6 border-b border-zinc-800 pb-12">
        <div className="flex items-center gap-2 font-mono text-xs text-green-400">
          <span>⚙️</span>
          <span>~/blog/nginx</span>
        </div>

        <h1 className="font-display text-4xl font-bold tracking-tight text-white leading-tight">
          NGINX Production Guides
        </h1>

        <div className="max-w-2xl space-y-4">
          <p className="font-sans text-zinc-400 leading-relaxed">
            Notes on NGINX problems:{' '}
            <Link href="/blog/nginx-502-bad-gateway-fix-linux" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">502</Link> and{' '}
            <Link href="/blog/nginx-504-gateway-timeout-fix" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">504</Link> errors traced from the
            upstream side, request size limits,{' '}
            <Link href="/blog/nginx-upstream-keepalive" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">keepalive to upstreams</Link>, rate
            limiting and TLS settings.
          </p>
          <p className="font-sans text-zinc-400 leading-relaxed">
            Posts marked as lab-tested were run on an Ubuntu 26.04 VM with NGINX 1.28. The log
            lines and status codes in them are copied from those runs.
          </p>
        </div>

        <p className="font-mono text-xs text-zinc-500">
          {posts.length} article{posts.length !== 1 ? 's' : ''}
        </p>
      </header>

      {/* ── Articles grid ── */}
      {posts.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-mono text-xs text-zinc-500 uppercase tracking-widest">All articles</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* ── Core Concepts ── */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">Core Concepts</h2>
          <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-2xl">
            NGINX uses an asynchronous, event-driven architecture — a single worker process handles thousands of concurrent connections without blocking. Understanding the worker model, connection handling, and how upstreams are managed is the prerequisite for diagnosing anything that goes wrong at scale.
          </p>
        </div>
        <ul className="space-y-2">
          {CORE_CONCEPTS.map((item) => (
            <li key={item} className="flex gap-3 text-sm">
              <span className="text-green-400 font-mono flex-shrink-0 mt-0.5">—</span>
              <span className="text-zinc-400">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Performance Tuning ── */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">Performance Tuning</h2>
          <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-2xl">
            The default nginx configuration is conservative. Under production load — especially in reverse proxy deployments — several defaults become bottlenecks:{' '}
            <Link href="/blog/nginx-upstream-keepalive" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">upstream connection reuse</Link>{' '}
            is disabled by default, buffer sizes assume small responses, and worker limits are often set lower than the system can handle. These are the settings worth tuning.
          </p>
        </div>
        <ul className="space-y-2">
          {PERFORMANCE_TOPICS.map((item) => (
            <li key={item} className="flex gap-3 text-sm">
              <span className="text-green-400 font-mono flex-shrink-0 mt-0.5">—</span>
              <span className="text-zinc-400">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Troubleshooting ── */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-white">Troubleshooting & Debugging</h2>
          <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-2xl">
            NGINX error log messages are specific about what failed but rarely obvious about why. A{' '}
            <Link href="/blog/nginx-502-under-load" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">502 under load</Link>{' '}
            looks identical whether the cause is a crashed upstream process, an exhausted keepalive pool, or a misconfigured proxy_pass. The diagnostic workflow matters as much as knowing the fixes.
          </p>
        </div>
        <ul className="space-y-2">
          {TROUBLESHOOTING_TOPICS.map((item) => (
            <li key={item} className="flex gap-3 text-sm">
              <span className="text-green-400 font-mono flex-shrink-0 mt-0.5">—</span>
              <span className="text-zinc-400">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Recommended Articles ── */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Recommended NGINX Articles</h2>
        <ul className="space-y-3">
          {RECOMMENDED.map(({ text, href }) => (
            <li key={href} className="flex gap-3">
              <span className="text-green-400 font-mono flex-shrink-0 mt-0.5">→</span>
              <Link href={href} className="font-sans text-sm text-zinc-300 hover:text-green-400 transition-colors leading-relaxed">
                {text}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Authority block ── */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-7 space-y-3">
        <h2 className="font-mono text-xs text-zinc-500 uppercase tracking-widest">About these guides</h2>
        <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-2xl">
          Written by <Link href="/about" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">Damon</Link>, an L3 support engineer at OPSWAT, who
          previously tuned NGINX for hosting customers at Vietnix, an Anti-DDoS provider. Lab-tested
          posts such as{' '}
          <Link href="/blog/nginx-502-under-load" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">502 under load</Link> and{' '}
          <Link href="/blog/nginx-504-gateway-timeout-fix" className="text-zinc-300 underline decoration-zinc-700 hover:decoration-green-400 transition-colors">504 gateway timeout</Link> were
          reproduced on a test VM, and the output in them is from those runs.
        </p>
      </section>

      {/* ── Tool CTA ── */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-7 space-y-3">
        <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Tool</div>
        <Link
          href="/tools/nginx-config-analyzer/"
          className="font-display text-lg font-bold text-zinc-100 hover:text-green-400 transition-colors block"
        >
          NGINX Config Analyzer →
        </Link>
        <p className="font-sans text-sm text-zinc-400 leading-relaxed max-w-xl">
          Paste any nginx configuration — server block, reverse proxy config, or full nginx.conf — and get an instant scored report: missing security headers, TLS issues, proxy header gaps, rate limiting coverage, and timeout settings. Runs in-browser. Nothing is sent to a server.
        </p>
      </section>

      {/* ── Cross-category links ── */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-zinc-300">Other topics</h2>
        <div className="flex flex-wrap gap-2">
          {OTHER_CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/blog/${cat.slug}`}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-1.5 rounded-lg hover:border-zinc-500 hover:text-white transition-all"
            >
              {cat.icon} {cat.label}
            </Link>
          ))}
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-1.5 rounded-lg hover:border-zinc-500 hover:text-white transition-all"
          >
            ← All posts
          </Link>
        </div>
      </section>

    </div>
  );
}