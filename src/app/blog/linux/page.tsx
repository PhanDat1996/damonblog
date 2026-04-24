import { buildCategoryMetadata } from '@/app/blog/_components/CategoryPage';
import CategoryPage from '@/app/blog/_components/CategoryPage';
export const metadata = buildCategoryMetadata('linux');
export default function LinuxCategoryPage() {
  return <CategoryPage category="linux" />;
}
