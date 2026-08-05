import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Everything the account holds, in one file, for the person it belongs to.
// Deletion was already honoured; this is the other half — being able to leave
// with your own history. Deliberately NOT filtered down to "interesting" fields:
// an export that quietly drops things is worse than none, because you only find
// out what is missing after you have deleted the original.
export async function GET(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  // Heavier than a normal read — every table for one user in one go.
  const { allowed, retryAfter } = await rateLimit(`export:${auth.sub}`, 5, 3_600_000);
  if (!allowed) return err(`Too many exports. Try again in ${retryAfter}s`, 429);

  const userId = auth.sub;

  const [user, ratings, reviews, watched, watchedEpisodes, watchEvents, watchlist, favorites, lists, following, followers] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, username: true, displayName: true, bio: true,
          avatarUrl: true, country: true, favoriteGenres: true, isPrivate: true,
          isVerified: true, createdAt: true, listPrefs: true,
        },
      }),
      prisma.rating.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, score: true, createdAt: true, updatedAt: true } }),
      prisma.review.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, body: true, containsSpoiler: true, hidden: true, likesCount: true, createdAt: true, updatedAt: true } }),
      prisma.watchedItem.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, watchedAt: true } }),
      prisma.watchedEpisode.findMany({ where: { userId }, select: { showTmdbId: true, season: true, episode: true, watchedAt: true } }),
      prisma.watchEvent.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, watchedAt: true, isRewatch: true } }),
      prisma.watchlistItem.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, addedAt: true } }),
      prisma.favorite.findMany({ where: { userId }, select: { tmdbId: true, mediaType: true, addedAt: true } }),
      prisma.customList.findMany({
        where: { userId },
        select: {
          name: true, description: true, isPublic: true, createdAt: true,
          items: { select: { tmdbId: true, mediaType: true, title: true, year: true, addedAt: true } },
        },
      }),
      prisma.follow.findMany({ where: { followerId: userId }, select: { following: { select: { username: true } }, createdAt: true } }),
      prisma.follow.findMany({ where: { followingId: userId }, select: { follower: { select: { username: true } }, createdAt: true } }),
    ]);

  if (!user) return err('User not found', 404);

  const payload = {
    exportedAt: new Date().toISOString(),
    // Titles are stored as TMDB ids rather than names, so anyone reading this
    // file later needs to know where to look them up.
    note: 'Films and shows are identified by their TMDB id. tmdbId "tmdb-155" is themoviedb.org/movie/155; "tmdb-tv-1396" is themoviedb.org/tv/1396.',
    account: user,
    ratings,
    reviews,
    watched,
    watchedEpisodes,
    diary: watchEvents,
    watchlist,
    favorites,
    lists,
    following: following.map(f => ({ username: f.following.username, since: f.createdAt })),
    followers: followers.map(f => ({ username: f.follower.username, since: f.createdAt })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cinephilers-${user.username}-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
