// Run with: npm test  (Node's built-in test runner with type stripping)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseRss, kevToItems, mergeNews, groupByDay, toPlainText, truncate, type NewsItem } from './parse.ts';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>
<item>
  <title><![CDATA[Critical CVE-2026-12345 in Acme &amp; Co]]></title>
  <link>https://example.com/a</link>
  <pubDate>Fri, 30 Oct 2026 17:51:56 +0530</pubDate>
  <description><![CDATA[<p>Attackers are <b>exploiting</b> it&nbsp;now.</p>]]></description>
</item>
<item>
  <title>Entity-encoded HTML</title>
  <link>https://example.com/b</link>
  <pubDate>Thu, 29 Oct 2026 10:00:00 +0000</pubDate>
  <description>&lt;p&gt;Hello &amp;amp; bye&lt;/p&gt;</description>
</item>
<item><title>No date</title><link>https://example.com/c</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Thu, 29 Oct 2026 10:00:00 +0000</pubDate></item>
</channel></rss>`;

test('parseRss reads CDATA, strips HTML and pulls the CVE id', () => {
  const items = parseRss(RSS, 'Feed');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Critical CVE-2026-12345 in Acme & Co');
  assert.equal(items[0].summary, 'Attackers are exploiting it now.');
  assert.equal(items[0].cve, 'CVE-2026-12345');
  assert.equal(items[0].date, '2026-10-30T12:21:56.000Z');
  assert.equal(items[1].summary, 'Hello & bye');
});

test('parseRss drops items without a date or with a non-http link', () => {
  const urls = parseRss(RSS, 'Feed').map((i) => i.url);
  assert.ok(!urls.includes('https://example.com/c'));
  assert.ok(!urls.some((u) => u.startsWith('javascript:')));
});

test('toPlainText and truncate', () => {
  assert.equal(toPlainText('  a<br/>b\n\n c &#8217; &#x27; '), 'a b c ’ \'');
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('one two three four five', 14), 'one two three…');
});

test('kevToItems links to NVD and flags ransomware use', () => {
  const [item] = kevToItems([
    {
      cveID: 'CVE-2026-1111',
      vendorProject: 'Acme',
      product: 'Gateway',
      vulnerabilityName: 'x',
      dateAdded: '2026-10-29',
      shortDescription: 'Acme Gateway  has a bug.',
      knownRansomwareCampaignUse: 'Known',
    },
  ]);
  assert.equal(item.title, 'CVE-2026-1111 · Acme Gateway');
  assert.equal(item.url, 'https://nvd.nist.gov/vuln/detail/CVE-2026-1111');
  assert.equal(item.summary, 'Acme Gateway has a bug.');
  assert.equal(item.ransomware, true);
});

const item = (id: string, date: string, url = `https://example.com/${id}`): NewsItem => ({
  id, kind: 'news', source: 's', title: id, url, date, summary: '',
});

test('mergeNews sorts newest first, drops old items and duplicate URLs', () => {
  const merged = mergeNews(
    [
      [item('old', '2026-09-01'), item('mid', '2026-10-28')],
      [item('new', '2026-10-30T08:00:00Z'), item('dup', '2026-10-29', 'https://example.com/mid')],
    ],
    { now: new Date('2026-10-30T12:00:00Z'), days: 14, limit: 10 }
  );
  assert.deepEqual(merged.map((i) => i.id), ['new', 'mid']);
});

test('groupByDay keeps order and splits on UTC day', () => {
  const groups = groupByDay([item('a', '2026-10-30T08:00:00Z'), item('b', '2026-10-30'), item('c', '2026-10-29')]);
  assert.deepEqual(groups.map((g) => [g.day, g.items.length]), [['2026-10-30', 2], ['2026-10-29', 1]]);
});

test('every hand-written note has a title and a valid date', () => {
  const dir = join(process.cwd(), 'news');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const head = readFileSync(join(dir, file), 'utf8').split('---')[1] ?? '';
    assert.match(head, /^title: .+/m, `${file}: title`);
    assert.match(head, /^date: \d{4}-\d{2}-\d{2}$/m, `${file}: date`);
  }
});
