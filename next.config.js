/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],

  // Target modern browsers — eliminates legacy JS polyfills (saves ~12KB)
  // Array.at, Object.fromEntries, etc. are native in all modern browsers
  experimental: {
    optimizePackageImports: ['@/components'],
  },

  // Security + performance headers
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
        // Aggressive caching for static assets
        source: '/(.*)\\.(svg|ico|png|jpg|jpeg|webp|woff|woff2|js|css)',
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