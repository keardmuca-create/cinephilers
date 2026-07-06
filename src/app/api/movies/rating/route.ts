import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { MediaType } from '@/generated/prisma/client';
import { MIN_CINEPHILERS_RATINGS } from '@/lib/cinephilers-rating';
import { rateLimit, getIp } from '@/lib/rate-limit';

// Returns the Cinephilers aggregate rating for a title: the vote count, the
// derived average (sum/count), and whether it has enough votes to be shown in
// place of the TMDB rating.
export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`movie-rating:${getIp(req)}`, 120, 60_000);
  if (!allowed) return err('Too many requests', 429);

  const tmdbId = req.nextUrl.searchParams.get('tmdbId');
  const mediaTypeParam = req.nextUrl.searchParams.get('mediaType') ?? 'MOVIE';
  if (!tmdbId) return err('tmdbId required', 400);
  if (!['MOVIE', 'SHOW'].includes(mediaTypeParam)) return err('mediaType must be MOVIE or SHOW', 400);
  const mediaType = mediaTypeParam as MediaType;

  const agg = await prisma.movieRating.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });

  const count = agg?.count ?? 0;
  const average = count > 0 ? agg!.sum / count : null;

  // Aggregate barely moves between votes — let the CDN absorb repeat title-page
  // hits for a minute instead of invoking the function + DB every time.
  return ok(
    {
      count,
      average,
      hasEnough: count >= MIN_CINEPHILERS_RATINGS,
    },
    undefined,
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
