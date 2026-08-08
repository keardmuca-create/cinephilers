import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';
import { localDay } from '@/lib/local-day';
import { MediaType } from '@/generated/prisma/client';

// The caller's own calendar day, from the IANA zone stored on their account.
// Was UTC for everybody, which meant the pick reset at 2am in Albania and at 5pm
// in California — where someone could then generate a second pick in the same
// evening. Falls back to UTC until a device has reported a zone.
async function todayFor(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return localDay(user?.timezone);
}

// How many days a title stays out of the running after being picked, so the
// same film can't come up two days in a row.
const NO_REPEAT_DAYS = 14;

// Today's Pick for the caller — the server is the source of truth so every
// device shows the same pick and it matches the feed. `pick` is null when it
// hasn't been generated yet; `recent` is what to avoid picking again.
export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const since = new Date(Date.now() - NO_REPEAT_DAYS * 24 * 60 * 60 * 1000);
  const day = await todayFor(auth.sub);
  const [pick, recent] = await Promise.all([
    prisma.dailyPick.findUnique({ where: { userId_day: { userId: auth.sub, day } } }),
    prisma.dailyPick.findMany({
      where: { userId: auth.sub, createdAt: { gte: since } },
      select: { tmdbId: true },
    }),
  ]);

  return ok({
    pick: pick ? { tmdbId: pick.tmdbId, mediaType: pick.mediaType } : null,
    recent: [...new Set(recent.map(r => r.tmdbId))],
  });
}

// Record Today's Pick. One per user per day, create-only (the pick is a
// commitment — a second generate on any device is ignored and the first,
// authoritative pick is returned instead, keeping every device consistent).
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

  const day = await todayFor(auth.sub);

  const existing = await prisma.dailyPick.findUnique({
    where: { userId_day: { userId: auth.sub, day } },
  });
  // Already picked today (this or another device) — return the winning pick so
  // the caller shows the authoritative one, not its own local roll.
  if (existing) return ok({ tmdbId: existing.tmdbId, mediaType: existing.mediaType });

  try {
    const created = await prisma.dailyPick.create({
      data: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, day },
    });
    return ok({ tmdbId: created.tmdbId, mediaType: created.mediaType });
  } catch (e) {
    // Race: another request created it first. Return that one.
    if ((e as { code?: string })?.code === 'P2002') {
      const winner = await prisma.dailyPick.findUnique({ where: { userId_day: { userId: auth.sub, day } } });
      if (winner) return ok({ tmdbId: winner.tmdbId, mediaType: winner.mediaType });
    }
    throw e;
  }
}
