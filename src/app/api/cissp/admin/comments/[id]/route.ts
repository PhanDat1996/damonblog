import { getStore } from '../../../../../../lib/cissp/comments/store.ts';
import { adminAction } from '../../../../../../lib/cissp/comments/handlers.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminAction(req, id, getStore(), process.env);
}
