import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import remarkGfm from 'remark-gfm';
import readingTime from 'reading-time';
import type { Post, PostMeta, Category } from '@/types/post';

const postsDirectory = path.join(process.cwd(), 'posts');

export function getAllSlugs(): string[] {
  const fileNames = fs.readdirSync(postsDirectory);
  return fileNames
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
}

export function getAllPosts(): Post[] {
  const slugs = getAllSlugs();
  const posts = slugs.map((slug) => getPostBySlug(slug));
  return posts
    .filter((p): p is Post => p !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getFeaturedPosts(): Post[] {
  return getAllPosts().filter((p) => p.featured);
}

export function getPostsByTag(tag: string): Post[] {
  return getAllPosts().filter((p) =>
    p.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())
  );
}

export function getPostsByCategory(category: Category): Post[] {
  return getAllPosts().filter((p) => p.category === category);
}

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tagSet = new Set<string>();
  posts.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}

export function getAllCategories(): Category[] {
  return ['nginx', 'linux', 'security', 'devops', 'tooling'];
}

export function getPostBySlug(slug: string): Post | null {
  try {
    const fullPath = path.join(postsDirectory, `${slug}.md`);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);
    const meta = data as PostMeta;
    const rt = readingTime(content);

    return {
      slug,
      title: meta.title,
      date: meta.date,
      updated: meta.updated,
      excerpt: meta.excerpt,
      tags: meta.tags ?? [],
      category: (meta.category as Category) ?? 'linux',
      featured: meta.featured ?? false,
      lab: meta.lab ?? false,
      coverImage: meta.coverImage,
      readingTime: rt.text,
      content,
    };
  } catch {
    return null;
  }
}

export async function getPostWithHtml(slug: string): Promise<Post | null> {
  const post = getPostBySlug(slug);
  if (!post || !post.content) return null;

  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(post.content);

  return {
    ...post,
    content: processed.toString(),
  };
}

// Ranks by shared tags (+1 each) and same category (+1); ties keep newest first.
export function getRelatedPosts(current: Post, limit = 3): Post[] {
  const tags = new Set(current.tags.map((t) => t.toLowerCase()));
  return getAllPosts()
    .filter((p) => p.slug !== current.slug)
    .map((p) => ({
      post: p,
      score:
        p.tags.filter((t) => tags.has(t.toLowerCase())).length +
        (p.category === current.category ? 1 : 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.post);
}
