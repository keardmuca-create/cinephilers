import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

async function requireAdmin(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return { status: 'unauthenticated' as const };
  if (ADMIN_IDS.has(auth.sub)) return { status: 'ok' as const };
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return { status: 'forbidden' as const };
  return { status: 'ok' as const };
}

export async function GET(req: NextRequest) {
  const { status } = await requireAdmin(req);
  if (status === 'unauthenticated') return err('Unauthorized', 401);
  if (status === 'forbidden') return err('Forbidden', 403);

  try {
    const totalRows = await prisma.$queryRaw<{ pretty: string; bytes: number }[]>`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS pretty,
             pg_database_size(current_database())::float8 AS bytes
    `;
    const tableRows = await prisma.$queryRaw<{ name: string; pretty: string; bytes: number }[]>`
      SELECT relname AS name,
             pg_size_pretty(pg_total_relation_size(relid)) AS pretty,
             pg_total_relation_size(relid)::float8 AS bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 12
    `;

    return ok({
      total: totalRows[0]?.pretty ?? 'unknown',
      totalBytes: totalRows[0]?.bytes ?? 0,
      tables: tableRows.map(t => ({ name: t.name, size: t.pretty, bytes: t.bytes })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Query failed';
    return err(`Could not read database size: ${message}`, 500);
  }
}
