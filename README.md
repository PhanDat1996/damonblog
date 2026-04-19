# damon.sec — Personal Technical Blog

A clean, dark-themed personal blog built with Next.js 14 App Router, TypeScript, and Tailwind CSS. Deployable to Vercel in one click.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Content:** Local Markdown files with gray-matter
- **Fonts:** Syne (display), JetBrains Mono, IBM Plex Sans
- **Deployment:** Vercel

## Features

- ✅ Home page with animated terminal hero
- ✅ Blog list page with tag filtering
- ✅ Blog detail pages rendered from Markdown
- ✅ About page with timeline + skills
- ✅ Contact page
- ✅ Featured posts section
- ✅ Reading time estimation
- ✅ Tag badges with per-topic colors
- ✅ Reading progress bar on posts
- ✅ Prev/next post navigation
- ✅ SEO metadata + Open Graph
- ✅ Responsive layout (mobile + desktop)
- ✅ Sticky navbar with mobile hamburger menu
- ✅ Custom prose styles for Markdown content
- ✅ Static generation (all pages pre-rendered)

## Project Structure

```
damon-blog/
├── posts/                        # Markdown blog posts
│   ├── nginx-502-under-load.md
│   ├── docker-log-rotation.md
│   └── ...
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Home page
│   │   ├── globals.css           # Global styles + prose
│   │   ├── not-found.tsx         # 404 page
│   │   ├── blog/
│   │   │   ├── page.tsx          # Blog list
│   │   │   └── [slug]/page.tsx   # Blog post detail
│   │   ├── about/page.tsx
│   │   └── contact/page.tsx
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── PostCard.tsx
│   │   ├── TagBadge.tsx
│   │   ├── TerminalHero.tsx
│   │   └── ReadingProgress.tsx
│   ├── lib/
│   │   ├── posts.ts              # Markdown reading/parsing
│   │   └── utils.ts              # Tag colors, date formatting
│   └── types/
│       └── post.ts               # TypeScript types
├── tailwind.config.ts
├── next.config.js
└── vercel.json
```

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Writing Posts

Create a new `.md` file in the `posts/` directory:

```markdown
---
title: "Your Post Title"
date: "2024-12-01"
excerpt: "A short description that appears in post cards and SEO."
tags: ["nginx", "debugging", "production"]
featured: true
---

## Your content here

Write in standard Markdown. Code blocks, tables, and blockquotes are all styled.
```

**Frontmatter fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `title` | ✅ | Post title |
| `date` | ✅ | ISO date `YYYY-MM-DD` |
| `excerpt` | ✅ | Short summary |
| `tags` | ✅ | Array of tag strings |
| `featured` | ❌ | Show in featured section on home page |

**Supported tags** (with preset colors):
`nginx`, `docker`, `security`, `logs`, `linux`, `troubleshooting`, `debugging`, `monitoring`, `ssl`, `firewall`, `incident`, `networking`, `security-ops`, `production`, `infrastructure`

Any other tag will use a neutral gray badge.

## Deploying to Vercel

### Option 1: Vercel CLI

```bash
npm i -g vercel
vercel
```

### Option 2: GitHub Integration

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your repository
4. Deploy — Vercel auto-detects Next.js, no config needed

That's it. All pages are statically generated at build time.

## Customisation

**Change your name/domain:**
- `src/app/layout.tsx` — update `metadata` object
- `src/components/Navbar.tsx` — update the logo text
- `src/components/Footer.tsx` — update footer copy
- `src/app/about/page.tsx` — update bio, skills, timeline

**Change the accent color:**
Swap `green` for any Tailwind color in `globals.css` and throughout components. The green is set via Tailwind utilities (`text-green-400`, `bg-green-400`, etc).

**Add tag colors:**
Edit `src/lib/utils.ts` — add your tag to `TAG_COLORS` with Tailwind classes.
