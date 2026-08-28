import { api, log, section, FILMS } from './driver';

interface Feed { items?: { user?: { username?: string } }[] }
const feedOf = async (who: string) => {
  const r = await api(who, 'GET', '/api/feed');
  const f = r.data as Feed;
  return { r, n: f.items?.length ?? 0, who: [...new Set((f.items ?? []).map(i => i.user?.username))] };
};

async function main() {
  const A = 'test_alpha', B = 'test_beta';
  const RATERS = ['test_beta', 'test_gamma', 'test_epsilon', 'test_zeta', 'test_eta'];

  section('Does the feed go stale after an unfollow?');
  log('alpha follows beta', await api(A, 'POST', `/api/users/${B}/follow`));
  let f = await feedOf(A);
  log('feed with beta followed', f.r, `${f.n} item(s) from ${f.who.join(', ')}`);
  log('alpha unfollows beta', await api(A, 'DELETE', `/api/users/${B}/follow`));
  f = await feedOf(A);
  log('feed IMMEDIATELY after', f.r, `${f.n} item(s) from ${f.who.join(', ')}`);
  await new Promise(r => setTimeout(r, 3000));
  f = await feedOf(A);
  log('feed 3s later', f.r, `${f.n} item(s) from ${f.who.join(', ')}`);

  section('Community score — the 5-vote flip');
  const film = FILMS.spirited.tmdbId;
  for (let i = 0; i < RATERS.length; i++) {
    const who = RATERS[i];
    const score = [9, 8, 10, 7, 9][i];
    log(`${who} rates ${score}`, await api(who, 'POST', '/api/ratings', { tmdbId: film, mediaType: 'MOVIE', score }));
    const r = await api(A, 'GET', `/api/movies/community-ratings?ids=${film}`);
    console.log(`      after ${i + 1} vote(s): ${JSON.stringify(r.data)}`);
  }

  section('Badges');
  let r = await api(A, 'GET', `/api/users/${A}/badges`);
  const badges = (r.data as { earned?: { id: string; count: number; tier: string | null; next: number | null }[] })?.earned ?? [];
  log('alpha badges', r, `${badges.length} badges`);
  for (const b of badges) console.log(`    ${b.id.padEnd(18)} count=${String(b.count).padEnd(4)} tier=${b.tier ?? '-'}  next=${b.next ?? '-'}`);

  section('Languages panel (new today)');
  r = await api(A, 'GET', `/api/users/${A}/languages`);
  log('alpha languages', r, JSON.stringify(r.data));
  r = await api(A, 'GET', '/api/users/test_theta/languages');
  log('empty account languages', r, JSON.stringify(r.data));

  section('Stats');
  r = await api(A, 'GET', '/api/stats');
  log('alpha stats', r, JSON.stringify(r.data).slice(0, 250));
  r = await api('test_theta', 'GET', '/api/stats');
  log('empty account stats', r, JSON.stringify(r.data).slice(0, 250));

  section('Empty account — every list');
  for (const p of ['/api/sync', '/api/feed', '/api/diary', '/api/notifications', '/api/lists', '/api/watchlist']) {
    const rr = await api('test_theta', 'GET', p);
    log(p, rr, JSON.stringify(rr.data).slice(0, 90));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
