import type { Metadata } from 'next';
import { CommentModeration } from './CommentModeration';

export const metadata: Metadata = {
  title: 'CISSP comment moderation',
  robots: { index: false, follow: false },
};

export default function CisspAdminPage() {
  return <CommentModeration />;
}
