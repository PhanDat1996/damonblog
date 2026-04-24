import type { Metadata } from 'next';
import Link from 'next/link';
import { getPostsByCategory } from '@/lib/posts';
import { CATEGORIES, VALID_CATEGORIES } from '@/lib/categories';
import type { Category } from '@/types/post';
import PostCard from '@/components/PostCard';

export function buildCategoryMetadata(category: Category): Metadata {
  const config = CATEGORIES[category];
  const BASE_URL = 'https://www.damonsec.com';
  return {
    title: config.metaTitle,
    description: config.metaDescription,
    alternates: { canonical: `${BASE_URL}/blog/${category}/` },
    openGraph: {
      title: config.metaTitle,
      description: config.metaDescription,
      url: `${BASE_URL}/blog/${category}/`,
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
  const posts = getPostsByCategory(category);
  const others = VALID_CATEGORIES.filter((c) => c !== category);

  return (
    <div className="space-y-12">

      {/* Breadcrumb */}
      <nav className="font-mono text-xs text-zinc-500">
        <Link href="/blog" className="hover:text-zinc-300 transition-colors">~/blog</Link>
        <span className="mx-1 text-zinc-700">/</span>
        <span className="text-zinc-400">{category}</span>
      </nav>

      {/* Header + SEO intro */}
      <div className="space-y-4 border-b border-zinc-800 pb-10">
        <div className="flex items-center gap-2 font-mono text-xs text-green-400">
          <span>{config.icon}</span>
          <span>~/blog/{category}</span>
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">
          {config.label} Guides
        </h1>
        <div className="max-w-2xl space-y-3">
          {config.intro.map((para, i) => (
            <p key={i} className="font-sans text-zinc-400 leading-relaxed">{para}</p>
          ))}
        </div>
        <p className="font-mono text-xs text-zinc-500">
          {posts.length} article{posts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Posts */}
      {posts.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="font-mono text-sm text-zinc-500">No posts in this category yet.</p>
      )}

      {/* Cross-category links */}
      <section className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-6 space-y-3">
        <h2 className="font-mono text-sm font-semibold text-zinc-300">Other topics</h2>
        <div className="flex flex-wrap gap-2">
          {others.map((cat) => {
            const c = CATEGORIES[cat];
            return (
              <Link key={cat} href={`/blog/${cat}/`}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-1.5 rounded-lg hover:border-zinc-500 hover:text-white transition-all">
                {c.icon} {c.label}
              </Link>
            );
          })}
          <Link href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-400 border border-zinc-700/60 bg-zinc-800/40 px-3 py-1.5 rounded-lg hover:border-zinc-500 hover:text-white transition-all">
            ← All posts
          </Link>
        </div>
      </section>

    </div>
  );
}
