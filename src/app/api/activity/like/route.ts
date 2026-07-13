import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { canViewUserContent } from '@/lib/privacy';
import { rateLimit } from '@/lib/rate-limit';
import { canonicalId, isValidMediaId } from '@/lib/media-id';

const TYPES = ['watched', 'rewatched', 'rated', 'reviewed'];

// Toggle a like on a feed activity card. Activities have no single row id
// across their source tables, so the like is keyed by (owner, type, tmdbId) —
// the same identity the feed uses. Returns the new state + count so the
// client can render without a refetch.
export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed, retryAfter } = await rateLimit(`activity-like:${auth.sub}`, 60, 60_000);
  if (!allowed) return err(`Too many likes. Try again in ${retryAfter}s`, 429);

  const body = await req.json().catch(() => null);
  if (!body) return err('Invalid JSON');

  const { username, type, tmdbId: rawId } = body as { username: string; type: string; tmdbId: string };
  if (!username || !type || !rawId) return err('username, type, and tmdbId are required');
  if (!TYPES.includes(type)) return err('type must be watched, rewatched, rated, or reviewed');
  const tmdbId = canonicalId(String(rawId));
  if (!isValidMediaId(tmdbId)) return err('Invalid tmdbId');

  const owner = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  if (!owner) return err('User not found', 404);
  if (!(await canViewUserContent(auth.sub, owner.id))) return err('This account is private', 403);

  const key = { userId: auth.sub, targetId: owner.id, type, tmdbId };
  const existing = await prisma.activityLike.findUnique({
    where: { userId_targetId_type_tmdbId: key },
  });

  let liked: boolean;
  if (existing) {
    await prisma.activityLike.delete({ where: { id: existing.id } });
    liked = false;
  } else {
    try {
      await prisma.activityLike.create({ data: key });
    } catch (e) {
      // Double-tap race: the like already exists — treat as liked.
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    }
    liked = true;
    if (owner.id !== auth.sub) {
      await prisma.notification.create({
        data: { userId: owner.id, fromId: auth.sub, type: 'activity_like', refId: tmdbId },
      }).catch(() => {});
    }
  }

  const count = await prisma.activityLike.count({
    where: { targetId: owner.id, type, tmdbId },
  });

  return ok({ liked, count });
}
