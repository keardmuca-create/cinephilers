import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

// Remove one diary entry ("logged by mistake"). Keeps the WatchedItem summary
// consistent: deleting a title's LAST entry un-marks it watched entirely, and
// deleting the latest entry rolls the summary's watchedAt back to the newest
// remaining watch. Server state settles before the client updates (sync rule).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { id } = await params;
  const event = await prisma.watchEvent.findUnique({
    where: { id },
    select: { id: true, userId: true, tmdbId: true, mediaType: true },
  });
  if (!event) return err('Entry not found', 404);
  if (event.userId !== auth.sub) return err('Forbidden', 403);

  await prisma.watchEvent.delete({ where: { id } });

  const remaining = await prisma.watchEvent.findMany({
    where: { userId: auth.sub, tmdbId: event.tmdbId, mediaType: event.mediaType },
    orderBy: { watchedAt: 'asc' },
    select: { id: true, isRewatch: true, watchedAt: true },
  });

  if (remaining.length === 0) {
    await prisma.watchedItem.deleteMany({
      where: { userId: auth.sub, tmdbId: event.tmdbId, mediaType: event.mediaType },
    });
  } else {
    // The earliest remaining watch is by definition not a rewatch (we may have
    // just deleted the original first watch), and the summary row tracks the
    // newest remaining date.
    if (remaining[0].isRewatch) {
      await prisma.watchEvent.update({ where: { id: remaining[0].id }, data: { isRewatch: false } });
    }
    await prisma.watchedItem.updateMany({
      where: { userId: auth.sub, tmdbId: event.tmdbId, mediaType: event.mediaType },
      data: { watchedAt: remaining[remaining.length - 1].watchedAt },
    });
  }

  return ok({ remaining: remaining.length }, 'Entry removed');
}
