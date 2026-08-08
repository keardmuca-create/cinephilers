import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { rateLimit, getIp } from '@/lib/rate-limit';
import { fetchOneMeta } from '../meta/_fetch';
import type { ItemMeta } from '../meta/[id]/route';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 7;
const CHART_SIZE = 10;

// The chart only exists when it means something. Ranked by how many DIFFERENT
// people watched a title, not by how many times it was watched — otherwise one
// person working through a boxset owns every slot, which on a young app is
// exactly what would happen. The two floors below are the same idea said twice:
// a "most watched" row built from two people is not a chart, it is a diary with
// a leaderboard drawn on it. Below either floor the row returns nothing and the
// home screen leaves it out entirely, so this turns itself on when the community
// is real rather than needing anyone to remember to enable it.
const MIN_WATCHERS_PER_TITLE = 3;
const MIN_TITLES_TO_SHOW = 5;

interface Row {
  tmdbId: string;
  watchers: number;
  plays: number;
}

export async function GET(req: NextRequest) {
  const { allowed } = await rateLimit(`tmdb:${getIp(req)}`, 300, 60_000);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ ready: false, items: [] });

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Episodes roll up into their show: watching six episodes of a series is a
  // vote for the series, and "tmdb-tv-1396-S1E2" charting on its own would be
  // meaningless to anyone reading it.
  //
  // No index covers this grouping today (WatchEvent is indexed per user), so it
  // is a scan. That is nothing at the current size; if the table grows into the
  // millions this wants an index on watchedAt before it is called on every home
  // screen load.
  let rows: Row[] = [];
  try {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT regexp_replace("tmdbId", '-S[0-9]+E[0-9]+$', '') AS "tmdbId",
             COUNT(DISTINCT "userId")::int AS watchers,
             COUNT(*)::int AS plays
      FROM "WatchEvent"
      WHERE "watchedAt" >= ${since}
      GROUP BY 1
      HAVING COUNT(DISTINCT "userId") >= ${MIN_WATCHERS_PER_TITLE}
      ORDER BY watchers DESC, plays DESC
      LIMIT ${CHART_SIZE}
    `;
  } catch {
    // A chart is decoration. It must never be the reason the home screen fails.
    return NextResponse.json({ ready: false, items: [] });
  }

  if (rows.length < MIN_TITLES_TO_SHOW) {
    return NextResponse.json({ ready: false, items: [] });
  }

  // Hydrate through the same meta path everything else uses, so these titles get
  // the cached copy and fill FilmMeta like any other read.
  const settled = await Promise.allSettled(rows.map(r => fetchOneMeta(r.tmdbId, key)));
  const items = settled
    .map((s, i) => {
      if (s.status !== 'fulfilled' || !s.value) return null;
      const meta = s.value as ItemMeta;
      if (!meta.poster) return null;   // a rank card with no poster is a grey box
      return {
        id: meta.id,
        title: meta.title,
        year: meta.year,
        poster: meta.poster,
        type: meta.type,
        rating: meta.tmdbRating ?? 0,
        watchers: rows[i].watchers,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (items.length < MIN_TITLES_TO_SHOW) {
    return NextResponse.json({ ready: false, items: [] });
  }

  // Short cache: this is live activity, but it does not need to be to-the-second,
  // and the home screen is the most-hit route in the app.
  return NextResponse.json({ ready: true, items }, {
    headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
  });
}
