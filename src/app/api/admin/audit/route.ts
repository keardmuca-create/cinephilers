import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// Read-only by design. There is no POST, PATCH or DELETE here and there should
// never be one: the value of an audit log is that the app cannot rewrite it.
// Rows are written by writeAudit at the point the action happens; this endpoint
// only reads them back.
export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const action = params.get('action')?.trim() || undefined;
  // One id, matched against either end of the event: "show me everything about
  // this account" means both what was done TO them and what they did.
  const subject = params.get('subject')?.trim() || undefined;

  const where = {
    ...(action ? { action: action as never } : {}),
    ...(subject ? { OR: [{ actorId: subject }, { targetId: subject }] } : {}),
  };

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return paginated(rows, page, PAGE_SIZE, total);
  } catch (e) {
    console.error('admin audit GET error:', e);
    return err('Internal error', 500);
  }
}
