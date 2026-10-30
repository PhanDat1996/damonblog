// lib/tools.ts — single source of truth for the browser tools: the /tools
// index, each tool's metadata, JSON-LD, OG image, and links from posts.

import type { Metadata } from 'next';

export const BASE_URL = 'https://www.damonsec.com';

export interface WebTool {
  slug: string;
  title: string;
  glyph: string;
  tagline: string;
  input: string;
  checks: string[];
  note?: string;
  /** <title> for the tool page (the root layout appends the site name) */
  seoTitle: string;
  /** Meta description, ~150 characters */
  description: string;
  /** Short one-liner used on social cards and in post call-outs */
  pitch: string;
  /** Posts that should point readers to this tool */
  relatedPosts: string[];
}

// Browser tools — all analysis runs client-side; no config leaves the page.
export const WEB_TOOLS: WebTool[] = [
  {
    slug: 'nginx-config-analyzer',
    title: 'NGINX Config Analyzer',
    glyph: '{ }',
    tagline: 'Scored security, performance and reliability audit of any NGINX config.',
    input: 'nginx.conf, server blocks, multiple files',
    checks: [
      '40+ context-aware rules',
      'Resolves include across multiple files',
      'Request flow simulator',
      'Export findings as JSON',
    ],
    seoTitle: 'NGINX Config Analyzer — Security & Performance Audit',
    description:
      'Paste an NGINX config and get a scored audit: security headers, TLS, proxy headers, upstream keepalive, alias traversal, SSRF and more. 40+ rules, runs in your browser.',
    pitch: 'Paste a config, get findings with the exact line and a fix.',
    relatedPosts: [
      'nginx-troubleshooting-guide',
      'nginx-502-bad-gateway-fix-linux',
      'nginx-502-under-load',
      'nginx-504-gateway-timeout-fix',
      'nginx-413-request-entity-too-large',
      'nginx-upstream-keepalive',
      'nginx-rate-limiting-config',
      'nginx-ssl-hardening',
    ],
  },
  {
    slug: 'nginx-cis-hardening-checker',
    title: 'NGINX Hardening Checker',
    glyph: 'CIS',
    tagline: 'Check an NGINX config against CIS NGINX Benchmark topics and common hardening practice.',
    input: 'nginx.conf',
    checks: [
      'TLS, security headers, request limits, logging',
      'Each finding links to its config line',
      'Config fix snippet per finding',
      'Hardened baseline that passes every check',
    ],
    seoTitle: 'NGINX Hardening Checker — CIS Benchmark Topics',
    description:
      'Check an NGINX config against CIS NGINX Benchmark topics: TLS, HSTS, security headers, rate limits, timeouts and logging. Line-level findings and a hardened baseline.',
    pitch: 'TLS, headers, limits and logging, checked line by line.',
    relatedPosts: ['nginx-ssl-hardening', 'nginx-rate-limiting-config', 'linux-security-hardening-guide'],
  },
  {
    slug: 'nginx-cve-checker',
    title: 'NGINX CVE Checker',
    glyph: 'CVE',
    tagline: 'See which known CVEs affect your NGINX version and enabled modules.',
    input: 'nginx -v output or version number',
    checks: [
      'Accepts nginx/1.24.0 or plain 1.24.0',
      'Optional nginx.conf for module-aware matching',
      'Separates conditional and unconditional CVEs',
    ],
    note: 'Advisory database last updated Apr 28, 2026',
    seoTitle: 'NGINX CVE Checker — Known Vulnerabilities by Version',
    description:
      'Enter an NGINX version to see which security advisories affect it. Add your config to tell apart CVEs that need HTTP/2, QUIC, mp4 or the resolver. Runs in your browser.',
    pitch: 'Which advisories affect your NGINX version and modules.',
    relatedPosts: ['nginx-troubleshooting-guide'],
  },
  {
    slug: 'pg-hardening-checker',
    title: 'PostgreSQL Hardening Checker',
    glyph: 'PG',
    tagline: 'Hardening checks for postgresql.conf and pg_hba.conf, resolved the way PostgreSQL reads them.',
    input: 'postgresql.conf, pg_hba.conf',
    checks: [
      'Network exposure and pg_hba auth methods',
      'SSL, password hashing, audit logging',
      'Each finding links to its config line',
      'Hardened baseline for both files that passes every check',
    ],
    seoTitle: 'PostgreSQL Hardening Checker for pg_hba.conf',
    description:
      'Paste postgresql.conf and pg_hba.conf to find trust auth, open listen_addresses, missing SSL, md5 passwords and logging gaps. Findings link to lines. Runs in your browser.',
    pitch: 'postgresql.conf and pg_hba.conf, checked the way PostgreSQL reads them.',
    relatedPosts: [],
  },
];

export function getTool(slug: string): WebTool {
  const tool = WEB_TOOLS.find((t) => t.slug === slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

/** Tools to suggest at the end of a post, most specific first */
export function toolsForPost(postSlug: string, limit = 2): WebTool[] {
  return WEB_TOOLS
    .map((t) => ({ t, rank: t.relatedPosts.indexOf(postSlug) }))
    .filter(({ rank }) => rank >= 0)
    // A tool that lists the post near the top of its list is the better match
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ t }) => t);
}

/** Route metadata for a tool page; the OG image comes from the route's opengraph-image.tsx */
export function toolMetadata(slug: string): Metadata {
  const tool = getTool(slug);
  const url = `${BASE_URL}/tools/${slug}`;
  return {
    title: tool.seoTitle,
    description: tool.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${tool.title} — damonsec.com`,
      description: tool.description,
      url,
      type: 'website',
      siteName: 'damonsec.com',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${tool.title} — damonsec.com`,
      description: tool.description,
    },
  };
}

/** schema.org WebApplication + BreadcrumbList for a tool page */
export function toolJsonLd(slug: string): object[] {
  const tool = getTool(slug);
  const url = `${BASE_URL}/tools/${slug}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: tool.title,
      description: tool.description,
      url,
      image: `${url}/opengraph-image`,
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Any (runs in the browser)',
      browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      featureList: tool.checks,
      author: { '@type': 'Person', name: 'Damon', url: `${BASE_URL}/about` },
      inLanguage: 'en-US',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tools', item: `${BASE_URL}/tools` },
        { '@type': 'ListItem', position: 2, name: tool.title, item: url },
      ],
    },
  ];
}
