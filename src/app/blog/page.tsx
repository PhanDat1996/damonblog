import type { Metadata } from 'next';
import { getAllPosts, getAllTags } from '@/lib/posts';
import PostCard from '@/components/PostCard';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Technical writing on cybersecurity, NGINX, Docker, logs, infrastructure, and production debugging.',
};

const POSTS_PER_PAGE = 9;

interface Props {
  searchParams: Promise<{ tag?: string; page?: string }>;
}

export default async function BlogPage({ searchParams }: Props) {
  const { tag, page } = await searchParams;
  const activeTag = tag ?? '';
  const currentPage = Math.max(1, parseInt(page ?? '1', 10));

  const allPosts = getAllPosts();
  const allTags = getAllTags();

  // Filter by tag if active
  const filtered = activeTag
    ? allPosts.filter((p) =>
        p.tags.map((t) => t.toLowerCase()).includes(activeTag.toLowerCase())
      )
    : allPosts;

  // Paginate
  const totalPosts = filtered.length;
  const totalPages = Math.ceil(totalPosts / POSTS_PER_PAGE);
  const posts = filtered.slice(
    (currentPage - 1) * POSTS_PER_PAGE,
    currentPage * POSTS_PER_PAGE
  );

  // Build pagination URL helper
  const pageUrl = (p: number) => {
    const params = new URLSearchParams();
    if (activeTag) params.set('tag', activeTag);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/blog${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="space-y-4 border-b border-zinc-800 pb-10">
        <div className="flex items-center gap-2 font-mono text-xs text-green-400">
          <span>~/blog</span>
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white">
          The Blog
        </h1>
        <p className="text-zinc-400 max-w-xl leading-relaxed">
          Field notes from the trenches — real incidents, hard-won debugging sessions,
          and practical guides for security &amp; infrastructure engineers.
        </p>

        {/* TODO: Add search box here when post count exceeds ~50
        <div className="relative max-w-sm">
          <input
            type="search"
            placeholder="Search articles..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 pr-10 font-mono text-sm text-zinc-200 placeholder-zinc-500 focus:border-green-500/50 focus:outline-none"
          />
          <span className="absolute right-3 top-2.5 text-zinc-500 text-sm">⌕</span>
        </div>
        */}
      </div>

      {/* Tag filters */}
      <div>
        <p className="font-mono text-xs text-zinc-400 mb-3 uppercase tracking-widest">
          Filter by topic
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/blog"
            className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-xs font-medium transition-opacity hover:opacity-80 ${
              !activeTag
                ? 'bg-green-900/40 text-green-400 border-green-800/60'
                : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60'
            }`}
          >
            #all
          </a>
          {allTags.map((t) => (
            <a
              key={t}
              href={`/blog?tag=${encodeURIComponent(t)}`}
              className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-xs font-medium transition-opacity hover:opacity-80 ${
                activeTag.toLowerCase() === t.toLowerCase()
                  ? 'bg-green-900/40 text-green-400 border-green-800/60'
                  : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60'
              }`}
            >
              #{t}
            </a>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-zinc-500">
          {totalPosts} post{totalPosts !== 1 ? 's' : ''}
          {activeTag ? ` tagged #${activeTag}` : ''}
          {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
        </p>
      </div>

      {/* Post grid */}
      {posts.length > 0 ? (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              {/* Prev */}
              {currentPage > 1 ? (
                <a
                  href={pageUrl(currentPage - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
                >
                  ← prev
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-4 py-2 font-mono text-xs text-zinc-700 cursor-not-allowed">
                  ← prev
                </span>
              )}

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <a
                  key={p}
                  href={pageUrl(p)}
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border font-mono text-xs transition-all ${
                    p === currentPage
                      ? 'border-green-500/40 bg-green-900/30 text-green-400'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white'
                  }`}
                >
                  {p}
                </a>
              ))}

              {/* Next */}
              {currentPage < totalPages ? (
                <a
                  href={pageUrl(currentPage + 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-4 py-2 font-mono text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
                >
                  next →
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-4 py-2 font-mono text-xs text-zinc-700 cursor-not-allowed">
                  next →
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-8 py-16 text-center">
          <p className="font-mono text-sm text-zinc-500">No posts found for #{activeTag}</p>
          <a
            href="/blog"
            className="mt-4 inline-block font-mono text-xs text-green-400 hover:underline"
          >
            ← clear filter
          </a>
        </div>
      )}
    </div>
  );
}