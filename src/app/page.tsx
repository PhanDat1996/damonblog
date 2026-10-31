import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';

export const metadata: Metadata = {
  title: 'Damon: notes on debugging Linux, NGINX and security',
  description:
    'Debugging notes from an L3 support engineer: NGINX errors, Linux performance and CIS hardening, with lab-tested posts and free NGINX/PostgreSQL checkers.',
  alternates: { canonical: '/', types: { 'application/rss+xml': '/feed.xml' } },
};

const TOOLS = [
  { href: '/tools/nginx-config-analyzer', title: 'NGINX Config Analyzer', desc: 'Scores an NGINX config for security, performance and reliability.' },
  { href: '/tools/nginx-cis-hardening-checker', title: 'NGINX Hardening Checker', desc: 'Checks a config against CIS NGINX Benchmark topics.' },
  { href: '/tools/nginx-cve-checker', title: 'NGINX CVE Checker', desc: 'Lists known CVEs for an NGINX version and its modules.' },
  { href: '/tools/pg-hardening-checker', title: 'PostgreSQL Hardening Checker', desc: 'Audits postgresql.conf and pg_hba.conf.' },
  { href: '/cka', title: 'CKA Study Tracker', desc: 'Tracks practice against the official CKA curriculum, with lab tasks.' },
  { href: '/cissp', title: 'CISSP Scenario Training', desc: 'Exam-style scenarios for all 8 domains, explained in English and Vietnamese.' },
];

function shortDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-zinc-500">
      {children}
    </h2>
  );
}

function PostRow({ slug, title, date }: { slug: string; title: string; date: string }) {
  return (
    <li className="flex gap-4 py-1.5">
      <time dateTime={date} className="w-14 flex-shrink-0 font-mono text-xs leading-6 text-zinc-500">
        {shortDate(date)}
      </time>
      <Link href={`/blog/${slug}`} className="text-zinc-200 hover:text-green-400 transition-colors">
        {title}
      </Link>
    </li>
  );
}

export default function HomePage() {
  const posts = getAllPosts();
  const labPosts = posts.filter((p) => p.lab);

  const byYear = new Map<string, typeof posts>();
  for (const post of posts) {
    const year = post.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), post]);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-16">

      <section className="space-y-4 pt-4">
        <h1 className="font-display text-3xl font-bold text-white">
          Notes from fixing Linux and NGINX in production
        </h1>
        <p className="text-zinc-400 leading-relaxed">
          I&apos;m Damon, an L3 support engineer at OPSWAT in Ho Chi Minh City.
          Before that I ran servers at Vietnix, an Anti-DDoS hosting company.
          This is where I write down how I debugged things: mostly Linux, NGINX
          and security hardening.
        </p>
        <p className="flex gap-4 font-mono text-xs">
          <Link href="/about" className="text-zinc-400 hover:text-green-400 transition-colors">about</Link>
          <a href="https://github.com/PhanDat1996" className="text-zinc-400 hover:text-green-400 transition-colors">github</a>
          <a href="/feed.xml" className="text-zinc-400 hover:text-green-400 transition-colors">rss</a>
        </p>
      </section>

      {labPosts.length > 0 && (
        <section>
          <SectionHeading>Lab notes</SectionHeading>
          <p className="mb-3 text-sm text-zinc-500">
            Reproduced on a test VM (Ubuntu 26.04, NGINX 1.28). The commands and
            output in these posts are from real runs.
          </p>
          <ul>
            {labPosts.map((p) => (
              <PostRow key={p.slug} slug={p.slug} title={p.title} date={p.date} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHeading>Tools</SectionHeading>
        <ul className="space-y-2">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="text-zinc-200 hover:text-green-400 transition-colors">
                {t.title}
              </Link>
              <span className="text-sm text-zinc-500"> · {t.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cv-auto">
        <SectionHeading>All posts</SectionHeading>
        <div className="space-y-8">
          {Array.from(byYear, ([year, yearPosts]) => (
            <div key={year}>
              <h3 className="mb-2 font-mono text-sm text-zinc-400">{year}</h3>
              <ul>
                {yearPosts.map((p) => (
                  <PostRow key={p.slug} slug={p.slug} title={p.title} date={p.date} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
