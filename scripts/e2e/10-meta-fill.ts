// What does a new user actually have to DO for Time Watched to fill in?
import { api, log, section } from './driver';

const FILM = 'tmdb-155'; // The Dark Knight — nobody in this database has opened it

async function main() {
  const E = 'test_eta';
  const mins = async () => {
    const r = await api(E, 'GET', '/api/stats');
    return (r.data as { watchMinutes?: { total: number } })?.watchMinutes?.total ?? null;
  };

  section('A film logged but never opened');
  log('mark it watched', await api(E, 'POST', '/api/watched', { tmdbId: FILM, mediaType: 'MOVIE' }));
  console.log(`  Time Watched: ${await mins()} minutes`);

  section('Opening the Watch History page fetches details for the whole library');
  // This is the exact call History makes — /api/meta?ids=… for every row it holds.
  const r = await api(E, 'GET', `/api/meta?ids=${FILM}`);
  log('GET /api/meta?ids=…', r, JSON.stringify(r.data).slice(0, 110));
  console.log(`  Time Watched: ${await mins()} minutes`);

  section('And it is shared, so it is now filled for everyone');
  log('another user marks the same film', await api('test_zeta', 'POST', '/api/watched', { tmdbId: FILM, mediaType: 'MOVIE' }));
  const z = await api('test_zeta', 'GET', '/api/stats');
  console.log(`  test_zeta Time Watched: ${(z.data as { watchMinutes?: { total: number } })?.watchMinutes?.total} minutes — without opening anything`);
}

main().catch(e => { console.error(e); process.exit(1); });
