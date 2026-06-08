import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

async function requireAdmin(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return null;
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return null;
  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return err('Forbidden', 403);

  const reports = await prisma.report.findMany({
    orderBy: { createdAt: 'desc' },
    include: { reporter: { select: { id: true, username: true, displayName: true } } },
  });

  // Enrich with content preview
  const enriched = await Promise.all(reports.map(async r => {
    let content: string | null = null;
    let authorUsername: string | null = null;
    try {
      if (r.targetType === 'review') {
        const review = await prisma.review.findUnique({
          where: { id: r.targetId },
          select: { body: true, user: { select: { username: true } } },
        });
        content = review?.body ?? null;
        authorUsername = review?.user.username ?? null;
      } else if (r.targetType === 'comment') {
        const comment = await prisma.reviewComment.findUnique({
          where: { id: r.targetId },
          select: { body: true, user: { select: { username: true } } },
        });
        content = comment?.body ?? null;
        authorUsername = comment?.user.username ?? null;
      }
    } catch { /* ignore */ }
    return { ...r, content, authorUsername };
  }));

  return ok(enriched);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return err('Forbidden', 403);

  const { id, status } = await req.json().catch(() => ({}));
  if (!id || !['reviewed', 'dismissed'].includes(status)) return err('Invalid');

  await prisma.report.update({ where: { id }, data: { status } });
  return ok(null, 'Report updated');
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return err('Forbidden', 403);

  const { reportId, targetType, targetId } = await req.json().catch(() => ({}));

  // Delete the reported content
  if (targetType === 'review') {
    await prisma.review.delete({ where: { id: targetId } }).catch(() => {});
  } else if (targetType === 'comment') {
    await prisma.reviewComment.delete({ where: { id: targetId } }).catch(() => {});
  }

  // Mark report as reviewed
  await prisma.report.update({ where: { id: reportId }, data: { status: 'reviewed' } }).catch(() => {});

  return ok(null, 'Content deleted');
}
