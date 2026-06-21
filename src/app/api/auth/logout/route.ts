import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok } from '@/lib/api-response';
import { clearAuthCookies, getCurrentUser } from '@/lib/auth-utils';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (user) {
    // Bump tokenVersion so every outstanding refresh token for this user is revoked.
    await prisma.user.update({
      where: { id: user.sub },
      data: { tokenVersion: { increment: 1 } },
    }).catch(() => {});
  }
  await clearAuthCookies();
  return ok(null, 'Logged out');
}
