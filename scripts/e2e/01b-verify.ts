// What did scenario 01 actually leave behind?
import { api, log, section, FILMS, SHOWS } from './driver';
import { sync, counts } from './state';

async function main() {
  const A = 'test_alpha';

  section('State after scenario 01');
  const s = await sync(A);
  console.log('  ' + counts(s));

  section('Questions scenario 01 raised');

  const parasiteWatchlisted = s.watchlist.filter(w => w.tmdbId === FILMS.parasite.tmdbId).length;
  console.log(`  Parasite added to watchlist TWICE -> ${parasiteWatchlisted} row(s) ${parasiteWatchlisted === 1 ? '(correct)' : '(DUPLICATE)'}`);
  console.log(`  ...and it is also marked watched -> still on watchlist? ${parasiteWatchlisted > 0 ? 'YES' : 'no'}`);

  const parasiteReviews = s.reviews.filter(r => r.tmdbId === FILMS.parasite.tmdbId).length;
  console.log(`  Two reviews posted for Parasite -> ${parasiteReviews} row(s) ${parasiteReviews === 1 ? '(replaced, correct)' : '(TWO REVIEWS FOR ONE FILM)'}`);

  const sevenReview = s.reviews.find(r => r.tmdbId === FILMS.seven.tmdbId);
  console.log(`  <script> review stored as: ${JSON.stringify(sevenReview?.body)}`);

  const godfatherWatched = s.watched.some(w => w.tmdbId === FILMS.godfather.tmdbId);
  console.log(`  The Godfather was unwatched -> still present? ${godfatherWatched ? 'YES (delete failed)' : 'no (correct)'}`);

  const parasiteRated = s.ratings.some(r => r.tmdbId === FILMS.parasite.tmdbId);
  console.log(`  Parasite rating was deleted -> still present? ${parasiteRated ? 'YES (delete failed)' : 'no (correct)'}`);

  console.log(`  Favourites now: ${s.favorites.length} (4 added, 1 removed -> expect 3)`);

  const eps = s.watchedEpisodes.filter(e => e.showTmdbId === SHOWS.breakingBad.tmdbId);
  console.log(`  Breaking Bad S1E1 marked twice -> ${eps.length} row(s) ${eps.length === 1 ? '(correct)' : '(DUPLICATE)'}`);

  section('Episodes endpoint');
  const byId = await api(A, 'GET', `/api/watched/episodes/${SHOWS.breakingBad.tmdbId}`);
  log('GET /api/watched/episodes/tmdb-tv-1396', byId, JSON.stringify(byId.data));
  console.log(`  sync says the show id stored is: ${JSON.stringify([...new Set(s.watchedEpisodes.map(e => e.showTmdbId))])}`);
}

main().catch(e => { console.error(e); process.exit(1); });
