import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { ok, err } from '@/lib/api-response';
import { getCurrentUser } from '@/lib/auth-utils';

// The languages behind the World cinema badge, spelled out.
//
// The badge only ever showed a number, which told you how many languages you'd
// watched but not which — so someone with 566 films and 10 languages had no way
// to know what was missing. This is that list. It deliberately does NOT suggest
// what to watch next: knowing what you've seen is enough to choose from.
//
// Kept out of the badge snapshot on purpose. Snapshots are stored per user and
// served for five minutes; a growing list of languages inside one would bloat
// every read of every badge for a panel most people never open. This is fetched
// only when the World cinema dialog does.
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true, isPrivate: true },
  });
  if (!user) return err('User not found', 404);

  // Same gate as the badges route — this is a detail of a badge, so it can't be
  // readable by anyone the badge itself isn't.
  const auth = await getCurrentUser(req);
  const isOwner = auth?.sub === user.id;
  if (user.isPrivate && !isOwner) {
    if (!auth) return err('This account is private', 403);
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: auth.sub, followingId: user.id } },
    });
    if (!follow) return err('This account is private', 403);
  }

  // Films only, matching the badge: World cinema counts films, not episodes.
  const films = await prisma.watchedItem.findMany({
    where: { userId: user.id, mediaType: 'MOVIE' },
    select: { tmdbId: true },
  });

  const meta = films.length
    ? await prisma.filmMeta.findMany({
        where: { tmdbId: { in: films.map(f => f.tmdbId) } },
        select: { tmdbId: true, language: true },
      })
    : [];
  const langById = new Map(meta.map(m => [m.tmdbId, m.language]));

  const counts = new Map<string, number>();
  for (const f of films) {
    const code = langById.get(f.tmdbId);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  // Most-watched first: the top of the list is who you are, the bottom is where
  // you've only just been.
  const languages = [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  // Codes only — the browser turns them into names with Intl, so no language
  // table has to ship or be kept up to date.
  return ok({ languages });
}
