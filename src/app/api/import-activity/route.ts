import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const body = await req.json().catch(() => null);
  const platform = body?.platform;
  const count = body?.count;

  if (!platform || (platform !== 'letterboxd' && platform !== 'imdb')) return err('Invalid platform', 400);
  if (typeof count !== 'number' || count < 1) return err('Invalid count', 400);

  const activity = await prisma.importActivity.create({
    data: { userId: auth.sub, platform, count },
  });

  return ok(activity);
}
