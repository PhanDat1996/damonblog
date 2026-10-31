const isDev = process.env.NODE_ENV !== 'production';

const CISSP_CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],

  // ── Legacy JS fix ─────────────────────────────────────────────────────────
  // The polyfills Lighthouse reports (Array.prototype.at, Array.prototype.flat,
  // Array.prototype.flatMap, Object.fromEntries, Object.hasOwn,
  // String.prototype.trimEnd, String.prototype.trimStart) come from
  // Next.js's bundled polyfill layer — NOT from SWC transforms.
  //
  // Next.js 13+ auto-injects polyfills via `@next/polyfill-module` based on
  // the target browsers. The fix is to declare targets explicitly so Next.js
  // knows it doesn't need to inject those polyfills at all.
  //
  // This is controlled by .browserslistrc (added to root), which Next.js
  // reads at build time to determine the polyfill set.
  //
  // Additionally, `transpilePackages` is intentionally empty — we have no
  // ESM-only packages that need transpilation, so no extra transforms run.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  experimental: {
    optimizePackageImports: ['@/components', '@/lib'],
    inlineCss: true,
  },

  // ── Merged posts ───────────────────────────────────────────────────────────
  // Overlapping posts were consolidated into one stronger page each.
  // Permanent redirects pass the old URLs' ranking signals to the new target.
  async redirects() {
    return [
      { source: '/blog/check-open-ports-linux-ss-netstat', destination: '/blog/check-open-ports-linux', permanent: true },
      { source: '/blog/check-listening-ports-linux',       destination: '/blog/check-open-ports-linux', permanent: true },
      { source: '/blog/linux-check-listening-ports-ss',    destination: '/blog/check-open-ports-linux', permanent: true },
      { source: '/blog/linux-check-disk-usage-by-folder-du', destination: '/blog/check-disk-usage-linux-du-df', permanent: true },
      // Broken internal link before the 2026-10-28 rewrite; Google still reports it as 404
      { source: '/blog/find-large-files-linux-guide',      destination: '/blog/find-large-files-linux', permanent: true },
    ];
  },

  // ── Security + cache headers ───────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // The CISSP page takes anonymous comments. Lock it down: first-party only,
        // no frames, no third-party scripts, no plugins, and it cannot be framed.
        // 'unsafe-inline' is needed for Next's inline hydration data and JSON-LD.
        source: '/cissp/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CISSP_CSP }],
      },
      {
        source: '/cissp',
        headers: [{ key: 'Content-Security-Policy', value: CISSP_CSP }],
      },
      {
        source: '/(.*)\\.(svg|ico|png|jpg|jpeg|webp|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,
};

module.exports = nextConfig;
