import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllSlugs, getPostWithHtml, getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import TagBadge from '@/components/TagBadge';
import ReadingProgress from '@/components/ReadingProgress';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostWithHtml(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      publishedTime: post.date,
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostWithHtml(slug);
  if (!post) notFound();

  const allPosts = getAllPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prev = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const next = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  return (
    <>
      <ReadingProgress />

      <article className="mx-auto max-w-2xl">
        {/* Back link */}
        <div className="mb-10">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            ← back to blog
          </Link>
        </div>

        {/* Post header */}
        <header className="mb-10 space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="md" />
            ))}
          </div>

          <h1 className="font-display text-3xl md:text-4xl font-bold leading-[1.15] tracking-tight text-white">
            {post.title}
          </h1>

          <p className="text-lg text-zinc-400 leading-relaxed">{post.excerpt}</p>

          <div className="flex items-center gap-4 font-mono text-xs text-zinc-500 border-t border-b border-zinc-800 py-4">
            <span>{formatDate(post.date)}</span>
            <span className="text-zinc-700">·</span>
            <span>{post.readingTime}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-green-400">Damon</span>
          </div>
        </header>

        {/* Post content */}
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: post.content ?? '' }}
        />

        {/* Post footer */}
        <div className="mt-14 border-t border-zinc-800 pt-8 space-y-4">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Tags</p>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="md" />
            ))}
          </div>
        </div>

        {/* Prev / Next navigation */}
        <nav className="mt-10 grid sm:grid-cols-2 gap-4">
          {prev && (
            <Link
              href={`/blog/${prev.slug}`}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-all"
            >
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">← Previous</p>
              <p className="text-sm font-semibold text-white group-hover:text-green-400 transition-colors line-clamp-2">
                {prev.title}
              </p>
            </Link>
          )}
          {next && (
            <Link
              href={`/blog/${next.slug}`}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-all sm:text-right"
            >
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Next →</p>
              <p className="text-sm font-semibold text-white group-hover:text-green-400 transition-colors line-clamp-2">
                {next.title}
              </p>
            </Link>
          )}
        </nav>
      </article>
    </>
  );
}