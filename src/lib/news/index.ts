import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import remarkGfm from 'remark-gfm';
import { parseRss, kevToItems, mergeNews, isHttpUrl, type NewsItem, type KevEntry } from './parse.ts';

export type { NewsItem } from './parse.ts';
export { groupByDay } from './parse.ts';

// /news is rebuilt at most once per hour (ISR), so each source is hit at most
// hourly from Vercel. A feed that fails just drops out of that rebuild.

// CISA publishes the KEV catalog to GitHub too; the cisa.gov copy sits behind
// a bot check that blocks server-side fetches.
const KEV_URL = 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json';

export const RSS_FEEDS = [
  { source: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { source: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
];

export const NEWS_SOURCES = [
  { name: 'CISA KEV', href: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog' },
  { name: 'The Hacker News', href: 'https://thehackernews.com' },
  { name: 'Krebs on Security', href: 'https://krebsonsecurity.com' },
];

// KEV additions are the signal, so keep two weeks of them. Headlines go stale
// fast and one busy feed would crowd out the rest, so cap each feed.
const KEV_WINDOW = { days: 14, limit: 40 };
const RSS_WINDOW = { days: 7, limit: 15 };
const FETCH_TIMEOUT_MS = 10_000;

const newsDirectory = path.join(process.cwd(), 'news');

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'damonsec.com news page (+https://www.damonsec.com/news)' },
    });
    if (!res.ok) {
      console.warn(`[news] ${url} → HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[news] ${url} failed: ${(err as Error).message}`);
    return null;
  }
}

async function getKevItems(): Promise<NewsItem[]> {
  const body = await fetchText(KEV_URL);
  if (!body) return [];
  try {
    const data = JSON.parse(body) as { vulnerabilities?: KevEntry[] };
    return kevToItems(data.vulnerabilities ?? []);
  } catch {
    console.warn('[news] KEV JSON did not parse');
    return [];
  }
}

async function getRssItems(now: Date): Promise<NewsItem[][]> {
  const bodies = await Promise.all(RSS_FEEDS.map((f) => fetchText(f.url)));
  return bodies.map((xml, i) =>
    xml ? mergeNews([parseRss(xml, RSS_FEEDS[i].source)], { now, ...RSS_WINDOW }) : []
  );
}

/** Hand-written notes in news/*.md. Frontmatter: title, date, source? (URL). */
export async function getNotes(): Promise<NewsItem[]> {
  if (!fs.existsSync(newsDirectory)) return [];
  const files = fs.readdirSync(newsDirectory).filter((f) => f.endsWith('.md'));
  const notes = await Promise.all(
    files.map(async (file) => {
      const { data, content } = matter(fs.readFileSync(path.join(newsDirectory, file), 'utf8'));
      const slug = file.replace(/\.md$/, '');
      const date = data.date instanceof Date ? data.date.toISOString() : String(data.date ?? '');
      const source = typeof data.source === 'string' && isHttpUrl(data.source) ? data.source : undefined;
      const html = (await remark().use(remarkGfm).use(remarkHtml).process(content)).toString();
      return {
        id: `note:${slug}`,
        kind: 'note' as const,
        source: 'damonsec',
        title: String(data.title ?? slug),
        url: source ?? '',
        date,
        summary: '',
        html,
      };
    })
  );
  return notes
    .filter((n) => !Number.isNaN(new Date(n.date).getTime()))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getNewsFeed(now = new Date()): Promise<NewsItem[]> {
  const [kev, rss] = await Promise.all([getKevItems(), getRssItems(now)]);
  return mergeNews([mergeNews([kev], { now, ...KEV_WINDOW }), ...rss], {
    now,
    days: KEV_WINDOW.days,
    limit: KEV_WINDOW.limit + RSS_FEEDS.length * RSS_WINDOW.limit,
  });
}
