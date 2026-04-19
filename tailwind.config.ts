import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Syne', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        border: 'hsl(var(--border))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          muted: 'hsl(var(--accent-muted))',
        },
        text: {
          primary: 'hsl(var(--text-primary))',
          secondary: 'hsl(var(--text-secondary))',
          muted: 'hsl(var(--text-muted))',
        },
        tag: {
          red: 'hsl(var(--tag-red))',
          green: 'hsl(var(--tag-green))',
          blue: 'hsl(var(--tag-blue))',
          yellow: 'hsl(var(--tag-yellow))',
          purple: 'hsl(var(--tag-purple))',
          cyan: 'hsl(var(--tag-cyan))',
        },
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'hsl(var(--text-primary))',
            '--tw-prose-headings': 'hsl(var(--text-primary))',
            '--tw-prose-code': 'hsl(var(--accent))',
            '--tw-prose-pre-bg': 'hsl(var(--surface))',
          },
        },
      },
    },
  },
  plugins: [],
}
export default config
