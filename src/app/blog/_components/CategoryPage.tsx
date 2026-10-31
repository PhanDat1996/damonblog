import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { CATEGORIES, VALID_CATEGORIES } from '@/lib/categories';
import type { Category } from '@/types/post';
import PostCard from '@/components/PostCard';
import { formatDate } from '@/lib/utils';

export function buildCategoryMetadata(category: Category): Metadata {
  const config = CATEGORIES[category];
  const BASE_URL = 'https://www.damonsec.com';
  // A category with no indexable posts is an empty listing; keep it out of the index
  const hasIndexablePosts = getAllPosts().some((p) => p.category === category && !p.noindex);
  return {
    title: config.metaTitle,
    description: config.metaDescription,
    alternates: { canonical: `${BASE_URL}/blog/${category}` },
    ...(hasIndexablePosts ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: config.metaTitle,
      description: config.metaDescription,
      url: `${BASE_URL}/blog/${category}`,
      type: 'website',
      siteName: 'damonsec.com',
    },
    twitter: {
      card: 'summary',
      title: config.metaTitle,
      description: config.metaDescription,
    },
  };
}

export default function CategoryPage({ category }: { category: Category }) {
  const config = CATEGORIES[category];
  const allPosts = getAllPosts();
  const posts = allPosts.filter((p) => p.category === category);
  const others = VALID_CATEGORIES.filter((c) => c !== category);
  const latest = posts[0];

  return (
    <div className="space-y-12">

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-zinc-500">
        <Link href="/blog" className="hover:text-zinc-300 transition-colors">~/blog</Link>
        <span className="mx-1 text-zinc-700" aria-hidden="true">/</span>
        <span className="text-zinc-400" aria-current="page">{category}</span>
      </nav>

      {/* Header + SEO intro */}
      <header className="space-y-5 border-b border-zinc-800 pb-10">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-green-800/60 bg-green-900/30 px-2 py-0.5 text-green-400">
              <span aria-hidden="true">{config.icon}</span>
              {config.label}
            </span>
            <span>
              {posts.length} article{posts.length !== 1 ? 's' : ''}
            </span>
            {latest && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span>
                  last post <time dateTime={latest.date}>{formatDate(latest.date)}</time>
                </span>
              </>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {config.label} Guides
          </h1>
        </div>
        <div className="max-w-2xl space-y-3">
          {config.intro.map((para, i) => (
            <p key={i} className="font-sans text-[15px] text-zinc-400 leading-relaxed sm:text-base">{para}</p>
          ))}
        </div>
      </header>

      {/* Posts */}
      <section aria-labelledby="category-posts-heading" className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="category-posts-heading" className="font-mono text-sm font-semibold text-zinc-300">
            All {config.label.toLowerCase()} articles
          </h2>
          {posts.length > 1 && (
            <span className="font-mono text-xs text-zinc-500">newest first</span>
          )}
        </div>
        {posts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-8 py-16 text-center">
            <p className="font-mono text-sm text-zinc-500">No posts in this category yet.</p>
            <Link href="/blog" className="mt-4 inline-block font-mono text-xs text-green-400 hover:underline">
              ← All posts
            </Link>
          </div>
        )}
      </section>

      {/* Recommended articles — nginx pillar internal linking */}
      {category === 'nginx' && (
        <section className="space-y-4">
          <h2 className="font-mono text-sm font-semibold text-zinc-300">
            Start with the most common production issues
          </h2>
          <ul className="space-y-2.5">
            {[
              { text: 'Fix NGINX 502 Bad Gateway errors in production',           href: '/blog/nginx-502-bad-gateway-fix-linux' },
              { text: 'Diagnose NGINX 502 errors that only appear under load',    href: '/blog/nginx-502-under-load' },
              { text: 'Configure upstream keepalive to prevent connection drops',  href: '/blog/nginx-upstream-keepalive' },
              { text: 'Set up NGINX rate limiting for API and login endpoints',   href: '/blog/nginx-rate-limiting-config' },
              { text: 'NGINX troubleshooting reference for production incidents',  href: '/blog/nginx-troubleshooting-guide' },
            ].map(({ text, href }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="font-mono text-sm text-green-400 hover:underline"
                >
                  → {text}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tool CTA — nginx only */}
      {category === 'nginx' && (
        <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 space-y-3">
          <div className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Tool</div>
          <Link
            href="/tools/nginx-config-analyzer"
            className="font-mono text-base font-semibold text-zinc-100 hover:text-green-400 transition-colors block"
          >
            NGINX Config Analyzer →
          </Link>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
            Paste any NGINX config and get an instant scored report — missing security headers,
            TLS issues, proxy header gaps, rate limiting, and timeout settings.
            Runs in-browser, nothing sent to a server.
          </p>
        </section>
      )}

      {/* Cross-category links */}
      <nav aria-labelledby="other-topics-heading" className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 sm:p-6 space-y-4">
        <h2 id="other-topics-heading" className="font-mono text-sm font-semibold text-zinc-300">Other topics</h2>
        <div className="flex flex-wrap gap-2">
          {others.map((cat) => {
            const c = CATEGORIES[cat];
            const count = allPosts.filter((p) => p.category === cat).length;
            return (
              <Link key={cat} href={`/blog/${cat}`}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-2 rounded-lg hover:border-zinc-500 hover:text-white transition-all">
                <span aria-hidden="true">{c.icon}</span>
                {c.label}
                <span className="text-zinc-600">{count}</span>
              </Link>
            );
          })}
          <Link href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-2 rounded-lg hover:border-zinc-500 hover:text-white transition-all">
            ← All posts
          </Link>
        </div>
      </nav>

    </div>
  );
}