import { buildCategoryMetadata } from '@/app/blog/_components/CategoryPage';
import CategoryPage from '@/app/blog/_components/CategoryPage';
export const metadata = buildCategoryMetadata('security');
export default function SecurityCategoryPage() {
  return <CategoryPage category="security" />;
}
