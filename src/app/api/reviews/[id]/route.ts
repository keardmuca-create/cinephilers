import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review) return err('Review not found', 404);
  if (review.userId !== auth.sub) return err('Forbidden', 403);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { body: reviewBody, containsSpoiler } = body as { body?: string; containsSpoiler?: boolean };
  if (reviewBody && reviewBody.trim().length < 10) return err('Review must be at least 10 characters');

  const updated = await prisma.review.update({
    where: { id },
    data: {
      ...(reviewBody && { body: reviewBody.trim() }),
      ...(containsSpoiler !== undefined && { containsSpoiler }),
    },
  });

  return ok(updated, 'Review updated');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { id } = await params;
  const review = await prisma.review.findUnique({ where: { id }, select: { userId: true } });
  if (!review) return err('Review not found', 404);
  if (review.userId !== auth.sub && auth.role !== 'ADMIN') return err('Forbidden', 403);

  await prisma.review.delete({ where: { id } });
  await prisma.user.update({
    where: { id: auth.sub },
    data: { reviewsCount: { decrement: 1 } },
  });

  return ok(null, 'Review deleted');
}
