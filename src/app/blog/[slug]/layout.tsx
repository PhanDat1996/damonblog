// Blog post layout — imports prose.css scoped to article pages only.
// plusJakartaSans is now global (injected in root layout) so only
// jetbrainsMono needs to be added here for code block font support.
import '../../prose.css';
import { jetbrainsMono } from '@/lib/fonts';

export default function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jetbrainsMono.variable}>
      {children}
    </div>
  );
}
