import { buildCategoryMetadata } from '@/app/blog/_components/CategoryPage';
import CategoryPage from '@/app/blog/_components/CategoryPage';
export const metadata = buildCategoryMetadata('devops');
export default function DevOpsCategoryPage() {
  return <CategoryPage category="devops" />;
}
