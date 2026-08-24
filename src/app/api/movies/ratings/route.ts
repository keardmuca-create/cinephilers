import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MediaType } from '@/generated/prisma/client';
import { MIN_CINEPHILERS_RATINGS } from '@/lib/cinephilers-rating';
import { canonicalId, isShowId, isEpisodeId } from '@/lib/media-id';
import { rateLimit, getIp } from '@/lib/rate-limit';

// Batch sibling of /api/movies/rating: the Cinephilers aggregate for many
// titles in one request.
//
// Every list in the app — recently viewed, watchlist, history, a profile — needs
// the same answer the film page needs, and asking per title would be one request
// per poster. The single-title route stays for the film page, which only ever
// wants one.
//
// Deliberately NOT folded into /api/meta. That response is cached for an hour
// and served stale for a day, which is right for a title's name and poster and
// wrong for a number that moves every time somebody votes — bundling them would
// mean a list showing a score the film page had already moved past.

const MAX_IDS = 100;

export interface BatchRating {
  count: number;
  average: number | null;
  hasEnough: boolean;
}

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`movie-ratings:${getIp(req)}`, 60, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({});

  // An episode has no aggregate of its own — votes live on the title. Dropping
  // them here keeps the query small rather than looking up rows that cannot
  // exist.
  const wanted = ids
    .filter(id => !isEpisodeId(id))
    .map(id => ({
      raw: id,
      tmdbId: canonicalId(id),
      mediaType: (isShowId(id) ? 'SHOW' : 'MOVIE') as MediaType,
    }));

  const out: Record<string, BatchRating> = {};
  if (wanted.length === 0) return NextResponse.json(out);

  // One query for the page. The primary key is (tmdbId, mediaType), so this
  // filters on the leading column and the pair is matched in memory — cheaper
  // than an OR of N composite conditions.
  const rows = await prisma.movieRating.findMany({
    where: { tmdbId: { in: [...new Set(wanted.map(w => w.tmdbId))] } },
    select: { tmdbId: true, mediaType: true, count: true, sum: true },
  });
  const byKey = new Map(rows.map(r => [`${r.tmdbId}:${r.mediaType}`, r]));

  for (const w of wanted) {
    const row = byKey.get(`${w.tmdbId}:${w.mediaType}`);
    const count = row?.count ?? 0;
    out[w.raw] = {
      count,
      average: count > 0 ? row!.sum / count : null,
      hasEnough: count >= MIN_CINEPHILERS_RATINGS,
    };
  }

  // Same minute-long window the single-title route uses, so a list and the film
  // page can never disagree by more than the time it takes one vote to land.
  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
