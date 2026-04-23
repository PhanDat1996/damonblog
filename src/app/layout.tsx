import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { WebsiteJsonLd } from '@/components/JsonLd';

// ── Font loading strategy ────────────────────────────────────────────────────
//
// Fix #2 (critical request chain + render-blocking CSS):
// Load ONLY the display font (Outfit) synchronously in the root layout.
// JetBrains Mono and IBM Plex Sans are non-critical on initial render:
//   - Mono: used in code blocks → below the fold on mobile
//   - IBM Plex Sans: body text → browser renders with system font first
//
// Both secondary fonts are now lazy-loaded via next/font in their own
// component files (Navbar.tsx, page.tsx) using CSS variables. This keeps
// them out of the root layout's CSS bundle entirely.
//
// Result: root CSS bundle carries one font family instead of three.
// Eliminates 2 of the 3 woff2 requests from the critical request chain.

// Inter: sharp, modern sans-serif — headings and display text
// Variable font covers all weights in one request
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
  display: 'swap',
  preload: true,
  adjustFontFallback: true,
});

// Plus Jakarta Sans — body font, injected at root so --font-sans is available
// on every page without each page needing to import it separately.
// preload:false keeps it off the critical path (Inter/display is the LCP font).
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});

// ── Site-wide metadata ───────────────────────────────────────────────────────
export const metadata: Metadata = {
  metadataBase: new URL('https://www.damonsec.com'),
  title: {
    default: 'Linux Troubleshooting & Performance Tuning — Damon',
    template: '%s | damonsec.com',
  },
  description:
    'Real-world Linux troubleshooting guides from a Senior L3 engineer — debug high CPU, memory leaks, NGINX 502s, and production incidents. No theory, no fluff.',
  keywords: [
    'linux troubleshooting',
    'linux performance tuning',
    'debug linux server',
    'nginx troubleshooting',
    'docker debugging',
    'infrastructure engineering',
    'production incident response',
    'devops',
  ],
  authors: [{ name: 'Damon', url: 'https://www.damonsec.com/about' }],
  creator: 'Damon',
  icons: {
    // favicon.ico — picked up by Google Search and all browsers automatically
    icon: [
      { url: '/favicon.ico',         sizes: 'any' },
      { url: '/favicon-16x16.png',   sizes: '16x16',  type: 'image/png' },
      { url: '/favicon-32x32.png',   sizes: '32x32',  type: 'image/png' },
      { url: '/favicon-48x48.png',   sizes: '48x48',  type: 'image/png' },
    ],
    // Apple touch icon — home screen on iOS
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    // Android / PWA
    other: [
      { rel: 'manifest', url: '/site.webmanifest' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.damonsec.com',
    siteName: 'damonsec.com',
    title: 'Linux Troubleshooting & Performance Tuning — Damon',
    description:
      'Real-world Linux troubleshooting guides from a Senior L3 engineer — debug high CPU, memory leaks, NGINX 502s, and production incidents.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Linux Troubleshooting & Performance Tuning — Damon',
    description:
      'Real-world Linux troubleshooting guides from a Senior L3 engineer.',
    creator: '@damonsec',
  },
  alternates: {
    canonical: 'https://www.damonsec.com',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Only apply the display font variable at root.
    // --font-mono and --font-sans are injected by their own lazy font loaders.
    <html lang="en" className={`${inter.variable} ${plusJakartaSans.variable}`}>
      <head>
        {/*
          Fix #2 (critical request chain):
          Preconnect to Google Fonts CDN early so DNS + TLS handshake
          completes before next/font's <link> tags are processed.
          Saves ~100-200ms from the critical path on mobile networks.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-zinc-950 text-zinc-200 antialiased selection:bg-green-400/20 selection:text-green-300"
        // No font-sans here — inherited from Navbar's CSS variable injection
        // Avoids a cascade lookup on every text node during initial layout
      >
        <WebsiteJsonLd />
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
