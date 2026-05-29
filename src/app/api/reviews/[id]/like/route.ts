import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id: reviewId } = await params;
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
  if (!review) return err('Review not found', 404);

  const existing = await prisma.reviewLike.findUnique({
    where: { userId_reviewId: { userId: auth.sub, reviewId } },
  });
  if (existing) return err('Already liked');

  await prisma.$transaction([
    prisma.reviewLike.create({ data: { userId: auth.sub, reviewId } }),
    prisma.review.update({ where: { id: reviewId }, data: { likesCount: { increment: 1 } } }),
  ]);

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
