// Blog post layout — imports prose.css scoped to article pages only.
// Also injects font CSS variables so --font-sans and --font-display
// resolve correctly inside .prose content.
import '../../prose.css';
import { plusJakartaSans, jetbrainsMono } from '@/lib/fonts';
import { clsx } from 'clsx';

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={clsx(plusJakartaSans.variable, jetbrainsMono.variable)}>
      {children}
    </div>
  );
}
