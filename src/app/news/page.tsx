import type { Metadata } from 'next';
import Link from 'next/link';
import clsx from 'clsx';
import { getNewsFeed, getNotes, groupByDay, NEWS_SOURCES, type NewsItem } from '@/lib/news';
import { formatDate } from '@/lib/utils';

// ISR: re-fetch the feeds at most once an hour
export const revalidate = 3600;

const BASE_URL = 'https://www.damonsec.com';
const TITLE = 'Security News — Exploited CVEs & Breaking Incidents';
const DESCRIPTION =
  'Breaking security news for sysadmins: newly exploited CVEs from the CISA KEV catalog, major incidents and headlines, refreshed every hour, plus short notes on what to patch first.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${BASE_URL}/news` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}/news`,
    type: 'website',
    siteName: 'damonsec.com',
  },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
};

const KIND_BADGE: Record<NewsItem['kind'], { label: string; className: string }> = {
  kev: { label: 'Exploited', className: 'border-red-800/60 bg-red-900/30 text-red-400' },
  news: { label: 'News', className: 'border-blue-800/60 bg-blue-900/30 text-blue-400' },
  note: { label: 'Note', className: 'border-green-800/60 bg-green-900/30 text-green-400' },
};

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const yesterday = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (day === yesterday) return 'Yesterday';
  return formatDate(`${day}T00:00:00Z`);
}

function NoteCard({ note }: { note: NewsItem }) {
  return (
    <Link
      href={note.url}
      className="group flex h-full flex-col gap-3 rounded-xl border border-green-900/50 bg-zinc-900/40 p-5 transition-all duration-200 hover:border-green-700/60 hover:bg-zinc-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50"
    >
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-400">
        <span className={clsx('rounded border px-1.5 py-0.5 uppercase tracking-wider', KIND_BADGE.note.className)}>
          {KIND_BADGE.note.label}
        </span>
        <time dateTime={note.date}>{formatDate(note.date)}</time>
      </div>
      <h3 className="font-display text-base font-bold leading-snug text-white group-hover:text-green-400 transition-colors duration-200">
        {note.title}
      </h3>
      <p className="font-sans text-sm leading-relaxed text-zinc-400 line-clamp-3">{note.summary}</p>
      <span className="mt-auto pt-1 font-mono text-xs text-green-400">
        Read note <span className="inline-block transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

function FeedRow({ item }: { item: NewsItem }) {
  const badge = KIND_BADGE[item.kind];
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="group flex flex-col gap-1.5 rounded-lg border border-transparent px-3 py-3 transition-colors hover:border-zinc-800 hover:bg-zinc-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 sm:px-4"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-zinc-500">
          <span className={clsx('rounded border px-1.5 py-0.5 uppercase tracking-wider', badge.className)}>
            {badge.label}
          </span>
          {item.ransomware && (
            <span className="rounded border border-orange-800/60 bg-orange-900/30 px-1.5 py-0.5 uppercase tracking-wider text-orange-400">
              Ransomware
            </span>
          )}
          <span className="text-zinc-400">{item.source}</span>
          {item.cve && item.kind !== 'kev' && (
            <>
              <span className="text-zinc-700" aria-hidden="true">·</span>
              <span>{item.cve}</span>
            </>
          )}
        </div>
        <h4 className="font-display text-[15px] font-semibold leading-snug text-zinc-100 group-hover:text-green-400 transition-colors">
          {item.title}
          <span className="ml-1 text-zinc-600 group-hover:text-green-400" aria-hidden="true">↗</span>
        </h4>
        {item.summary && (
          <p className="font-sans text-sm leading-relaxed text-zinc-400 line-clamp-2">{item.summary}</p>
        )}
      </a>
    </li>
  );
}

export default async function NewsPage() {
  const now = new Date();
  const [notes, feed] = await Promise.all([getNotes(), getNewsFeed(now)]);
  const days = groupByDay(feed);
  const today = now.toISOString().slice(0, 10);
  const exploitedCount = feed.filter((i) => i.kind === 'kev').length;

  return (
    <div className="space-y-12">

      {/* Header */}
      <header className="space-y-5 border-b border-zinc-800 pb-10">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-green-800/60 bg-green-900/30 px-2 py-0.5 text-green-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden="true" />
              Live
            </span>
            <span>{feed.length} items · last 14 days</span>
            {exploitedCount > 0 && (
              <>
                <span className="text-zinc-700" aria-hidden="true">·</span>
                <span className="text-red-400">{exploitedCount} newly exploited CVEs</span>
              </>
            )}
            <span className="text-zinc-700" aria-hidden="true">·</span>
            <span>refreshed hourly</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Security News
          </h1>
        </div>
        <div className="max-w-2xl space-y-3">
          <p className="font-sans text-[15px] text-zinc-400 leading-relaxed sm:text-base">
            What&apos;s on fire right now: CVEs that CISA has confirmed are exploited in the wild, plus the
            day&apos;s biggest security headlines. Notes at the top are mine — the ones worth dropping
            everything to patch.
          </p>
          <p className="font-mono text-xs text-zinc-500">
            Sources:{' '}
            {NEWS_SOURCES.map((s, i) => (
              <span key={s.name}>
                {i > 0 && <span className="text-zinc-700"> · </span>}
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-green-400 transition-colors">
                  {s.name}
                </a>
              </span>
            ))}
          </p>
        </div>
      </header>

      {/* Hand-written notes */}
      {notes.length > 0 && (
        <section aria-labelledby="news-notes-heading" className="space-y-5">
          <h2 id="news-notes-heading" className="font-mono text-sm font-semibold text-zinc-300">
            Patch these first
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {notes.slice(0, 4).map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      )}

      {/* Auto feed, grouped by day */}
      <section aria-labelledby="news-feed-heading" className="space-y-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="news-feed-heading" className="font-mono text-sm font-semibold text-zinc-300">
            Latest
          </h2>
          {feed.length > 1 && <span className="font-mono text-xs text-zinc-500">newest first</span>}
        </div>

        {days.length > 0 ? (
          days.map(({ day, items }) => (
            <div key={day} className="space-y-1">
              <h3 className="sticky top-[73px] md:top-[60px] z-10 -mx-1 bg-zinc-950 px-1 py-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
                <time dateTime={day}>{dayLabel(day, today)}</time>
                <span className="ml-2 text-zinc-700">{items.length}</span>
              </h3>
              <ul className="divide-y divide-zinc-800/60 -mx-3 sm:-mx-4">
                {items.map((item) => (
                  <FeedRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-8 py-16 text-center">
            <p className="font-mono text-sm text-zinc-500">The feeds didn&apos;t answer this time. Check back in an hour.</p>
          </div>
        )}
      </section>

    </div>
  );
}
