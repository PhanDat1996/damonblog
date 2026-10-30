// News note layout — same scoped prose.css as blog posts.
import '../../prose.css';
import { jetbrainsMono } from '@/lib/fonts';

export default function NewsNoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={jetbrainsMono.variable}>
      {children}
    </div>
  );
}
