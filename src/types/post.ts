export type Category = 'nginx' | 'linux' | 'security' | 'devops' | 'tooling';

export interface Post {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  excerpt: string;
  tags: string[];
  category: Category;
  featured?: boolean;
  lab?: boolean;
  coverImage?: string;
  readingTime: string;
  content?: string;
}

export interface PostMeta {
  title: string;
  date: string;
  updated?: string; // last substantive revision; drives dateModified + sitemap lastmod
  excerpt: string;
  tags: string[];
  category: Category;
  featured?: boolean;
  lab?: boolean; // commands and output were run on the lab VM
  coverImage?: string;
}
