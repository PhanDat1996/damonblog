import { buildCategoryMetadata } from '@/app/blog/_components/CategoryPage';
import CategoryPage from '@/app/blog/_components/CategoryPage';
export const metadata = buildCategoryMetadata('tooling');
export default function ToolingCategoryPage() {
  return <CategoryPage category="tooling" />;
}
