import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { paginated, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { clampInt } from '@/lib/query-params';
import { parseSide, sideWhere } from '@/lib/media-side-where';

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { searchParams } = new URL(req.url);
  const page = clampInt(searchParams.get('page'), 1, 1, 1_000_000);
  const limit = clampInt(searchParams.get('limit'), 20, 1, 100);

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

  // ?side= gives one side of the profile's pill; ?score= one bar of its chart.
  // Without either, the mixed list the Recent Activity box reads, unchanged.
  const side = parseSide(searchParams.get('side'));
  const score = clampInt(searchParams.get('score'), 0, 0, 10);

  if (side === 'shows') {
    // One row per show, as the owner's own Shows side lists them: the series
    // rating where there is one, and how many episodes were rated under it, with
    // their average — reported apart, never passed off as the series score.
    // Grouped in memory: one person's show ratings are a short list.
    const all = await prisma.rating.findMany({
      where: { userId: user.id, mediaType: 'SHOW' },
      select: { tmdbId: true, score: true, updatedAt: true },
    });
    const groups = new Map<string, { tmdbId: string; mediaType: 'SHOW'; score: number | null; episodeScores: number[]; updatedAt: Date }>();
    for (const r of all) {
      const showId = r.tmdbId.replace(/-S\d+E\d+$/, '');
      const g = groups.get(showId) ?? { tmdbId: showId, mediaType: 'SHOW' as const, score: null, episodeScores: [], updatedAt: r.updatedAt };
      if (showId === r.tmdbId) g.score = r.score;
      else g.episodeScores.push(r.score);
      if (r.updatedAt > g.updatedAt) g.updatedAt = r.updatedAt;
      groups.set(showId, g);
    }
    let rows = [...groups.values()].map(({ episodeScores, ...g }) => ({
      ...g,
      episodeCount: episodeScores.length,
      episodeAverage: episodeScores.length
        ? Math.round((episodeScores.reduce((a, b) => a + b, 0) / episodeScores.length) * 10) / 10
        : null,
    }));
    // A chart bar on this side is a series score, so a show rated only through its
    // episodes sits on no bar.
    if (score) rows = rows.filter(r => r.score === score);
    rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const start = (page - 1) * limit;
    return paginated(rows.slice(start, start + limit), page, limit, rows.length);
  }

  const where = { userId: user.id, ...(side ? sideWhere(side) : {}), ...(score ? { score } : {}) };
  const [total, items] = await Promise.all([
    prisma.rating.count({ where }),
    prisma.rating.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  return paginated(items, page, limit, total);
}
