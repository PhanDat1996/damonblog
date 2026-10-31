import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /_next/ holds the CSS/JS Googlebot needs to render pages, so it stays crawlable
        disallow: ['/api/', '/cissp/admin'],
      },
    ],
    sitemap: 'https://www.damonsec.com/sitemap.xml',
    host: 'https://www.damonsec.com',
  };
}