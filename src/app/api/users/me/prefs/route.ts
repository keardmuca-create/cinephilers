import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { writeLimit } from '@/lib/write-limit';
import { getCurrentUser } from '@/lib/auth-utils';

const VALID_KEYS = new Set(['history', 'ratings', 'watchlist', 'list', 'rewatched']);

// Persist the user's list sort preferences (Refine) to their account so the
// chosen order survives a browser-data clear and follows them across devices.
// The client sends the whole set each time (last write wins), so we just
// overwrite — no read-modify-write race.
export async function PATCH(req: NextRequest) {
  const auth = await getCurrentUser(req);
  if (!auth) return err('Unauthorized', 401);
  const limited = await writeLimit(req, auth.sub);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.listPrefs !== 'object' || body.listPrefs === null) {
    return err('Invalid payload');
  }

  // Whitelist the four known keys and keep only the sort fields — never store
  // arbitrary client blobs on the user record.
  const clean: Record<string, { sortField: string; sortDir: string; type?: string; genre?: string }> = {};
  for (const [key, value] of Object.entries(body.listPrefs as Record<string, unknown>)) {
    if (!VALID_KEYS.has(key)) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (typeof v.sortField !== 'string' || typeof v.sortDir !== 'string') continue;
    if (v.sortField.length > 40 || v.sortDir.length > 8) continue;
    clean[key] = {
      sortField: v.sortField,
      sortDir: v.sortDir,
      ...(typeof v.type === 'string' && v.type.length <= 60 ? { type: v.type } : {}),
      ...(typeof v.genre === 'string' && v.genre.length <= 60 ? { genre: v.genre } : {}),
    };
  }

  await prisma.user.update({
    where: { id: auth.sub },
    data: { listPrefs: clean },
  });

  return ok(null, 'Preferences saved');
}
