import Link from 'next/link';
import { getTagColor } from '@/lib/utils';
import clsx from 'clsx';

interface TagBadgeProps {
  tag: string;
  linked?: boolean;
  size?: 'sm' | 'md';
}

export default function TagBadge({ tag, linked = true, size = 'sm' }: TagBadgeProps) {
  const classes = clsx(
    'inline-flex items-center rounded border font-mono font-medium tracking-tight transition-opacity hover:opacity-80',
    getTagColor(tag),
    size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
  );

  if (linked) {
    return (
      <Link href={`/blog?tag=${encodeURIComponent(tag)}`} className={classes}>
        #{tag}
      </Link>
    );
  }

  return <span className={classes}>#{tag}</span>;
}
