import { api, log, section, FILMS, SHOWS } from './driver';
import { sync } from './state';

async function main() {
  const A = 'test_alpha';
  const ep = (season: number, episode: number, watched = true) =>
    api(A, 'POST', '/api/watched/episodes', { showTmdbId: SHOWS.breakingBad.tmdbId, season, episode, watched });

  section('Episodes — with watched:true');
  log('S1E1', await ep(1, 1));
  log('S1E2', await ep(1, 2));
  log('S1E1 again (idempotent?)', await ep(1, 1));
  let r = await api(A, 'GET', `/api/watched/episodes/${SHOWS.breakingBad.tmdbId}`);
  log('read back', r, JSON.stringify(r.data));

  section('Episodes — the omitted-field case');
  // watched is absent, so the route takes its else branch and DELETES.
  log('POST without `watched`', await api(A, 'POST', '/api/watched/episodes', { showTmdbId: SHOWS.breakingBad.tmdbId, season: 1, episode: 2 }));
  r = await api(A, 'GET', `/api/watched/episodes/${SHOWS.breakingBad.tmdbId}`);
  log('read back', r, JSON.stringify(r.data) + '  <- S1E2 gone, and the call reported success');

  section('Episodes — bad input');
  log('season 999',   await ep(999, 1));
  log('episode -1',   await ep(1, -1));
  log('season 1.5',   await api(A, 'POST', '/api/watched/episodes', { showTmdbId: SHOWS.breakingBad.tmdbId, season: 1.5, episode: 1, watched: true }));
  log('no showTmdbId',await api(A, 'POST', '/api/watched/episodes', { season: 1, episode: 1, watched: true }));

  section('Bulk episodes');
  const bulk = await api(A, 'POST', '/api/watched/episodes/bulk', {
    showTmdbId: SHOWS.breakingBad.tmdbId,
    episodes: [{ season: 1, episode: 3 }, { season: 1, episode: 4 }, { season: 1, episode: 5 }],
    watched: true,
  });
  log('mark 3 at once', bulk, bulk.message);
  r = await api(A, 'GET', `/api/watched/episodes/${SHOWS.breakingBad.tmdbId}`);
  log('read back', r, JSON.stringify(r.data));

  section('Lists');
  const made = await api(A, 'POST', '/api/lists', { name: 'Sunday night', description: 'Slow ones', isPublic: true });
  log('create public list', made);
  const listId = (made.data as { id?: string } | null)?.id;
  log('create with empty name', await api(A, 'POST', '/api/lists', { name: '' }));
  log('create with 200-char name', await api(A, 'POST', '/api/lists', { name: 'x'.repeat(200) }));

  if (listId) {
    log('add Parasite',   await api(A, 'POST', `/api/lists/${listId}/items`, { items: [{ tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }] }));
    log('add it again',   await api(A, 'POST', `/api/lists/${listId}/items`, { items: [{ tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }] }));
    log('add two more',   await api(A, 'POST', `/api/lists/${listId}/items`, { items: [{ tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE' }, { tmdbId: FILMS.spirited.tmdbId, mediaType: 'MOVIE' }] }));
    r = await api(A, 'GET', `/api/lists/${listId}`);
    const items = (r.data as { items?: unknown[] } | null)?.items ?? [];
    log('read list', r, `${items.length} item(s) — a duplicate add must not make two`);
    log("someone else's view", await api('test_beta', 'GET', `/api/lists/${listId}`), 'public list, should be readable');
    log('remove an item',  await api(A, 'DELETE', `/api/lists/${listId}/items/${FILMS.seven.tmdbId}?mediaType=MOVIE`));
  }

  section('Diary / rewatch');
  log('watch Parasite again', await api(A, 'POST', '/api/watched', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }));
  r = await api(A, 'GET', '/api/diary');
  const entries = (r.data as unknown[] | null) ?? [];
  log('diary', r, `${entries.length} entr(y/ies)`);
  console.log('  first entry: ' + JSON.stringify(entries[0] ?? null).slice(0, 160));
  r = await api(A, 'GET', `/api/users/${A}/rewatched?min=2&sort=recent&limit=20`);
  log('rewatched (min 2)', r, `${((r.data as unknown[] | null) ?? []).length} film(s)`);

  section('Final state');
  const s = await sync(A);
  console.log(`  watched ${s.watched.length}, episodes ${s.watchedEpisodes.length}, reviews ${s.reviews.length}, favourites ${s.favorites.length}, lists ${s.lists.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
