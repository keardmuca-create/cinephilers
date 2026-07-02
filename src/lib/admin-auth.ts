import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, JwtPayload } from '@/lib/auth-utils';

// Break-glass owner account: keeps admin access even if the DB role row is
// accidentally demoted. Everyone else is checked against the live DB role (not
// the up-to-15-min-stale token claim), so demotions take effect immediately.
const ADMIN_IDS = new Set(['0e4f66de-b8f9-4d0b-b176-ad31a788fd1e']);

export type AdminCheck =
  | { auth: JwtPayload; status: 'ok' }
  | { auth: null; status: 'unauthenticated' | 'forbidden' };

export async function requireAdmin(req?: NextRequest): Promise<AdminCheck> {
  const auth = await getCurrentUser(req);
  if (!auth) return { auth: null, status: 'unauthenticated' };
  if (ADMIN_IDS.has(auth.sub)) return { auth, status: 'ok' };
  const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { role: true } });
  if (user?.role !== 'ADMIN') return { auth: null, status: 'forbidden' };
  return { auth, status: 'ok' };
}
