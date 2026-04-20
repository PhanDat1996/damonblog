import type { Post } from '@/types/post';

interface BlogPostJsonLdProps {
  post: Post;
  url: string;
}

export function BlogPostJsonLd({ post, url }: BlogPostJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    author: {
      '@type': 'Person',
      name: 'Damon',
      url: 'https://damonsec.com/about',
    },
    publisher: {
      '@type': 'Person',
      name: 'Damon',
      url: 'https://damonsec.com',
    },
    datePublished: post.date,
    dateModified: post.date,
    url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    keywords: post.tags.join(', '),
    inLanguage: 'en-US',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function WebsiteJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'damonsec.com',
    url: 'https://damonsec.com',
    description:
      'In-depth guides on NGINX debugging, Linux networking, Docker infrastructure, and production incident response.',
    author: {
      '@type': 'Person',
      name: 'Damon',
      jobTitle: 'Senior Technical Support Engineer',
      worksFor: {
        '@type': 'Organization',
        name: 'OPSWAT',
      },
      url: 'https://damonsec.com/about',
    },
    inLanguage: 'en-US',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}