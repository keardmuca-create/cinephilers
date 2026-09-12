import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/api-response';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { matchByTitle } from '@/lib/tmdb-match';

export const dynamic = 'force-dynamic';

// One title at a time. The import dialog now matches in batches through
// /api/import/match; this stays for anything still calling it — an installed app
// on an older build. The matching itself lives in lib/tmdb-match, shared by both.
export async function GET(req: NextRequest) {
  // Own (generous) bucket, separate from the tmdb: one — the import dialog
  // legitimately fires one lookup per unmatched row in quick succession.
  const { allowed } = await rateLimit(`tmdb-match:${getIp(req)}`, 600, 60_000);
  if (!allowed) return err('Too many requests', 429);

  const key = process.env.TMDB_API_KEY;
  if (!key) return err('TMDB key not configured', 500);

  const q = req.nextUrl.searchParams.get('q')?.trim();
  const year = req.nextUrl.searchParams.get('year')?.trim();
  const rawHint = req.nextUrl.searchParams.get('type')?.trim(); // 'movie' | 'tv' | null
  if (!q) return err('Missing query');
  const typeHint = rawHint === 'movie' || rawHint === 'tv' ? rawHint : null;

  try {
    const m = await matchByTitle(q, year || null, typeHint, key);
    if (!m) return ok(null);
    return ok({ tmdbId: m.tmdbId, mediaType: m.mediaType, title: m.title, year: m.year, poster: m.poster, language: m.language, rating: m.rating, confident: m.confident });
  } catch {
    return err('Search failed', 502);
  }
}
