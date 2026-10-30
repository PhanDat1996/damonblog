import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAllNoteSlugs, getNoteBySlug, getNotes } from '@/lib/news';
import { formatDate } from '@/lib/utils';

const BASE_URL = 'https://www.damonsec.com';

interface Props {
  params: Promise<{ slug: string }>;
}

// Notes only exist as files in news/, so unknown slugs are a 404
export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllNoteSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const note = await getNoteBySlug(slug);
  if (!note) return {};

  const url = `${BASE_URL}/news/${slug}`;
  return {
    title: note.title,
    description: note.summary,
    authors: [{ name: 'Damon', url: `${BASE_URL}/about` }],
    alternates: { canonical: url },
    openGraph: {
      title: note.title,
      description: note.summary,
      type: 'article',
      url,
      publishedTime: new Date(note.date).toISOString(),
      authors: [`${BASE_URL}/about`],
      siteName: 'damonsec.com',
    },
    twitter: {
      card: 'summary_large_image',
      title: note.title,
      description: note.summary,
      creator: '@damonsec',
    },
  };
}

export default async function NewsNotePage({ params }: Props) {
  const { slug } = await params;
  const note = await getNoteBySlug(slug);
  if (!note) notFound();

  const url = `${BASE_URL}/news/${slug}`;
  const others = (await getNotes()).filter((n) => n.slug !== slug).slice(0, 4);
  const sourceHost = note.sourceUrl ? new URL(note.sourceUrl).hostname.replace(/^www\./, '') : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: note.title,
    description: note.summary,
    datePublished: new Date(note.date).toISOString(),
    url,
    mainEntityOfPage: url,
    author: { '@type': 'Person', name: 'Damon', url: `${BASE_URL}/about` },
    publisher: { '@type': 'Organization', name: 'damonsec.com', url: BASE_URL },
    ...(note.sourceUrl && { citation: note.sourceUrl }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <article className="mx-auto max-w-2xl">
        {/* Back link + badge */}
        <div className="mb-10 flex items-center gap-3">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
          >
            ← back to news
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded border border-green-800/40 bg-green-900/20 px-2 py-0.5 font-mono text-xs text-green-400">
            Patch note
          </span>
        </div>

        {/* Header */}
        <header className="mb-10 space-y-5">
          <h1 className="font-display text-2xl md:text-4xl font-bold leading-tight tracking-tight text-white break-words">
            {note.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-zinc-400 border-t border-b border-zinc-800 py-4">
            <time dateTime={note.date}>{formatDate(note.date)}</time>
            <span className="text-zinc-700" aria-hidden="true">·</span>
            <Link href="/about" className="text-green-400 hover:underline">Damon</Link>
            {sourceHost && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-green-400 transition-colors">
                  via {sourceHost} ↗
                </a>
              </>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="prose" dangerouslySetInnerHTML={{ __html: note.html ?? '' }} />

        {/* Source */}
        {note.sourceUrl && (
          <aside className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5" aria-labelledby="source-heading">
            <h2 id="source-heading" className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-2">
              Source
            </h2>
            <a
              href={note.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-green-400 hover:underline break-all"
            >
              {note.sourceUrl} ↗
            </a>
          </aside>
        )}

        {/* More notes */}
        {others.length > 0 && (
          <section className="mt-14 border-t border-zinc-800 pt-8" aria-labelledby="more-notes-heading">
            <h2 id="more-notes-heading" className="font-mono text-xs text-zinc-500 uppercase tracking-widest mb-4">
              More patch notes
            </h2>
            <ul className="space-y-3">
              {others.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.url}
                    className="group block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition-all"
                  >
                    <p className="font-mono text-[11px] text-zinc-500">
                      <time dateTime={n.date}>{formatDate(n.date)}</time>
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white group-hover:text-green-400 transition-colors">
                      {n.title}
                    </p>
                    <p className="mt-1.5 text-sm text-zinc-400 line-clamp-2">{n.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 pt-6 border-t border-zinc-800">
          <Link href="/news" className="font-mono text-xs text-zinc-400 hover:text-green-400 transition-colors">
            ← Live feed: newly exploited CVEs and today&apos;s headlines
          </Link>
        </div>
      </article>
    </>
  );
}
