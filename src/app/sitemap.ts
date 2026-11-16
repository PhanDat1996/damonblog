import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { VALID_CATEGORIES } from '@/lib/categories';
import { ADVISORIES_UPDATED } from '@/lib/nginx-cve/advisories';

const BASE_URL = 'https://www.damonsec.com';

const TOOL_SLUGS = [
  'nginx-config-analyzer',
  'nginx-cis-hardening-checker',
  'nginx-cve-checker',
  'pg-hardening-checker',
  'sni-split-proxy',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = getAllPosts();

  // Real content dates instead of new Date(): a lastmod that changes on every
  // build tells Google nothing, and it learns to ignore the sitemap's dates.
  const indexable = posts.filter((post) => !post.noindex);
  const postDate = (post: (typeof posts)[number]) => post.updated ?? post.date;
  const latest = (dates: string[]) => (dates.length ? new Date(dates.sort().at(-1)!) : undefined);
  const latestPost = latest(indexable.map(postDate));
  const latestInCategory = (cat: string) =>
    latest(indexable.filter((post) => post.category === cat).map(postDate));

  const postEntries: MetadataRoute.Sitemap = indexable
    .map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(postDate(post)),
      changeFrequency: 'monthly',
      priority: post.featured ? 0.9 : 0.7,
    }));

  // Empty category pages are thin content; leave them out until they have posts
  const categoryEntries: MetadataRoute.Sitemap = VALID_CATEGORIES
    .filter((cat) => indexable.some((post) => post.category === cat))
    .map((cat) => ({
      url: `${BASE_URL}/blog/${cat}`,
      lastModified: latestInCategory(cat),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

  return [
    {
      url: BASE_URL,
      lastModified: latestPost,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: latestPost,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...categoryEntries,
    // /news and its notes are noindex (aggregated headlines, short notes)
    {
      url: `${BASE_URL}/tools`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...TOOL_SLUGS.map((tool) => ({
      url: `${BASE_URL}/tools/${tool}`,
      // Only the CVE checker has a real "data updated" date; the others omit lastmod
      lastModified: tool === 'nginx-cve-checker' ? new Date(ADVISORIES_UPDATED) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${BASE_URL}/cka`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/cissp`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/about`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/contact`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...postEntries,
  ];
}
