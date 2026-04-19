import type { Metadata } from 'next';
import { Outfit, JetBrains_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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
  metadataBase: new URL('https://damon.sec'),
  title: {
    default: 'damon.sec — Cybersecurity & Infrastructure',
    template: '%s | damon.sec',
  },
  description:
    'Technical writing on cybersecurity, infrastructure engineering, NGINX, Docker, production debugging, and security operations.',
  keywords: [
    'cybersecurity',
    'security operations',
    'nginx',
    'docker',
    'linux',
    'infrastructure',
    'troubleshooting',
    'production debugging',
  ],
  authors: [{ name: 'Damon' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'damon.sec',
    title: 'damon.sec — Cybersecurity & Infrastructure',
    description:
      'Technical writing on cybersecurity, infrastructure engineering, NGINX, Docker, production debugging, and security operations.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'damon.sec — Cybersecurity & Infrastructure',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable} ${ibmPlexSans.variable}`}>
      <body className="min-h-screen bg-zinc-950 text-zinc-300 font-sans antialiased selection:bg-green-400/20 selection:text-green-300">
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
