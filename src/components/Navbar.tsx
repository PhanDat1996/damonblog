'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { jetbrainsMono, plusJakartaSans } from '@/lib/fonts';

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
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close  = useCallback(() => setOpen(false), []);

  return (
    <header
      className={clsx(
        'sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/95',
        jetbrainsMono.variable,
        plusJakartaSans.variable
      )}
    >
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-center gap-2">
          <span className="font-mono text-xs text-green-400 opacity-60 group-hover:opacity-100 transition-opacity">
            ~/
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            damon<span className="text-green-400">.</span>sec
          </span>
        </Link>

        {/* Desktop links — server-renderable, no JS needed */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    'px-4 py-2 rounded-md font-mono text-sm transition-colors duration-150',
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
          className="md:hidden flex flex-col justify-center gap-1.5 p-2 w-10 h-10"
          onClick={toggle}
          aria-label="Toggle menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <span className={clsx(
            'block h-px w-6 bg-zinc-400 transition-transform duration-200 origin-center',
            open && 'rotate-45 translate-y-[3.5px]'
          )} />
          <span className={clsx(
            'block h-px w-6 bg-zinc-400 transition-opacity duration-200',
            open ? 'opacity-0' : 'opacity-100'
          )} />
          <span className={clsx(
            'block h-px w-6 bg-zinc-400 transition-transform duration-200 origin-center',
            open && '-rotate-45 -translate-y-[3.5px]'
          )} />
        </button>
      </nav>

      {/* Mobile menu — hidden by default, no layout cost when closed */}
      <div
        id="mobile-menu"
        className={clsx(
          'md:hidden border-t border-zinc-800 bg-zinc-950 px-6 overflow-hidden transition-all duration-200',
          open ? 'max-h-64 py-4' : 'max-h-0 py-0'
          // max-h transition instead of conditional render —
          // avoids mount/unmount layout recalculation on each toggle
        )}
      >
        <ul className="flex flex-col gap-2">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={close}
                  className={clsx(
                    'block px-4 py-2 rounded-md font-mono text-sm',
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
    </header>
  );
}
