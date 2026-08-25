import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

// Marks the Founder welcome as seen.
//
// Its own endpoint rather than another field on the profile PUT: that route
// sanitizes text, uploads avatars and recomputes rating aggregates, and none of
// that should run because somebody pressed Continue on a welcome screen.
//
// Writes only when the field is still null, so a double-tap or a replayed
// request can't move the date. The stamp is the moment they were welcomed, and
// it should stay that moment.
export async function POST(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const { count } = await prisma.user.updateMany({
    where: { id: auth.sub, welcomedAt: null },
    data: { welcomedAt: new Date() },
  });

  return ok({ welcomed: true, firstTime: count > 0 });
}
