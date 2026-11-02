import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { CATEGORIES } from '@/lib/categories';
import PostCard from '@/components/PostCard';
import type { Category } from '@/types/post';
import { jetbrainsMono } from '@/lib/fonts';

export const metadata: Metadata = {
  title: 'Damon: notes on debugging Linux, NGINX and security',
  description:
    'Debugging notes from an L3 support engineer: NGINX errors, Linux performance and CIS hardening, with lab-tested posts and free NGINX/PostgreSQL checkers.',
  alternates: { canonical: '/', types: { 'application/rss+xml': '/feed.xml' } },
};

const TOOLS = [
  { href: '/tools/nginx-config-analyzer', title: 'NGINX Config Analyzer', desc: 'Scores an NGINX config for security, performance and reliability.', cmd: 'nginx -T' },
  { href: '/tools/nginx-cis-hardening-checker', title: 'NGINX Hardening Checker', desc: 'Checks a config against CIS NGINX Benchmark topics.', cmd: 'cis' },
  { href: '/tools/nginx-cve-checker', title: 'NGINX CVE Checker', desc: 'Lists known CVEs for an NGINX version and its modules.', cmd: 'cve' },
  { href: '/tools/pg-hardening-checker', title: 'PostgreSQL Hardening Checker', desc: 'Audits postgresql.conf and pg_hba.conf.', cmd: 'psql' },
  { href: '/cka', title: 'CKA Study Tracker', desc: 'Tracks practice against the official CKA curriculum, with lab tasks.', cmd: 'kubectl' },
  { href: '/cissp', title: 'CISSP Scenario Training', desc: 'Exam-style scenarios for all 8 domains, explained in English and Vietnamese.', cmd: 'cissp' },
];

// Static class strings so Tailwind keeps them
const CATEGORY_ACCENT: Record<Category, string> = {
  nginx: 'group-hover:border-green-500/40 group-hover:shadow-[0_0_30px_rgba(74,222,128,0.07)]',
  linux: 'group-hover:border-yellow-500/40 group-hover:shadow-[0_0_30px_rgba(234,179,8,0.07)]',
  security: 'group-hover:border-red-500/40 group-hover:shadow-[0_0_30px_rgba(248,113,113,0.07)]',
  devops: 'group-hover:border-blue-500/40 group-hover:shadow-[0_0_30px_rgba(96,165,250,0.07)]',
  tooling: 'group-hover:border-purple-500/40 group-hover:shadow-[0_0_30px_rgba(192,132,252,0.07)]',
};

function shortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SectionHeading({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="font-display text-2xl font-bold text-white">
        <span className="mr-2 font-mono text-base text-green-400">#</span>
        {children}
      </h2>
      {href && (
        <Link href={href} className="font-mono text-xs text-zinc-400 hover:text-green-400 transition-colors">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function PostRow({ slug, title, date, lab }: { slug: string; title: string; date: string; lab?: boolean }) {
  return (
    <li className="group flex gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-zinc-900/60">
      <time dateTime={date} className="w-14 flex-shrink-0 font-mono text-xs leading-6 text-zinc-500">
        {shortDate(date)}
      </time>
      <Link href={`/blog/${slug}`} className="text-zinc-200 group-hover:text-green-400 transition-colors">
        {title}
        {lab && (
          <span className="ml-2 rounded border border-green-800/60 bg-green-900/30 px-1.5 py-0.5 align-middle font-mono text-[10px] text-green-400">
            lab
          </span>
        )}
      </Link>
    </li>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold text-white">{value}</p>
      <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

export default function HomePage() {
  const posts = getAllPosts();
  const labPosts = posts.filter((p) => p.lab);
  const featured = posts.filter((p) => p.featured).slice(0, 3);
  const latest = posts.slice(0, 5);

  const categoryCounts = (Object.keys(CATEGORIES) as Category[])
    .map((c) => ({ ...CATEGORIES[c], count: posts.filter((p) => p.category === c).length }))
    .filter((c) => c.count > 0);

  const byYear = new Map<string, typeof posts>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), post]);
  }

  return (
    <div className={`space-y-24 ${jetbrainsMono.variable}`}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-4">
        {/* Grid backdrop with a soft green glow, purely decorative */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-6 -top-12 bottom-0 -z-10 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(63,63,70,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(63,63,70,0.25) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 30% 30%, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 30% 30%, black 30%, transparent 75%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-0 -z-10 h-72 w-72 rounded-full bg-green-500/10 blur-3xl"
        />

        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-xs text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              L3 support engineer · Ho Chi Minh City
            </p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Notes from fixing Linux and NGINX{' '}
              <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                in production
              </span>
            </h1>
            <p className="max-w-xl font-sans text-lg leading-relaxed text-zinc-400">
              I&apos;m Damon, an L3 support engineer at OPSWAT. Before that I ran servers at
              Vietnix, an Anti-DDoS hosting company. This is where I write down how I debugged
              things: mostly Linux, NGINX and security hardening.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/blog"
                className="rounded-lg bg-green-500 px-5 py-2.5 font-mono text-sm font-medium text-zinc-950 transition-colors hover:bg-green-400"
              >
                Read the blog →
              </Link>
              <Link
                href="/tools"
                className="rounded-lg border border-zinc-700 px-5 py-2.5 font-mono text-sm text-zinc-200 transition-colors hover:border-green-500/50 hover:text-green-400"
              >
                Try the tools
              </Link>
              <span className="flex gap-4 pl-2 font-mono text-xs">
                <Link href="/about" className="text-zinc-400 hover:text-green-400 transition-colors">about</Link>
                <a href="https://github.com/PhanDat1996" className="text-zinc-400 hover:text-green-400 transition-colors">github</a>
                <a href="/feed.xml" className="text-zinc-400 hover:text-green-400 transition-colors">rss</a>
              </span>
            </div>
            <div className="flex gap-10 border-t border-zinc-800/80 pt-6">
              <Stat value={posts.length} label="posts" />
              <Stat value={labPosts.length} label="lab-tested" />
              <Stat value={TOOLS.length} label="free tools" />
            </div>
          </div>

          {/* Terminal card listing the latest posts */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 shadow-2xl shadow-black/40 backdrop-blur">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-red-500/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <span className="h-3 w-3 rounded-full bg-green-500/70" />
              <span className="ml-3 font-mono text-xs text-zinc-500">damon@lab: ~/notes</span>
            </div>
            <div className="scanlines space-y-3 p-5 font-mono text-[13px] leading-relaxed">
              <p className="text-zinc-400">
                <span className="text-green-400">$</span> ls -t ~/notes | head -5
              </p>
              <ul className="space-y-2">
                {latest.map((p) => (
                  <li key={p.slug} className="flex gap-3">
                    <span className="flex-shrink-0 text-zinc-600">{shortDate(p.date)}</span>
                    <Link href={`/blog/${p.slug}`} className="text-zinc-200 hover:text-green-400 transition-colors line-clamp-1">
                      {p.slug}.md
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-zinc-400">
                <span className="text-green-400">$</span>{' '}
                <span className="inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-green-400" />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Start here ───────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section>
          <SectionHeading href="/blog" linkLabel="all posts">Start here</SectionHeading>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:row-span-2 [&>a]:h-full">
              <PostCard post={featured[0]} featured />
            </div>
            {featured.slice(1).map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* ── Topics ───────────────────────────────────────────────────── */}
      <section>
        <SectionHeading>Topics</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categoryCounts.map((c) => (
            <Link key={c.slug} href={`/blog/${c.slug}`} className="group">
              <div className={`flex h-full flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition-all duration-200 ${CATEGORY_ACCENT[c.slug]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-2xl" aria-hidden="true">{c.icon}</span>
                  <span className="font-mono text-xs text-zinc-500">{c.count} posts</span>
                </div>
                <h3 className="font-display text-lg font-bold text-white">{c.label}</h3>
                <p className="font-sans text-sm leading-relaxed text-zinc-400 line-clamp-3">{c.intro[0]}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Tools ────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading href="/tools" linkLabel="all tools">Free tools</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 transition-all duration-200 hover:border-green-500/40 hover:bg-zinc-900/70"
            >
              <span className="w-fit rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-green-400">
                $ {t.cmd}
              </span>
              <h3 className="font-display text-base font-bold text-white group-hover:text-green-400 transition-colors">
                {t.title}
              </h3>
              <p className="font-sans text-sm leading-relaxed text-zinc-400">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Lab notes ────────────────────────────────────────────────── */}
      {labPosts.length > 0 && (
        <section className="rounded-2xl border border-green-900/40 bg-gradient-to-b from-green-950/20 to-transparent p-6 sm:p-8">
          <SectionHeading>Lab notes</SectionHeading>
          <p className="-mt-3 mb-5 max-w-2xl text-sm text-zinc-400">
            Reproduced on a test VM (Ubuntu 26.04, NGINX 1.28). The commands and
            output in these posts are from real runs.
          </p>
          <ul className="grid gap-x-8 md:grid-cols-2">
            {labPosts.map((p) => (
              <PostRow key={p.slug} slug={p.slug} title={p.title} date={p.date} />
            ))}
          </ul>
        </section>
      )}

      {/* ── Archive ──────────────────────────────────────────────────── */}
      <section className="cv-auto">
        <SectionHeading>All posts</SectionHeading>
        <div className="space-y-10">
          {Array.from(byYear, ([year, yearPosts]) => (
            <div key={year} className="grid gap-4 md:grid-cols-[6rem_1fr]">
              <h3 className="font-mono text-sm text-zinc-500 md:pt-1.5">
                {year} <span className="text-zinc-700">({yearPosts.length})</span>
              </h3>
              <ul>
                {yearPosts.map((p) => (
                  <PostRow key={p.slug} slug={p.slug} title={p.title} date={p.date} lab={p.lab} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
