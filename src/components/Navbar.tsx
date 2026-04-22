'use client';

// Fix #2: Navbar is the highest component in the tree that actually uses
// --font-mono (the logo "~/") and --font-sans (nav links). By applying
// the font variables here instead of in the root layout, we keep them
// out of the critical render path without losing any visual fidelity.
// Next.js deduplicates the font — it won't load twice if imported elsewhere.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { jetbrainsMono, ibmPlexSans } from '@/lib/fonts';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/blog', label: 'Blog' },
  { href: '/tools', label: 'Tools' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    // Inject font variables at the nav level — all descendants inherit them
    <header
      className={clsx(
        'sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md',
        jetbrainsMono.variable,
        ibmPlexSans.variable
      )}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2">
          <span className="font-mono text-xs text-green-400 opacity-60 group-hover:opacity-100 transition-opacity">
            ~/
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            damon<span className="text-green-400">.</span>sec
          </span>
        </Link>

        {/* Desktop Links */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    'px-4 py-2 rounded-md font-mono text-sm transition-all duration-200',
                    active
                      ? 'text-green-400 bg-green-400/10'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60'
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          <span className={clsx('block h-px w-6 bg-zinc-400 transition-all duration-300', open && 'rotate-45 translate-y-2.5')} />
          <span className={clsx('block h-px w-6 bg-zinc-400 transition-all duration-300', open && 'opacity-0')} />
          <span className={clsx('block h-px w-6 bg-zinc-400 transition-all duration-300', open && '-rotate-45 -translate-y-2.5')} />
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-6 py-4">
          <ul className="flex flex-col gap-2">
            {NAV_LINKS.map(({ href, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      'block px-4 py-2 rounded-md font-mono text-sm transition-all',
                      active ? 'text-green-400 bg-green-400/10' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    )}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}
