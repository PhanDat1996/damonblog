import type { Post } from '@/types/post';

interface BlogPostJsonLdProps {
  post: Post;
  url: string;
  wordCount?: number;
  faqItems?: Array<{ question: string; answer: string }>;
}

// Fix #3: Extract FAQ items from post HTML content
export function extractFaqFromHtml(html: string): Array<{ question: string; answer: string }> {
  const faqs: Array<{ question: string; answer: string }> = [];
  // Match bold FAQ questions followed by paragraph answers
  // Pattern: <strong>Question?</strong>\n<p>Answer</p>
  const strongPattern = /<strong>([^<]+\?)<\/strong>\s*\n?([^<]*(?:<(?!strong|\/strong)[^>]*>[^<]*<\/[^>]+>[^<]*)*)/gi;
  let match;
  while ((match = strongPattern.exec(html)) !== null) {
    const question = match[1].trim();
    // Strip HTML tags from answer
    const answer = match[2].replace(/<[^>]+>/g, '').trim();
    if (question && answer && answer.length > 20) {
      faqs.push({ question, answer });
    }
  }
  return faqs.slice(0, 5); // max 5 FAQ items
}

export function BlogPostJsonLd({ post, url, wordCount, faqItems }: BlogPostJsonLdProps) {
  // Fix #3: Enhanced Article schema with image and wordCount
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: `https://www.damonsec.com/api/og?title=${encodeURIComponent(post.title)}`,
    author: {
      '@type': 'Person',
      name: 'Damon',
      url: 'https://www.damonsec.com/about',
      jobTitle: 'Senior Technical Support Engineer',
      worksFor: {
        '@type': 'Organization',
        name: 'OPSWAT',
      },
    },
    publisher: {
      '@type': 'Person',
      name: 'Damon',
      url: 'https://www.damonsec.com',
    },
    datePublished: new Date(post.date).toISOString(),
    dateModified: new Date(post.date).toISOString(),
    url,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    keywords: post.tags.join(', '),
    inLanguage: 'en-US',
    ...(wordCount ? { wordCount } : {}),
  };

  // Fix #3: FAQ schema for posts with FAQ sections
  const faqJsonLd = faqItems && faqItems.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map(({ question, answer }) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer,
          },
        })),
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
    </>
  );
}

export function WebsiteJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'damonsec.com',
    url: 'https://www.damonsec.com',
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
      url: 'https://www.damonsec.com/about',
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
