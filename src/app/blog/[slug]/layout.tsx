// Blog post layout — imports prose.css scoped to article pages only.
// This prevents .prose styles from being bundled into the global CSS,
// which reduces the render-blocking CSS on homepage, /tools, /about, etc.
import '../../prose.css';

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
