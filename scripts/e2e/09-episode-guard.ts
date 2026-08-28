import { api, log, section, SHOWS } from './driver';

async function main() {
  const A = 'test_alpha';
  const show = SHOWS.chernobyl.tmdbId;

  section('Single episode — watched must be explicit');
  log('watched:true  → marks',   await api(A, 'POST', '/api/watched/episodes', { showTmdbId: show, season: 1, episode: 1, watched: true }));
  let r = await api(A, 'GET', `/api/watched/episodes/${show}`);
  log('read back', r, JSON.stringify(r.data));

  log('field omitted → refused', await api(A, 'POST', '/api/watched/episodes', { showTmdbId: show, season: 1, episode: 1 }));
  r = await api(A, 'GET', `/api/watched/episodes/${show}`);
  log('still marked?', r, JSON.stringify(r.data) + '   <- unchanged is the fix');

  log('watched:"yes" → refused', await api(A, 'POST', '/api/watched/episodes', { showTmdbId: show, season: 1, episode: 1, watched: 'yes' }));
  log('watched:false → unmarks',  await api(A, 'POST', '/api/watched/episodes', { showTmdbId: show, season: 1, episode: 1, watched: false }));
  r = await api(A, 'GET', `/api/watched/episodes/${show}`);
  log('read back', r, JSON.stringify(r.data));

  section('Bulk — a whole season was at risk');
  log('bulk watched:true', await api(A, 'POST', '/api/watched/episodes/bulk', {
    showTmdbId: show, episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 }], watched: true,
  }));
  r = await api(A, 'GET', `/api/watched/episodes/${show}`);
  log('read back', r, JSON.stringify(r.data));

  log('bulk, field omitted → refused', await api(A, 'POST', '/api/watched/episodes/bulk', {
    showTmdbId: show, episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 }],
  }));
  r = await api(A, 'GET', `/api/watched/episodes/${show}`);
  log('season survived?', r, JSON.stringify(r.data) + '   <- all three still there');
}

main().catch(e => { console.error(e); process.exit(1); });
