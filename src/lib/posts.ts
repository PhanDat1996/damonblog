import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';
import remarkGfm from 'remark-gfm';
import readingTime from 'reading-time';
import type { Post, PostMeta } from '@/types/post';

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

export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tagSet = new Set<string>();
  posts.forEach((p) => p.tags.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
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
      excerpt: meta.excerpt,
      tags: meta.tags ?? [],
      featured: meta.featured ?? false,
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
