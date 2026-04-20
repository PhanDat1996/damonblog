import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { WebsiteJsonLd } from '@/components/JsonLd';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500', '600'],
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600'],
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
  authors: [{ name: 'Damon', url: 'https://damonsec.com/about' }],
  creator: 'Damon',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://damonsec.com',
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
    canonical: 'https://damonsec.com',
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
      <body className="min-h-screen bg-zinc-950 text-zinc-300 font-sans antialiased selection:bg-green-400/20 selection:text-green-300">
        <WebsiteJsonLd />
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}