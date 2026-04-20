import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { WebsiteJsonLd } from '@/components/JsonLd';

// display: swap prevents invisible text while font loads
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],  // removed 300 — unused weight
  display: 'swap',
  preload: false,  // mono font is not above-the-fold critical
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],  // removed 300 — unused weight
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://www.damonsec.com'),
  title: {
    default: 'Damon — DevOps, NGINX & Linux Troubleshooting',
    template: '%s | damonsec.com',
  },
  description:
    'In-depth guides on NGINX 502 debugging, Linux TIME_WAIT exhaustion, Docker infrastructure, and production incident response. Written by a senior DevOps engineer from real-world systems.',
  keywords: [
    'nginx troubleshooting',
    'linux debugging',
    '502 bad gateway',
    'docker',
    'infrastructure debugging',
    'production incidents',
    'devops',
    'time_wait',
    'security operations',
  ],
  authors: [{ name: 'Damon', url: 'https://www.damonsec.com/about' }],
  creator: 'Damon',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.damonsec.com',
    siteName: 'damonsec.com',
    title: 'Damon — DevOps, NGINX & Linux Troubleshooting',
    description:
      'In-depth guides on NGINX 502 debugging, Linux TIME_WAIT exhaustion, Docker infrastructure, and production incident response.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Damon — DevOps, NGINX & Linux Troubleshooting',
    description:
      'In-depth guides on NGINX 502 debugging, Linux TIME_WAIT exhaustion, Docker infrastructure, and production incident response.',
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
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${ibmPlexSans.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-200 font-sans antialiased selection:bg-green-400/20 selection:text-green-300">
        <WebsiteJsonLd />
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}