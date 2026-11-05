// Adds ids and anchor links to the h2/h3 headings in rendered post HTML and
// returns them for the table of contents.

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function addHeadingIds(html: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Map<string, number>();

  const out = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const base = slugify(text) || 'section';
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n + 1}`;
    const level = Number(lvl) as 2 | 3;
    headings.push({ id, text, level });
    // The anchor has no text so it adds nothing to word counts or FAQ extraction;
    // the "#" is drawn by CSS.
    return `<h${lvl} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="Link to this section"></a></h${lvl}>`;
  });

  return { html: out, headings };
}

/** Splits rendered HTML before the first h2, so the TOC can sit after the intro. */
export function splitAtFirstH2(html: string): [intro: string, rest: string] {
  const i = html.search(/<h2[\s>]/);
  return i === -1 ? [html, ''] : [html.slice(0, i), html.slice(i)];
}
