import { JetBrains_Mono } from 'next/font/google';

// JetBrains Mono — code blocks only.
// Plus Jakarta Sans has been moved to the root layout (src/app/layout.tsx)
// so --font-sans is available globally on every page.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});
