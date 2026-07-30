import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';
import { listWatchedRows } from '@/lib/watched-rows';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 20, 1, 100);
  // ?year=YYYY restricts to titles watched in that calendar year.
  const year = clampInt(searchParams.get('year'), 0, 0, 9999);

  const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, isPrivate: true } });
  if (!user) return err('User not found', 404);

  if (user.isPrivate) {
    const auth = await getCurrentUser(req);
    const isOwner = auth?.sub === user.id;
    if (!isOwner) {
      if (!auth) return err('This account is private', 403);
      const follow = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } });
      if (!follow) return err('This account is private', 403);
    }
  }

  // Films and per-episode show progress merged into one row per title, so other
  // people see the same library the owner does — see lib/watched-rows.
  const { rows, total } = await listWatchedRows(user.id, { page, limit, year: year || undefined });

  // Attach the owner's own rating for each watched title on this page (one
  // bounded query over the page's ids) so the profile can show it inline.
  const ratings = rows.length
    ? await prisma.rating.findMany({
        where: { userId: user.id, tmdbId: { in: rows.map(r => r.tmdbId) } },
        select: { tmdbId: true, mediaType: true, score: true },
      })
    : [];
  const scoreMap = new Map(ratings.map(r => [`${r.tmdbId}:${r.mediaType}`, r.score]));
  const withScore = rows.map(r => ({ ...r, score: scoreMap.get(`${r.tmdbId}:${r.mediaType}`) ?? null }));

  return paginated(withScore, page, limit, total);
}
