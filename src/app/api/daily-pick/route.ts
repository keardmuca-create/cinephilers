import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

function today(): string {
  return new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

// Today's Pick for the caller — the server is the source of truth so every
// device shows the same pick and it matches the feed. null = not generated yet.
export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const pick = await prisma.dailyPick.findUnique({
    where: { userId_day: { userId: auth.sub, day: today() } },
  });
  return ok(pick ? { tmdbId: pick.tmdbId, mediaType: pick.mediaType } : null);
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

  const day = today();

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
