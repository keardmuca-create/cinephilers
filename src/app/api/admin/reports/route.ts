import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { requireAdmin } from '@/lib/admin-auth';
import { writeAudit } from '@/lib/audit';

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
          select: { id: true, body: true, hidden: true, user: { select: { username: true } } },
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
    // `hidden` = a review that was soft-removed and can be restored. Comments
    // are hard-deleted, so their content simply goes null when removed.
    const hidden = r.targetType === 'review' ? (reviewById.get(r.targetId)?.hidden ?? false) : false;
    return { ...r, content: target?.body ?? null, authorUsername: target?.user.username ?? null, hidden };
  });

  return ok(enriched);
}

export async function PATCH(req: NextRequest) {
  const { status: adminStatus } = await requireAdmin(req);
  const limited = await writeLimit(req);
  if (limited) return limited;
  if (adminStatus === 'unauthenticated') return err('Unauthorized', 401);
  if (adminStatus === 'forbidden') return err('Forbidden', 403);

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !['reviewed', 'dismissed'].includes(status)) return err('Invalid');

  await prisma.report.update({ where: { id }, data: { status } });
  return ok(null, 'Report updated');
}

export async function DELETE(req: NextRequest) {
  const { auth, status } = await requireAdmin(req);
  const limited = await writeLimit(req);
  if (limited) return limited;
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const { reportId, targetType, targetId } = await req.json().catch(() => ({}));

  // Remove the reported content. REVIEWS are soft-removed (hidden=true) so the
  // action can be undone via Restore below; comments are hard-deleted. Either
  // way the author's reviewsCount is decremented so profile stats stay accurate.
  if (targetType === 'review') {
    const review = await prisma.review.findUnique({
      where: { id: targetId },
      select: { userId: true, hidden: true, user: { select: { username: true } } },
    });
    if (review && !review.hidden) {
      await prisma.review.update({ where: { id: targetId }, data: { hidden: true } }).catch(() => {});
      await prisma.user.update({
        where: { id: review.userId },
        data: { reviewsCount: { decrement: 1 } },
      }).catch(() => {});
      // Inside the !hidden branch on purpose: removing an already-removed review
      // changes nothing, and a log that records non-events is a log nobody reads.
      await writeAudit({
        action: 'REVIEW_HIDDEN',
        actorId: auth?.sub ?? null,
        actorUsername: auth?.username ?? null,
        targetId,
        targetLabel: review.user.username,
        details: { reportId: reportId ?? null, authorId: review.userId },
      }, req);
    }
  } else if (targetType === 'comment') {
    // Comments are HARD deleted — after this line the body, its author and the
    // fact it ever existed are gone, so the audit row is the only trace.
    const comment = await prisma.reviewComment.findUnique({
      where: { id: targetId },
      select: { userId: true, user: { select: { username: true } } },
    }).catch(() => null);
    const deleted = await prisma.reviewComment.delete({ where: { id: targetId } })
      .then(() => true).catch(() => false);
    if (deleted) {
      await writeAudit({
        action: 'COMMENT_DELETED',
        actorId: auth?.sub ?? null,
        actorUsername: auth?.username ?? null,
        targetId,
        targetLabel: comment?.user.username ?? null,
        details: { reportId: reportId ?? null, authorId: comment?.userId ?? null },
      }, req);
    }
  }

  // Mark report as reviewed
  await prisma.report.update({ where: { id: reportId }, data: { status: 'reviewed' } }).catch(() => {});

  return ok(null, 'Content removed');
}

// Restore a soft-removed review (undo a moderation removal). Un-hides it and
// re-increments the author's reviewsCount; the report is marked dismissed.
export async function POST(req: NextRequest) {
  const { auth, status } = await requireAdmin(req);
  const limited = await writeLimit(req);
  if (limited) return limited;
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const { reportId, targetType, targetId } = await req.json().catch(() => ({}));
  if (targetType !== 'review') return err('Only reviews can be restored', 400);

  const review = await prisma.review.findUnique({
    where: { id: targetId },
    select: { userId: true, hidden: true, user: { select: { username: true } } },
  });
  if (!review) return err('Review no longer exists', 404);

  if (review.hidden) {
    await prisma.review.update({ where: { id: targetId }, data: { hidden: false } }).catch(() => {});
    await prisma.user.update({
      where: { id: review.userId },
      data: { reviewsCount: { increment: 1 } },
    }).catch(() => {});
    await writeAudit({
      action: 'REVIEW_RESTORED',
      actorId: auth?.sub ?? null,
      actorUsername: auth?.username ?? null,
      targetId,
      targetLabel: review.user.username,
      details: { reportId: reportId ?? null, authorId: review.userId },
    }, req);
  }

  if (reportId) {
    await prisma.report.update({ where: { id: reportId }, data: { status: 'dismissed' } }).catch(() => {});
  }

  return ok(null, 'Review restored');
}
