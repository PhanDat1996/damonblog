import { getStore } from '../../../../lib/cissp/comments/store.ts';
import { listComments, postComment } from '../../../../lib/cissp/comments/handlers.ts';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return listComments(req, getStore());
}

export function POST(req: Request) {
  return postComment(req, getStore(), process.env);
}
