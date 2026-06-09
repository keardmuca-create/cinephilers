import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

async function requireAdmin(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return { auth: null, status: 'unauthenticated' as const };
  if (ADMIN_IDS.has(auth.sub)) return { auth, status: 'ok' as const };
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return { auth: null, status: 'forbidden' as const };
  return { auth, status: 'ok' as const };
}

export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

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
