import { api, log, section, FILMS } from './driver';
import { sync, counts } from './state';

async function main() {
  const A = 'test_alpha';

  section('State after the Letterboxd import');
  const s = await sync(A);
  console.log('  ' + counts(s));

  section('Did the multi-line review survive?');
  const spirited = s.reviews.find(r => r.tmdbId === FILMS.spirited.tmdbId);
  console.log('  Spirited Away review stored as:');
  console.log('    ' + JSON.stringify(spirited?.body ?? null));
  console.log('  The CSV contained two paragraphs; the second was "Second paragraph, after a blank line."');

  section('Rewatches from diary.csv');
  const r = await api(A, 'GET', `/api/users/${A}/rewatched?min=2&sort=recent&limit=20`);
  const items = (r.data as { items?: { tmdbId: string; watchCount?: number }[] })?.items ?? [];
  log('rewatched min=2', r, `${items.length} film(s)`);
  for (const i of items) console.log(`    ${i.tmdbId}  ${JSON.stringify(i)}`.slice(0, 160));
  console.log('  diary.csv gave Parasite three viewings: 2025-01-14, 2025-06-20, 2025-08-01');

  const d = await api(A, 'GET', '/api/diary?limit=40');
  const entries = (d.data as { items?: { tmdbId: string; isRewatch: boolean; watchedAt: string }[] })?.items ?? [];
  log('diary', d, `${entries.length} entr(ies)`);
  for (const e of entries.slice(0, 8)) console.log(`    ${e.watchedAt.slice(0, 10)}  rewatch=${e.isRewatch}  ${e.tmdbId}`);

  section('Ratings — did half-stars double correctly?');
  for (const rt of s.ratings) console.log(`    ${rt.tmdbId.padEnd(16)} ${rt.score}`);
  console.log('  CSV had Parasite 4.5, Amélie 2.5, Spirited Away 5, Se7en 4  →  expect 9, 5, 10, 8');

  section('Watchlist');
  for (const w of s.watchlist) console.log(`    ${w.tmdbId} ${w.mediaType}`);
}

main().catch(e => { console.error(e); process.exit(1); });
