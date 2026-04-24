export type Category = 'nginx' | 'linux' | 'security' | 'devops' | 'tooling';

export interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  category: Category;
  featured?: boolean;
  coverImage?: string;
  readingTime: string;
  content?: string;
}

export interface PostMeta {
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  category: Category;
  featured?: boolean;
  coverImage?: string;
}
