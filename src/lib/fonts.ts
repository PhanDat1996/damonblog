import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';

// JetBrains Mono — unchanged, best monospace for code blocks
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});

// Plus Jakarta Sans — modern, clean, highly legible body font.
// Replaces IBM Plex Sans: sharper at small sizes, stronger personality,
// excellent for technical content with varied weights.
export const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600'],
  display: 'swap',
  preload: false,
  adjustFontFallback: true,
});
