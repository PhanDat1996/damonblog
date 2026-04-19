export interface Post {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
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
  featured?: boolean;
  coverImage?: string;
}
