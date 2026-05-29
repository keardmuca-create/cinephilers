import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';

const TIER_THRESHOLDS = { GREY: 0, BRONZE: 25, SILVER: 100, GOLD: 500 };
const TIER_ORDER = ['GREY', 'BRONZE', 'SILVER', 'GOLD'] as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, ratingsCount: true },
  });
  if (!user) return err('User not found', 404);

  const badges = await prisma.badge.findMany({
    where: { userId: user.id },
    orderBy: { awardedAt: 'asc' },
  });

  const currentTierIndex = TIER_ORDER.reduce((acc, tier, i) => {
    return user.ratingsCount >= TIER_THRESHOLDS[tier] ? i : acc;
  }, 0);
  const nextTier = TIER_ORDER[currentTierIndex + 1] as typeof TIER_ORDER[number] | undefined;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : null;

  return ok({
    badges,
    ratingsCount: user.ratingsCount,
    currentTier: TIER_ORDER[currentTierIndex],
    nextTier: nextTier ?? null,
    nextThreshold,
    progress: nextThreshold ? Math.round((user.ratingsCount / nextThreshold) * 100) : 100,
  });
}
