import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { getBadges } from '@/lib/badge-compute';

const TIER_THRESHOLDS = { GREY: 0, BRONZE: 25, SILVER: 100, GOLD: 500 };
const TIER_ORDER = ['GREY', 'BRONZE', 'SILVER', 'GOLD'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, isPrivate: true, ratingsCount: true, createdAt: true },
  });
  if (!user) return err('User not found', 404);

  const auth = await getCurrentUser(req);
  const isOwner = auth?.sub === user.id;

  if (user.isPrivate && !isOwner) {
    if (!auth) return err('This account is private', 403);
    const follow = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } } });
    if (!follow) return err('This account is private', 403);
  }

  // The nine computed badges, which is what anyone actually sees. Your own are
  // always rebuilt so rating something and opening your profile shows the new
  // number; everyone else's come from the stored copy until it goes stale.
  const snapshot = await getBadges(user.id, { force: isOwner });

  const badges = await prisma.badge.findMany({
    where: { userId: user.id },
    orderBy: { awardedAt: 'asc' },
  });

  // Distinct languages watched, straight from the shared title metadata. This
  // used to be counted in the browser from the meta cache, so it read low on a
  // fresh device and was impossible to show for anyone else.
  const watched = await prisma.watchedItem.findMany({
    where: { userId: user.id },
    select: { tmdbId: true },
  });
  const languages = watched.length
    ? await prisma.filmMeta.findMany({
        where: { tmdbId: { in: watched.map(w => w.tmdbId) }, language: { not: null } },
        select: { language: true },
        distinct: ['language'],
      })
    : [];
  const distinctLanguages = languages.length;

  const currentTierIndex = TIER_ORDER.reduce((acc, tier, i) => {
    return user.ratingsCount >= TIER_THRESHOLDS[tier] ? i : acc;
  }, 0);
  const nextTier = TIER_ORDER[currentTierIndex + 1] as typeof TIER_ORDER[number] | undefined;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;

  return ok({
    earned: snapshot.badges,
    computedAt: snapshot.computedAt,
    // Kept for the founder chip and the ratings-tier flair, which read these.
    badges,
    ratingsCount: user.ratingsCount,
    currentTier: TIER_ORDER[currentTierIndex],
    nextTier: nextTier ?? null,
    nextThreshold,
    progress: nextThreshold ? Math.round((user.ratingsCount / nextThreshold) * 100) : 100,
    memberSince: user.createdAt.toISOString(),
    distinctLanguages,
  });
}
