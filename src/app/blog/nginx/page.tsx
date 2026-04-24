import { buildCategoryMetadata } from '@/app/blog/_components/CategoryPage';
import CategoryPage from '@/app/blog/_components/CategoryPage';
export const metadata = buildCategoryMetadata('nginx');
export default function NginxCategoryPage() {
  return <CategoryPage category="nginx" />;
}
