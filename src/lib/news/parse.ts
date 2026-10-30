// Pure parsing helpers for the /news page. No fs or network here, so the
// node:test suite can import this file directly.

export type NewsKind = 'kev' | 'news' | 'note';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  source: string;
  title: string;
  url: string;
  /** ISO date or datetime */
  date: string;
  summary: string;
  cve?: string;
  /** CISA KEV: "Known" when the CVE is tied to ransomware campaigns */
  ransomware?: boolean;
  /** Hand-written notes only: body rendered from our own markdown */
  html?: string;
}

export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  knownRansomwareCampaignUse?: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Turns an RSS field (maybe CDATA, maybe HTML) into one line of plain text. */
export function toPlainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Feeds often entity-encode their HTML, so decode before stripping tags too
  const once = decodeEntities(unwrapped).replace(/<[^>]*>/g, ' ');
  return decodeEntities(once).replace(/\s+/g, ' ').trim();
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

function field(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const CVE_RE = /CVE-\d{4}-\d{4,}/i;

/** Minimal RSS 2.0 reader: enough for the handful of feeds we pull. */
export function parseRss(xml: string, source: string): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const item of items) {
    const title = toPlainText(field(item, 'title'));
    const url = toPlainText(field(item, 'link'));
    const pub = new Date(toPlainText(field(item, 'pubDate')));
    if (!title || !isHttpUrl(url) || Number.isNaN(pub.getTime())) continue;
    const summary = truncate(toPlainText(field(item, 'description')), 240);
    const cve = (title.match(CVE_RE) ?? summary.match(CVE_RE))?.[0]?.toUpperCase();
    out.push({
      id: url,
      kind: 'news',
      source,
      title,
      url,
      date: pub.toISOString(),
      summary,
      ...(cve ? { cve } : {}),
    });
  }
  return out;
}

export function kevToItems(entries: KevEntry[]): NewsItem[] {
  return entries
    .filter((v) => CVE_RE.test(v.cveID) && /^\d{4}-\d{2}-\d{2}$/.test(v.dateAdded))
    .map((v) => ({
      id: `kev:${v.cveID}`,
      kind: 'kev' as const,
      source: 'CISA KEV',
      title: `${v.cveID} · ${v.vendorProject} ${v.product}`,
      url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      date: v.dateAdded,
      summary: truncate(v.shortDescription.replace(/\s+/g, ' ').trim(), 240),
      cve: v.cveID,
      ransomware: v.knownRansomwareCampaignUse === 'Known',
    }));
}

/** Newest first, drops anything older than `days` before `now`, dedupes by URL. */
export function mergeNews(groups: NewsItem[][], { now, days, limit }: { now: Date; days: number; limit: number }): NewsItem[] {
  const cutoff = now.getTime() - days * 86_400_000;
  const seen = new Set<string>();
  return groups
    .flat()
    .filter((i) => {
      const t = new Date(i.date).getTime();
      if (Number.isNaN(t) || t < cutoff) return false;
      if (seen.has(i.url)) return false;
      seen.add(i.url);
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/** Groups items by calendar day (UTC), keeping the input order. */
export function groupByDay(items: NewsItem[]): { day: string; items: NewsItem[] }[] {
  const groups: { day: string; items: NewsItem[] }[] = [];
  for (const item of items) {
    const day = new Date(item.date).toISOString().slice(0, 10);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
