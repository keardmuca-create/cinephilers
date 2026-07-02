import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    include: { reporter: { select: { id: true, username: true, displayName: true } } },
  });

  // Enrich with content preview — batched (two queries total, not one per report)
  const reviewIds = reports.filter(r => r.targetType === 'review').map(r => r.targetId);
  const commentIds = reports.filter(r => r.targetType === 'comment').map(r => r.targetId);
  const [reviews, comments] = await Promise.all([
    reviewIds.length
      ? prisma.review.findMany({
          where: { id: { in: reviewIds } },
          select: { id: true, body: true, user: { select: { username: true } } },
        })
      : Promise.resolve([]),
    commentIds.length
      ? prisma.reviewComment.findMany({
          where: { id: { in: commentIds } },
          select: { id: true, body: true, user: { select: { username: true } } },
        })
      : Promise.resolve([]),
  ]);
  const reviewById = new Map(reviews.map(r => [r.id, r]));
  const commentById = new Map(comments.map(c => [c.id, c]));

  const enriched = reports.map(r => {
    const target = r.targetType === 'review' ? reviewById.get(r.targetId)
      : r.targetType === 'comment' ? commentById.get(r.targetId)
      : undefined;
    return { ...r, content: target?.body ?? null, authorUsername: target?.user.username ?? null };
  });

  return ok(enriched);
}

export async function PATCH(req: NextRequest) {
  const { status: adminStatus } = await requireAdmin(req);
  if (adminStatus === 'unauthenticated') return err('Unauthorized', 401);
  if (adminStatus === 'forbidden') return err('Forbidden', 403);

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !['reviewed', 'dismissed'].includes(status)) return err('Invalid');

  await prisma.report.update({ where: { id }, data: { status } });
  return ok(null, 'Report updated');
}

export async function DELETE(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const { reportId, targetType, targetId } = await req.json().catch(() => ({}));

  // Delete the reported content. Reviews also decrement the author's
  // reviewsCount, same as the normal delete path — otherwise every moderation
  // action permanently skews that user's profile stats and badges.
  if (targetType === 'review') {
    const review = await prisma.review.findUnique({ where: { id: targetId }, select: { userId: true } });
    if (review) {
      await prisma.review.delete({ where: { id: targetId } }).catch(() => {});
      await prisma.user.update({
        where: { id: review.userId },
        data: { reviewsCount: { decrement: 1 } },
      }).catch(() => {});
    }
  } else if (targetType === 'comment') {
    await prisma.reviewComment.delete({ where: { id: targetId } }).catch(() => {});
  }

  // Mark report as reviewed
  await prisma.report.update({ where: { id: reportId }, data: { status: 'reviewed' } }).catch(() => {});

  return ok(null, 'Content deleted');
}
