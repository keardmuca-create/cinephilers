import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

// DELETE /api/users/[username]/follower — remove [username] from MY followers
// (the reverse of unfollow). Essential for private accounts: accepting a
// follow request must not be irreversible.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { username } = await params;
  const target = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });
  if (!target) return err('User not found', 404);

  await prisma.follow.deleteMany({
    where: { followerId: target.id, followingId: auth.sub },
  });

  return ok(null, 'Follower removed');
}
