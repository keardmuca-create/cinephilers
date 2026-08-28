import { api, log, section, FILMS } from './driver';
import { sync } from './state';

async function main() {
  const Z = 'test_zeta';
  const body = 'First paragraph about the bathhouse.\n\nSecond paragraph, after a blank line.';

  section('Does a multi-paragraph review survive the round trip?');
  log('import it', await api(Z, 'POST', '/api/import', {
    items: [{ tmdbId: FILMS.spirited.tmdbId, mediaType: 'MOVIE', review: body, watchedAt: '2025-04-01T00:00:00.000Z' }],
  }));

  const s = await sync(Z);
  const stored = s.reviews.find(r => r.tmdbId === FILMS.spirited.tmdbId)?.body ?? null;
  console.log('  sent:   ' + JSON.stringify(body));
  console.log('  stored: ' + JSON.stringify(stored));
  console.log('  identical: ' + (stored === body));
  console.log('  paragraph break kept: ' + (stored?.includes('\n\n') ?? false));
}

main().catch(e => { console.error(e); process.exit(1); });
