import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

// Record the caller's Today's Pick so followers' feeds can show it. One pick
// per user per server-day; create-only (the pick is fixed for the day, so a
// re-post is ignored rather than overwriting).
export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed } = await rateLimit(`daily-pick:${auth.sub}`, 10, 60_000);
  if (!allowed) return err('Too many requests', 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType } = body as { tmdbId: string; mediaType: string };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  const tmdbId = canonicalId(String(rawId));
  if (!isValidMediaId(tmdbId)) return err('Invalid tmdbId');

  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  const existing = await prisma.dailyPick.findUnique({
    where: { userId_day: { userId: auth.sub, day } },
  });
  if (existing) return ok(null, 'Already picked today');

  try {
    await prisma.dailyPick.create({
      data: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, day },
    });
  } catch (e) {
    // Two loads racing on the same day — the unique (userId, day) constraint
    // means the loser is a no-op, which is exactly what we want.
    if ((e as { code?: string })?.code !== 'P2002') throw e;
  }

  return ok(null, 'Pick recorded');
}
