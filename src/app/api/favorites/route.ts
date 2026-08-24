import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';
import { MediaType } from '@/generated/prisma/client';
import { canonicalId, isValidMediaId } from '@/lib/media-id';

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { tmdbId: rawId, mediaType } = body as { tmdbId: string; mediaType: string };
  if (!rawId || !mediaType) return err('tmdbId and mediaType are required');
  if (!['MOVIE', 'SHOW'].includes(mediaType)) return err('mediaType must be MOVIE or SHOW');
  const tmdbId = canonicalId(String(rawId));
  if (!isValidMediaId(tmdbId)) return err('Invalid tmdbId');

  const count = await prisma.favorite.count({ where: { userId: auth.sub } });
  if (count >= 10) return err('Maximum 10 favorites allowed');

  const item = await prisma.favorite.upsert({
    where: { userId_tmdbId_mediaType: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType } },
    create: { userId: auth.sub, tmdbId, mediaType: mediaType as MediaType },
    update: {},
  });

  return ok(item, 'Added to favorites', { status: 201 });
}

// PUT /api/favorites — save the order of the favourites ring.
//
// Arrange mode used to write only to the device. The list is rebuilt from the
// database every time the profile page loads, so a rearrangement survived until
// the next page view and then quietly went back to the order things were added
// in. It looked saved and never was.
//
// The order lives in addedAt rather than a new column. That field is read in
// exactly three places — this route's ordering, the sync payload, and the data
// export — and is never shown to anyone as a date, so it can carry the sequence
// without a schema change. The trade is that a rearranged favourite reports its
// reorder time in an export rather than when it was first added; nothing in the
// app reads it, and the alternative costs a migration run by hand against the
// live database.
export async function PUT(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { items } = body as { items?: { tmdbId: string; mediaType: string }[] };
  if (!Array.isArray(items)) return err('items array is required');
  if (items.length === 0) return ok(null, 'Order saved');
  if (items.length > 10) return err('Maximum 10 favorites allowed');

  const rows: { tmdbId: string; mediaType: MediaType }[] = [];
  for (const raw of items) {
    if (!raw?.tmdbId || !['MOVIE', 'SHOW'].includes(raw.mediaType)) return err('Invalid item');
    const tmdbId = canonicalId(String(raw.tmdbId));
    if (!isValidMediaId(tmdbId)) return err('Invalid tmdbId');
    rows.push({ tmdbId, mediaType: raw.mediaType as MediaType });
  }

  // Spaced a second apart, ending now, so the sequence is unambiguous and a
  // later reorder always sorts after an untouched favourite rather than
  // interleaving with one.
  const base = Date.now() - rows.length * 1000;

  // One transaction: a half-applied reorder would leave two favourites claiming
  // the same position, and which one won would depend on row order.
  await prisma.$transaction(
    rows.map((r, i) =>
      prisma.favorite.updateMany({
        where: { userId: auth.sub, tmdbId: r.tmdbId, mediaType: r.mediaType },
        data: { addedAt: new Date(base + i * 1000) },
      }),
    ),
  );

  return ok(null, 'Order saved');
}
