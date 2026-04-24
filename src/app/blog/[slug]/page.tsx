import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllSlugs, getPostWithHtml, getAllPosts } from '@/lib/posts';
import { formatDate } from '@/lib/utils';
import TagBadge from '@/components/TagBadge';
import { BlogPostJsonLd, extractFaqFromHtml } from '@/components/JsonLd';
import { CATEGORIES } from '@/lib/categories';
import ReadingProgress from '@/components/ReadingProgressLazy';

const BASE_URL = 'https://www.damonsec.com';

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

  const url = `${BASE_URL}/blog/${slug}`;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    authors: [{ name: 'Damon', url: `${BASE_URL}/about` }],
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url,
      publishedTime: new Date(post.date).toISOString(),
      modifiedTime: new Date(post.date).toISOString(),
      authors: [`${BASE_URL}/about`],
      tags: post.tags,
      siteName: 'damonsec.com',
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      creator: '@damonsec',
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostWithHtml(slug);
  if (!post) notFound();

  const url = `${BASE_URL}/blog/${slug}`;
  const allPosts = getAllPosts();
  const currentIndex = allPosts.findIndex((p) => p.slug === slug);
  const prev = currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
  const next = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

  // Fix #3: extract FAQ items and word count for schema
  const faqItems = post.content ? extractFaqFromHtml(post.content) : [];
  const wordCount = post.content
    ? post.content.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length
    : undefined;

  return (
    <>
      <ReadingProgress />
      <BlogPostJsonLd post={post} url={url} wordCount={wordCount} faqItems={faqItems} />

      <article className="mx-auto max-w-2xl">
        {/* Back link + category badge */}
        <div className="mb-10 flex items-center gap-3">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            ← back to blog
          </Link>
          {post.category && CATEGORIES[post.category] && (
            <Link
              href={`/blog/${post.category}/`}
              className="inline-flex items-center gap-1.5 font-mono text-xs text-green-400 border border-green-800/40 bg-green-900/20 px-2 py-0.5 rounded hover:bg-green-900/40 transition-colors"
            >
              {CATEGORIES[post.category].icon} {CATEGORIES[post.category].label}
            </Link>
          )}
        </div>

        {/* Post header */}
        <header className="mb-10 space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="md" />
            ))}
          </div>

          <h1 className="font-display text-2xl md:text-4xl font-bold leading-tight tracking-tight text-white break-words overflow-visible">
            {post.title}
          </h1>

          <p className="text-lg text-zinc-400 leading-relaxed">{post.excerpt}</p>

          <div className="flex items-center gap-4 font-mono text-xs text-zinc-400 border-t border-b border-zinc-800 py-4">
            <span>{formatDate(post.date)}</span>
            <span className="text-zinc-700">·</span>
            <span>{post.readingTime}</span>
            <span className="text-zinc-700">·</span>
            <Link href="/about" className="text-green-400 hover:underline">Damon</Link>
          </div>
        </header>

        {/* Post content */}
        <div
          className="prose"
          dangerouslySetInnerHTML={{ __html: post.content ?? '' }}
        />

        {/* Post footer tags */}
        <div className="mt-14 border-t border-zinc-800 pt-8 space-y-4">
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest">Tags</p>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="md" />
            ))}
          </div>
        </div>

        {/* Prev / Next navigation */}
        <nav className="mt-10 grid sm:grid-cols-2 gap-4" aria-label="Post navigation">
          {prev && (
            <Link
              href={`/blog/${prev.slug}`}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-all"
            >
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest mb-2">← Previous</p>
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
              <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest mb-2">Next →</p>
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
