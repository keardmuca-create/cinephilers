import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

const VALID_REASONS = ['Spam or advertising', 'Inappropriate or offensive content', 'Spoilers without warning', 'Harassment or bullying'];
const VALID_TYPES = ['review', 'comment'];

export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { targetType, targetId, reason } = await req.json().catch(() => ({}));
  if (!VALID_TYPES.includes(targetType)) return err('Invalid target type');
  if (!VALID_REASONS.includes(reason)) return err('Invalid reason');
  if (!targetId) return err('targetId required');

  // Prevent duplicate reports from same user
  const existing = await prisma.report.findFirst({
    where: { reporterId: auth.sub, targetType, targetId },
  });
  if (existing) return err('You have already reported this', 409);

  await prisma.report.create({
    data: { reporterId: auth.sub, targetType, targetId, reason },
  });

  return ok(null, 'Report submitted');
}
