import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';
import { rateLimit } from '@/lib/rate-limit';
import { isValidTimeZone } from '@/lib/local-day';

// Where the server learns what day it is for this person.
//
// The browser is the only thing that knows its own zone, and the server is the
// only place that can act on it — Today's Pick resets on a day boundary and the
// streak badge counts consecutive days, and badges are recomputed on a background
// refresh with nobody's browser attached. So the zone is reported once and stored.
//
// The client sends this on load and it is a no-op almost every time, which is why
// it is its own tiny route rather than part of the profile PUT: nothing else gets
// touched, and a profile save can never accidentally clear it.
//
// A user could lie about their zone, or move their clock, and gain themselves an
// extra pick. That only cheats their own badge, and defending against it would
// mean not letting people travel.
export async function PATCH(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);

  const { allowed } = await rateLimit(`tz:${auth.sub}`, 20, 60_000);
  if (!allowed) return err('Too many requests', 429);

  const body = await req.json().catch(() => null);
  const tz = (body as { timezone?: unknown } | null)?.timezone;

  // Validated by asking Intl whether it recognises the name, not by pattern —
  // an unknown zone stored here would silently send every day boundary back to
  // UTC for that user, which is the bug this whole change exists to remove.
  if (!isValidTimeZone(tz)) return err('Invalid timezone');

  await prisma.user.update({
    where: { id: auth.sub },
    data: { timezone: tz },
  });

  return ok(null, 'Timezone saved');
}
