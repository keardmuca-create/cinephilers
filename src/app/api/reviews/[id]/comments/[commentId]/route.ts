import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { commentId } = await params;
  const comment = await prisma.reviewComment.findUnique({ where: { id: commentId }, select: { id: true, userId: true } });
  if (!comment) return err('Comment not found', 404);
  if (comment.userId !== auth.sub) return err('Forbidden', 403);

  await prisma.reviewComment.delete({ where: { id: commentId } });
  return ok(null, 'Deleted');
}
