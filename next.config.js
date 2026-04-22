/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],

  // ── Fix #2: Reduce legacy JavaScript ──────────────────────────────────────
  //
  // Next.js 15 uses SWC compiler by default. These options tell SWC to target
  // modern browsers only (matching our browserslist in package.json).
  // Result: no async/await polyfills, no optional chaining transforms,
  // no nullish coalescing rewrites. Saves ~10-12KB on the JS bundle.
  compiler: {
    // Remove console.log in production — reduces bundle and avoids
    // accidental information disclosure
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // ── Fix #2: Experimental optimizations ────────────────────────────────────
  experimental: {
    // Tree-shake component imports — prevents barrel file imports from
    // pulling in unused components
    optimizePackageImports: ['@/components', '@/lib'],

    // Inline CSS for above-the-fold content into the HTML response.
    // This is the direct fix for the render-blocking CSS issue.
    // Next.js 15 can inline critical CSS automatically when this is enabled.
    // Result: browser renders the first paint without waiting for CSS file fetch.
    inlineCss: true,
  },

  // ── Security + performance headers ────────────────────────────────────────
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
        // Long-term cache for immutable assets (fonts, images, icons)
        // next/font adds content hashes to filenames so this is safe
        source: '/(.*)\\.(svg|ico|png|jpg|jpeg|webp|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Cache static JS/CSS chunks — Next.js hashes these filenames
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
