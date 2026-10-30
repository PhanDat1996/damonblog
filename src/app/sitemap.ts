import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/posts';
import { VALID_CATEGORIES } from '@/lib/categories';
import { getNotes } from '@/lib/news';

const BASE_URL = 'https://www.damonsec.com';

const TOOL_SLUGS = [
  'nginx-config-analyzer',
  'nginx-cis-hardening-checker',
  'nginx-cve-checker',
  'pg-hardening-checker',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = getAllPosts();
  const notes = await getNotes();

  const postEntries: MetadataRoute.Sitemap = posts
    .filter((post) => !post.noindex)
    .map((post) => ({
      url: `${BASE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated ?? post.date),
      changeFrequency: 'monthly',
      priority: post.featured ? 0.9 : 0.7,
    }));

  const categoryEntries: MetadataRoute.Sitemap = VALID_CATEGORIES.map((cat) => ({
    url: `${BASE_URL}/blog/${cat}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...categoryEntries,
    {
      url: `${BASE_URL}/news`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/tools`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...TOOL_SLUGS.map((tool) => ({
      url: `${BASE_URL}/tools/${tool}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${BASE_URL}/cka`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...postEntries,
    ...notes.map((note) => ({
      url: `${BASE_URL}${note.url}`,
      lastModified: new Date(note.date),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
