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
