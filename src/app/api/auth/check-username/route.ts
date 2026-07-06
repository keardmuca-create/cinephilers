import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { rateLimit, getIp } from '@/lib/rate-limit';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function GET(req: NextRequest) {
  // Per-IP cap: generous enough for debounced typing in the register form,
  // tight enough to stop bulk username enumeration / free DB hits.
  const { allowed } = await rateLimit(`check-username:${getIp(req)}`, 30, 60_000);
  if (!allowed) return err('Too many requests', 429);

  const u = req.nextUrl.searchParams.get('u')?.trim() ?? '';

  if (!USERNAME_RE.test(u)) {
    return ok({ available: false, reason: 'invalid' });
  }

  const existing = await prisma.user.findUnique({
    where: { username: u.toLowerCase() },
    select: { id: true },
  });

  return ok({ available: !existing, reason: existing ? 'taken' : null });
}
