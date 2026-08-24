import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

// POST = accept, DELETE = deny
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { id } = await params;
  const request = await prisma.followRequest.findUnique({ where: { id } });
  if (!request) return err('Request not found', 404);
  if (request.targetId !== auth.sub) return err('Forbidden', 403);

  try {
    await prisma.$transaction([
      prisma.follow.create({ data: { followerId: request.requesterId, followingId: request.targetId } }),
      prisma.followRequest.delete({ where: { id } }),
      prisma.notification.create({ data: { userId: request.requesterId, fromId: auth.sub, type: 'follow_accept' } }),
    ]);
  } catch (e) {
    // Follow already exists (double-tap, or they followed while the request was
    // pending) — treat as accepted and just clean up the request row.
    if ((e as { code?: string })?.code === 'P2002') {
      await prisma.followRequest.deleteMany({ where: { id } });
      return ok(null, 'Accepted');
    }
    throw e;
  }

  return ok(null, 'Accepted');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { id } = await params;
  const request = await prisma.followRequest.findUnique({ where: { id } });
  if (!request) return err('Request not found', 404);
  if (request.targetId !== auth.sub) return err('Forbidden', 403);

  await prisma.followRequest.delete({ where: { id } });

  return ok(null, 'Denied');
}
