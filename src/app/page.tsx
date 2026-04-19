import type { Metadata } from 'next';
import Link from 'next/link';
import { getFeaturedPosts, getAllPosts } from '@/lib/posts';
import PostCard from '@/components/PostCard';
import TerminalHero from '@/components/TerminalHero';
import TagBadge from '@/components/TagBadge';

export const metadata: Metadata = {
  title: 'damon.sec — Cybersecurity & Infrastructure',
};

const TOPICS = [
  'nginx', 'docker', 'security', 'logs', 'linux',
  'troubleshooting', 'debugging', 'monitoring', 'ssl', 'firewall',
];

export default function HomePage() {
  const featured = getFeaturedPosts();
  const recent = getAllPosts().slice(0, 6);

  return (
    <div className="space-y-20">
      {/* Hero Section */}
      <section className="grid md:grid-cols-2 gap-12 items-start pt-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2 font-mono text-xs text-green-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span>online — writing technical things</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight text-white">
            Security Ops &amp;{' '}
            <span className="relative inline-block">
              <span className="text-green-400">Infrastructure</span>
            </span>{' '}
            Engineering
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed">
            Documenting the real world — NGINX misconfigs, Docker log floods,
            midnight incident responses, and everything in between.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 transition-all hover:bg-green-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]"
            >
              Read the blog →
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 font-mono text-sm text-zinc-300 transition-all hover:border-zinc-500 hover:text-white"
            >
              About me
            </Link>
          </div>
        </div>

        <div>
          <TerminalHero />
        </div>
      </section>

      {/* Featured Posts */}
      {featured.length > 0 && (
        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white">
              Featured Posts
            </h2>
            <Link href="/blog" className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors">
              all posts →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {featured.slice(0, 4).map((post) => (
              <PostCard key={post.slug} post={post} featured />
            ))}
          </div>
        </section>
      )}

      {/* Recent Posts */}
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">Recent Posts</h2>
          <Link href="/blog" className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors">
            view all →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recent.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>

      {/* Topics */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8">
        <h2 className="font-display text-lg font-bold text-white mb-4">Browse by Topic</h2>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((tag) => (
            <TagBadge key={tag} tag={tag} size="md" />
          ))}
        </div>
      </section>
    </div>
  );
}
