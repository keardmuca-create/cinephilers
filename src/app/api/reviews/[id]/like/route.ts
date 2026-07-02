import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { canViewUserContent } from '@/lib/privacy';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: reviewId } = await params;
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true, tmdbId: true } });
  if (!review) return err('Review not found', 404);
  if (!(await canViewUserContent(auth.sub, review.userId))) return err('This account is private', 403);

  const existing = await prisma.reviewLike.findUnique({
    where: { userId_reviewId: { userId: auth.sub, reviewId } },
  });
  if (existing) return err('Already liked');

  try {
    await prisma.$transaction([
      prisma.reviewLike.create({ data: { userId: auth.sub, reviewId } }),
      prisma.review.update({ where: { id: reviewId }, data: { likesCount: { increment: 1 } } }),
    ]);
  } catch (e) {
    // Two rapid taps can both pass the existing-check; the loser's INSERT hits
    // the unique constraint (P2002). The like already exists — that's success.
    if ((e as { code?: string })?.code === 'P2002') return ok(null, 'Liked');
    throw e;
  }

  if (review.userId !== auth.sub) {
    await prisma.notification.create({
      data: { userId: review.userId, fromId: auth.sub, type: 'review_like', refId: review.tmdbId },
    }).catch(() => {});
  }

  return ok(null, 'Liked');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: reviewId } = await params;

  const deleted = await prisma.reviewLike.deleteMany({
    where: { userId: auth.sub, reviewId },
  });
  if (deleted.count > 0) {
    await prisma.review.update({ where: { id: reviewId }, data: { likesCount: { decrement: 1 } } });
  }

  return ok(null, 'Unliked');
}
