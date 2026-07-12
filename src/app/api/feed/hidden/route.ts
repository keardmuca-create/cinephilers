import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

const TYPES = ['watched', 'rewatched', 'rated', 'reviewed'];

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { type, tmdbId } = body as { type: string; tmdbId: string };
  if (!type || !tmdbId) return err('type and tmdbId are required');
  if (!TYPES.includes(type)) return err('type must be watched, rewatched, rated, or reviewed');

  const item = await prisma.hiddenActivity.upsert({
    where: { userId_type_tmdbId: { userId: auth.sub, type, tmdbId } },
    create: { userId: auth.sub, type, tmdbId },
    update: {},
  });

  return ok(item, 'Activity hidden', { status: 201 });
}
