import Link from 'next/link';

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-display text-base font-bold text-white">
              damon<span className="text-green-400">.</span>sec
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              Cybersecurity & Infrastructure Engineering
            </p>
          </div>
          <nav className="flex flex-wrap gap-4">
            {[
              { href: '/', label: 'Home' },
              { href: '/blog', label: 'Blog' },
              { href: '/about', label: 'About' },
              { href: '/contact', label: 'Contact' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="font-mono text-xs text-zinc-500 hover:text-green-400 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 border-t border-zinc-800/60 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="font-mono text-xs text-zinc-600">
            © {year} Damon. All rights reserved.
          </p>
          <p className="font-mono text-xs text-zinc-600">
            <span className="text-green-400/50">$</span> Built with Next.js + Tailwind
          </p>
        </div>
      </div>
    </footer>
  );
}
