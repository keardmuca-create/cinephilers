import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok } from '@/lib/api-response';
import { clearAuthCookies, getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (user) {
    await prisma.user.update({
      where: { id: user.sub },
      data: { refreshTokenHash: null },
    }).catch(() => {});
  }
  await clearAuthCookies();
  return ok(null, 'Logged out');
}
