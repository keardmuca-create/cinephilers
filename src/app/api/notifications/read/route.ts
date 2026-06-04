import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

export async function PATCH(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  await prisma.notification.updateMany({
    where: { userId: auth.sub, read: false },
    data: { read: true },
  });

  return ok(null, 'Marked as read');
}
