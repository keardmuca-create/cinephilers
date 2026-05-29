import { prisma } from './db';
import { BadgeTier } from '@prisma/client';

const TIER_THRESHOLDS: { tier: BadgeTier; min: number }[] = [
  { tier: 'GOLD', min: 500 },
  { tier: 'SILVER', min: 100 },
  { tier: 'BRONZE', min: 25 },
  { tier: 'GREY', min: 0 },
];

export async function awardBadgeIfEarned(userId: string, ratingsCount: number) {
  const earned = TIER_THRESHOLDS.find(t => ratingsCount >= t.min);
  if (!earned) return;

  const existing = await prisma.badge.findFirst({ where: { userId, tier: earned.tier } });
  if (existing) return;

  await prisma.badge.create({ data: { userId, tier: earned.tier } });
}
