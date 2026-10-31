import { getStore } from '../../../../../lib/cissp/comments/store.ts';
import { adminList } from '../../../../../lib/cissp/comments/handlers.ts';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return adminList(req, getStore(), process.env);
}
