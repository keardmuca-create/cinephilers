// Films: watched, rated, reviewed, favourited, watchlisted — and taken back off.
import { api, log, section, FILMS, SHOWS } from './driver';

async function main() {
  const A = 'test_alpha';

  section('Watchlist');
  log('add Parasite',            await api(A, 'POST', '/api/watchlist', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }));
  log('add it a second time',    await api(A, 'POST', '/api/watchlist', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }));
  let r = await api(A, 'GET', '/api/watchlist');
  log('list', r, `${(r.data as unknown[] | null)?.length ?? 0} item(s) — a duplicate add must not make two`);

  section('Mark watched');
  log('watch Parasite',          await api(A, 'POST', '/api/watched', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE' }));
  log('watch The Godfather',     await api(A, 'POST', '/api/watched', { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE' }));
  r = await api(A, 'GET', '/api/watched');
  log('watched list', r, `${(r.data as unknown[] | null)?.length ?? 0} item(s)`);
  r = await api(A, 'GET', '/api/watchlist');
  log('watchlist after watching', r, `${(r.data as unknown[] | null)?.length ?? 0} item(s) — does watching remove it from the watchlist?`);

  section('Ratings');
  log('rate Parasite 9',         await api(A, 'POST', '/api/ratings', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', score: 9 }));
  log('re-rate Parasite 8',      await api(A, 'POST', '/api/ratings', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', score: 8 }));
  log('rate 11 (invalid)',       await api(A, 'POST', '/api/ratings', { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE', score: 11 }));
  log('rate 7.5 (invalid)',      await api(A, 'POST', '/api/ratings', { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE', score: 7.5 }));
  log('rate 0 (invalid)',        await api(A, 'POST', '/api/ratings', { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE', score: 0 }));
  r = await api(A, 'GET', '/api/ratings');
  log('ratings list', r, `${(r.data as unknown[] | null)?.length ?? 0} — one film rated twice must be one row`);

  section('Reviews');
  const rev = await api(A, 'POST', '/api/reviews', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', body: 'A staircase movie. Every floor is a class.', containsSpoiler: false });
  log('write review', rev);
  log('second review, same film', await api(A, 'POST', '/api/reviews', { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', body: 'Trying to write a second one.' }));
  log('empty review',            await api(A, 'POST', '/api/reviews', { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE', body: '' }));
  log('review with a script tag',await api(A, 'POST', '/api/reviews', { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE', body: '<script>alert(1)</script> good film' }));
  r = await api(A, 'GET', `/api/reviews?tmdbId=${FILMS.seven.tmdbId}&mediaType=MOVIE`);
  log('read it back', r, JSON.stringify(r.data).slice(0, 120));

  section('Favourites');
  for (const f of [FILMS.parasite, FILMS.godfather, FILMS.seven, FILMS.amelie]) {
    log(`favourite ${f.title}`,  await api(A, 'POST', '/api/favorites', { tmdbId: f.tmdbId, mediaType: 'MOVIE' }));
  }
  r = await api(A, 'GET', '/api/favorites');
  log('favourites', r, `${(r.data as unknown[] | null)?.length ?? 0} — is there a cap, and what happens past it?`);
  log('remove one',              await api(A, 'DELETE', `/api/favorites/${FILMS.amelie.tmdbId}?mediaType=MOVIE`));
  r = await api(A, 'GET', '/api/favorites');
  log('favourites after remove', r, `${(r.data as unknown[] | null)?.length ?? 0}`);

  section('Shows');
  log('watch Breaking Bad',      await api(A, 'POST', '/api/watched', { tmdbId: SHOWS.breakingBad.tmdbId, mediaType: 'SHOW' }));
  log('episode S1E1',            await api(A, 'POST', '/api/watched/episodes', { showTmdbId: SHOWS.breakingBad.tmdbId, season: 1, episode: 1 }));
  log('same episode again',      await api(A, 'POST', '/api/watched/episodes', { showTmdbId: SHOWS.breakingBad.tmdbId, season: 1, episode: 1 }));
  r = await api(A, 'GET', `/api/watched/episodes/${SHOWS.breakingBad.tmdbId}`);
  log('episodes for the show', r, JSON.stringify(r.data).slice(0, 120));

  section('Unwind');
  log('unwatch The Godfather',   await api(A, 'DELETE', `/api/watched/${FILMS.godfather.tmdbId}?mediaType=MOVIE`));
  log('unrate Parasite',         await api(A, 'DELETE', `/api/ratings/${FILMS.parasite.tmdbId}?mediaType=MOVIE`));
  r = await api(A, 'GET', '/api/ratings');
  log('ratings after unrate', r, `${(r.data as unknown[] | null)?.length ?? 0}`);

  section('Signed out');
  log('watchlist while signed out', await api(null, 'GET', '/api/watchlist'));
  log('write as nobody',            await api(null, 'POST', '/api/watched', { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE' }));
}

main().catch(e => { console.error(e); process.exit(1); });
