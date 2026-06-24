import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { sanitizeText } from '@/lib/sanitize';

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

  let cleanBody: string | undefined;
  if (reviewBody !== undefined) {
    cleanBody = sanitizeText(reviewBody);
    if (cleanBody.length < 10) return err('Review must be at least 10 characters');
    if (cleanBody.length > 5000) return err('Review must be under 5000 characters');
  }

  const updated = await prisma.review.update({
    where: { id },
    data: {
      ...(cleanBody !== undefined && { body: cleanBody }),
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
  if (review.userId !== auth.sub) {
    // Re-read role from the DB rather than trusting the (up to 15-min stale)
    // access-token claim, so a just-demoted admin can't delete others' reviews.
    const me = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
    if (me?.role !== 'ADMIN') return err('Forbidden', 403);
  }

  await prisma.review.delete({ where: { id } });
  await prisma.user.update({
    where: { id: review.userId },
    data: { reviewsCount: { decrement: 1 } },
  });

  return ok(null, 'Review deleted');
}
