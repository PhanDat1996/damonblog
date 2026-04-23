import Link from 'next/link';
import type { Post } from '@/types/post';
import TagBadge from './TagBadge';
import { formatDate } from '@/lib/utils';

interface PostCardProps {
  post: Post;
  featured?: boolean;
}

export default function PostCard({ post, featured = false }: PostCardProps) {
  if (featured) {
    return (
      <Link
        href={`/blog/${post.slug}`}
        className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-7 transition-all duration-300 hover:border-green-500/40 hover:bg-zinc-900 hover:shadow-[0_0_40px_rgba(74,222,128,0.05)]"
      >
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-green-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Featured
            </span>
            <span className="text-zinc-700">·</span>
            <span className="font-mono text-[10px] text-zinc-400">{post.readingTime}</span>
          </div>

          <h2 className="mb-3 font-display text-xl font-bold leading-snug text-white group-hover:text-green-400 transition-colors duration-200 line-clamp-2">
            {post.title}
          </h2>
          {/* font-sans + slightly larger for readability */}
          <p className="font-sans text-sm leading-relaxed text-zinc-400 line-clamp-3">{post.excerpt}</p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} linked={false} />
            ))}
          </div>
          <p className="font-mono text-xs text-zinc-600">{formatDate(post.date)}</p>
        </div>

        <span className="absolute right-6 top-7 text-zinc-700 transition-all duration-200 group-hover:text-green-400 group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/60"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
        <span>{formatDate(post.date)}</span>
        <span className="text-zinc-700">·</span>
        <span>{post.readingTime}</span>
      </div>
      {/* font-display for card titles — Inter bold looks sharp */}
      <h3 className="font-display text-base font-bold leading-snug text-white group-hover:text-green-400 transition-colors duration-200 line-clamp-2">
        {post.title}
      </h3>
      {/* font-sans for excerpt — Plus Jakarta Sans at small size */}
      <p className="font-sans text-sm text-zinc-400 line-clamp-2 leading-relaxed">{post.excerpt}</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {post.tags.map((tag) => (
          <TagBadge key={tag} tag={tag} linked={false} />
        ))}
      </div>
    </Link>
  );
}
