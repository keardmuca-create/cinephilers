import { api, log, section, FILMS } from './driver';

const arr = (d: unknown) => Array.isArray(d) ? d : [];

async function main() {
  const A = 'test_alpha', B = 'test_beta';
  const film = FILMS.spirited.tmdbId;

  section('Feed — correct shape (bare array)');
  let r = await api(A, 'GET', '/api/feed');
  const own = arr(r.data) as { type: string; user: { username: string }; tmdbId: string }[];
  log('alpha feed', r, `${own.length} item(s)`);
  for (const i of own) console.log(`    ${i.type.padEnd(15)} @${i.user.username.padEnd(13)} ${i.tmdbId}`);

  log('alpha follows beta', await api(A, 'POST', `/api/users/${B}/follow`));
  r = await api(A, 'GET', '/api/feed');
  const withB = arr(r.data) as { type: string; user: { username: string } }[];
  log('feed with beta', r, `${withB.length} item(s), from ${[...new Set(withB.map(i => i.user.username))].join(', ')}`);

  section('Community score — the 5-vote flip');
  r = await api(A, 'GET', `/api/movies/ratings?ids=${film}`);
  log(`5 votes cast on ${film}`, r, JSON.stringify(r.data));
  r = await api(A, 'GET', `/api/movies/ratings?ids=${FILMS.seven.tmdbId}`);
  log('a film with only 1 vote', r, JSON.stringify(r.data));

  section("Friends' ratings on a title");
  r = await api(A, 'GET', `/api/movies/friends-ratings?tmdbId=${FILMS.seven.tmdbId}`);
  log('alpha follows beta, who rated Se7en 8', r, JSON.stringify(r.data).slice(0, 200));

  section('Why world-cinema is 0 — FilmMeta is empty in a fresh database');
  r = await api(A, 'GET', `/api/meta/${FILMS.parasite.tmdbId}`);
  log('fetch meta for Parasite', r, JSON.stringify(r.data).slice(0, 130));
  r = await api(A, 'GET', `/api/meta/${FILMS.spirited.tmdbId}`);
  log('fetch meta for Spirited Away', r, JSON.stringify(r.data).slice(0, 130));
  // Badges are cached; force a rebuild by asking as the owner.
  r = await api(A, 'GET', `/api/users/${A}/languages`);
  log('languages after meta exists', r, JSON.stringify(r.data));
  r = await api(A, 'GET', '/api/stats');
  const st = r.data as { watchMinutes?: { total: number } };
  log('stats watchMinutes', r, JSON.stringify(st?.watchMinutes));

  section('Today\'s Pick');
  r = await api(A, 'GET', '/api/daily-pick');
  log('GET pick', r, JSON.stringify(r.data).slice(0, 150));
  r = await api(A, 'POST', '/api/daily-pick');
  log('generate pick', r, JSON.stringify(r.data).slice(0, 150));
  r = await api('test_theta', 'POST', '/api/daily-pick');
  log('generate with empty watchlist', r, r.message ?? JSON.stringify(r.data).slice(0, 120));

  section('Discovery and search');
  for (const p of ['/api/discover?type=movie', '/api/movies/popular', '/api/movies/search?q=godfather', '/api/tmdb/search?q=parasite', '/api/top-watched', '/api/home-pool']) {
    const rr = await api(A, 'GET', p);
    log(p, rr, `${arr(rr.data).length || Object.keys((rr.data as object) ?? {}).length} result(s)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
