// The rewatch path, on an account with nothing in it — so nothing is deduped away.
// Payload shape copied from import-dialog.tsx: one row per viewing.
import { api, log, section } from './driver';

async function main() {
  const T = 'test_theta';
  const parasite = 'tmdb-496243';

  section('Import three viewings of one film into an empty account');
  const items = [
    { tmdbId: parasite, mediaType: 'MOVIE', rating: 9, review: 'Imported review.', watchedAt: '2025-01-14T00:00:00.000Z' },
    { tmdbId: parasite, mediaType: 'MOVIE', watchedAt: '2025-06-20T00:00:00.000Z' },
    { tmdbId: parasite, mediaType: 'MOVIE', watchedAt: '2025-08-01T00:00:00.000Z' },
  ];
  const r = await api(T, 'POST', '/api/import', { items });
  log('POST /api/import', r, JSON.stringify(r.data));

  section('What landed');
  const d = await api(T, 'GET', '/api/diary?limit=40');
  const entries = (d.data as { items?: { tmdbId: string; isRewatch: boolean; watchedAt: string }[] })?.items ?? [];
  log('diary', d, `${entries.length} entr(ies) — expect 3`);
  for (const e of entries) console.log(`    ${e.watchedAt.slice(0, 10)}  rewatch=${e.isRewatch}`);

  const rw = await api(T, 'GET', `/api/users/${T}/rewatched?min=2&sort=recent&limit=20`);
  const items2 = (rw.data as { items?: unknown[] })?.items ?? [];
  log('rewatched min=2', rw, `${items2.length} film(s) — expect 1`);
  console.log('    ' + JSON.stringify(items2[0] ?? null).slice(0, 200));

  section('Watch history keeps the EARLIEST date');
  const s = await api(T, 'GET', '/api/sync');
  const watched = (s.data as { watched?: { tmdbId: string; watchedAt: string }[] })?.watched ?? [];
  for (const w of watched) console.log(`    ${w.tmdbId}  ${w.watchedAt.slice(0, 10)}  (expect 2025-01-14)`);

  section('Re-importing the same file must not duplicate');
  const again = await api(T, 'POST', '/api/import', { items });
  log('second import', again, JSON.stringify(again.data));
  const d2 = await api(T, 'GET', '/api/diary?limit=40');
  log('diary after', d2, `${((d2.data as { items?: unknown[] })?.items ?? []).length} entr(ies) — still 3?`);
}

main().catch(e => { console.error(e); process.exit(1); });
