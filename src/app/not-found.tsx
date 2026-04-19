import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-8 font-mono text-left w-full max-w-sm">
        <p className="text-green-400 text-sm mb-1">$ curl https://damon.sec{'{path}'}</p>
        <p className="text-zinc-400 text-sm mb-3">HTTP/1.1 <span className="text-red-400 font-semibold">404 Not Found</span></p>
        <p className="text-zinc-500 text-xs">Content-Type: text/html</p>
        <p className="text-zinc-500 text-xs mb-4">Content-Length: 0</p>
        <p className="text-zinc-600 text-xs">&#x2F;&#x2F; This page doesn&apos;t exist</p>
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-white">Page Not Found</h1>
        <p className="text-zinc-400 text-sm">The resource you&apos;re looking for has been moved or never existed.</p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded-lg bg-green-400 px-5 py-2.5 font-mono text-sm font-semibold text-zinc-950 hover:bg-green-300 transition-colors"
        >
          Go home
        </Link>
        <Link
          href="/blog"
          className="rounded-lg border border-zinc-700 px-5 py-2.5 font-mono text-sm text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Read the blog
        </Link>
      </div>
    </div>
  );
}
