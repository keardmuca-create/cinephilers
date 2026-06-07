import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: reviewId } = await params;

  const comments = await prisma.reviewComment.findMany({
    where: { reviewId },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  return ok(comments.map(c => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    user: c.user,
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: reviewId } = await params;
  const { body } = await req.json();
  if (!body?.trim()) return err('Comment cannot be empty', 400);
  if (body.length > 500) return err('Comment too long', 400);

  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true, tmdbId: true } });
  if (!review) return err('Review not found', 404);

  const comment = await prisma.reviewComment.create({
    data: { reviewId, userId: auth.sub, body: body.trim() },
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });

  if (review.userId !== auth.sub) {
    await prisma.notification.create({
      data: { userId: review.userId, fromId: auth.sub, type: 'review_comment', refId: review.tmdbId },
    }).catch(() => {});
  }

  return ok({ id: comment.id, body: comment.body, createdAt: comment.createdAt.toISOString(), user: comment.user });
}
