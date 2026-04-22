// Lazy font loader — imported only in components that need these fonts.
//
// Fix #2 (critical request chain):
// JetBrains Mono and IBM Plex Sans are NOT imported in the root layout.
// Instead, components import this file when they actually need a font.
// Next.js deduplicates font requests automatically — if two components
// import the same font config, only one <link> is emitted.
//
// This removes 2 woff2 requests from the critical request chain.
// They still load, but asynchronously — after LCP has already painted.

import { JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],   // Removed 600 — not used in code blocks
  display: 'swap',
  preload: false,           // Non-critical: code blocks are below fold on mobile
  adjustFontFallback: false,
});

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500'],   // Removed 600 — headings use Outfit
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});
