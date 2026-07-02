import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { clampInt } from '@/lib/query-params';
import { canonicalId, isValidMediaId } from '@/lib/media-id';
import { MediaType } from '@/generated/prisma/client';

// Log a watch (first watch or rewatch). Every call appends a diary entry —
// this is an EVENT, not a toggle. Also keeps the WatchedItem summary row in
// sync so every existing page (history, profile, feed) works unchanged.
export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`diary:${auth.sub}`, 30, 60_000);
  if (!allowed) return err(`Too many entries. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType, watchedAt: rawDate } = body as {
    tmdbId: string; mediaType: string; watchedAt?: string;
  };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  const tmdbId = canonicalId(String(rawId));
  if (!isValidMediaId(tmdbId)) return err('Invalid tmdbId');

  // Backdating is allowed (a diary is about when you actually watched), but
  // not the future and nothing before cinema existed.
  let watchedAt = new Date();
  if (rawDate !== undefined) {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return err('Invalid watchedAt date');
    if (d.getTime() > Date.now() + 24 * 60 * 60 * 1000) return err('watchedAt cannot be in the future');
    if (d.getFullYear() < 1900) return err('watchedAt is too far in the past');
    watchedAt = d;
  }

  const priorCount = await prisma.watchEvent.count({
    where: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
  });

  const event = await prisma.watchEvent.create({
    data: {
      userId: auth.sub,
      tmdbId,
      mediaType: mediaType as MediaType,
      isRewatch: priorCount > 0,
      watchedAt,
    },
  });

  // Keep the summary row in sync: mark watched, and bump its watchedAt only
  // forward (a backdated rewatch shouldn't push a title DOWN in history).
  const existing = await prisma.watchedItem.findUnique({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    select: { watchedAt: true },
  });
  if (!existing) {
    await prisma.watchedItem.create({
      data: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType, watchedAt },
    }).catch(e => {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    });
  } else if (watchedAt > existing.watchedAt) {
    await prisma.watchedItem.update({
      where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
      data: { watchedAt },
    });
  }

  return ok({ event, count: priorCount + 1 }, priorCount > 0 ? 'Rewatch logged' : 'Watch logged', { status: 201 });
}

// The caller's own diary, newest watch first. With ?tmdbId=&mediaType= it
// returns just that title's entries (the movie page's "Seen 3x - last June 12").
export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 40, 1, 100);

  const rawId = searchParams.get('tmdbId');
  const mediaType = searchParams.get('mediaType');

  const where: { userId: string; tmdbId?: string; mediaType?: MediaType } = { userId: auth.sub };
  if (rawId && mediaType && ['MOVIE', 'SHOW'].includes(mediaType)) {
    where.tmdbId = canonicalId(rawId);
    where.mediaType = mediaType as MediaType;
  }

  const [total, items] = await Promise.all([
    prisma.watchEvent.count({ where }),
    prisma.watchEvent.findMany({
      where,
      orderBy: [{ watchedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, tmdbId: true, mediaType: true, isRewatch: true, watchedAt: true },
    }),
  ]);

  return ok({ items, page, limit, total, hasMore: page * limit < total });
}
