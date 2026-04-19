import type { Metadata } from 'next';
import { getAllPosts, getAllTags } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import TagBadge from '@/components/TagBadge';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Technical writing on cybersecurity, NGINX, Docker, logs, infrastructure, and production debugging.',
};

interface Props {
  searchParams: Promise<{ tag?: string }>;
}

export default async function BlogPage({ searchParams }: Props) {
  const { tag } = await searchParams;
  const activeTag = tag ?? '';
  const allPosts = getAllPosts();
  const allTags = getAllTags();

  const posts = activeTag
    ? allPosts.filter((p) =>
        p.tags.map((t) => t.toLowerCase()).includes(activeTag.toLowerCase())
      )
    : allPosts;

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
      </div>

      {/* Tag filters */}
      <div>
        <p className="font-mono text-xs text-zinc-500 mb-3 uppercase tracking-widest">Filter by topic</p>
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
          {allTags.map((tag) => (
            <a
              key={tag}
              href={`/blog?tag=${encodeURIComponent(tag)}`}
              className={`inline-flex items-center rounded border px-2.5 py-1 font-mono text-xs font-medium transition-opacity hover:opacity-80 ${
                activeTag.toLowerCase() === tag.toLowerCase()
                  ? 'bg-green-900/40 text-green-400 border-green-800/60'
                  : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60'
              }`}
            >
              #{tag}
            </a>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-zinc-500">
          {posts.length} post{posts.length !== 1 ? 's' : ''}
          {activeTag ? ` tagged #${activeTag}` : ''}
        </p>
      </div>

      {/* Post grid */}
      {posts.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-8 py-16 text-center">
          <p className="font-mono text-sm text-zinc-500">No posts found for #{activeTag}</p>
          <a href="/blog" className="mt-4 inline-block font-mono text-xs text-green-400 hover:underline">
            ← clear filter
          </a>
        </div>
      )}
    </div>
  );
}
