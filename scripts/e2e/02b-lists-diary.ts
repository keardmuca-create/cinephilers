import { api, log, section, FILMS } from './driver';

interface Paged { items?: unknown[]; total?: number; hasMore?: boolean }

async function main() {
  const A = 'test_alpha';

  section('Lists — correct item shape');
  const lists = await api(A, 'GET', '/api/lists');
  const existing = ((lists.data as Paged | unknown[] | null) as { id: string; name: string }[] | null);
  const arr = Array.isArray(existing) ? existing : ((lists.data as { items?: { id: string; name: string }[] })?.items ?? []);
  log('my lists', lists, `${arr.length} list(s)`);
  const listId = arr[0]?.id;
  if (!listId) { console.log('  no list to work with'); return; }

  log('add Parasite',  await api(A, 'POST', `/api/lists/${listId}/items`, { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', title: 'Parasite', year: '2019' }));
  log('add it again',  await api(A, 'POST', `/api/lists/${listId}/items`, { tmdbId: FILMS.parasite.tmdbId, mediaType: 'MOVIE', title: 'Parasite', year: '2019' }));
  log('add Se7en',     await api(A, 'POST', `/api/lists/${listId}/items`, { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE', title: 'Se7en', year: '1995' }));
  log('note over 500', await api(A, 'POST', `/api/lists/${listId}/items`, { tmdbId: FILMS.spirited.tmdbId, mediaType: 'MOVIE', note: 'x'.repeat(600) }));

  let r = await api(A, 'GET', `/api/lists/${listId}`);
  const items = (r.data as { items?: unknown[] } | null)?.items ?? [];
  log('read list', r, `${items.length} item(s) — duplicate add must not make two`);

  section('Lists — other people');
  log('beta reads a PUBLIC list',  await api('test_beta', 'GET', `/api/lists/${listId}`));
  log('beta ADDS to my list',      await api('test_beta', 'POST', `/api/lists/${listId}/items`, { tmdbId: FILMS.godfather.tmdbId, mediaType: 'MOVIE' }), 'must be refused');
  log('beta DELETES my list',      await api('test_beta', 'DELETE', `/api/lists/${listId}`), 'must be refused');
  log('signed out reads it',       await api(null, 'GET', `/api/lists/${listId}`));

  section('Diary');
  r = await api(A, 'GET', '/api/diary');
  const d = r.data as Paged | null;
  log('diary', r, `${d?.items?.length ?? 0} of ${d?.total ?? 0}`);
  console.log('  entry: ' + JSON.stringify(d?.items?.[0] ?? null).slice(0, 220));

  section('Rewatched');
  r = await api(A, 'GET', `/api/users/${A}/rewatched?min=2&sort=recent&limit=20`);
  const rw = r.data as Paged | null;
  log('rewatched min=2', r, `${rw?.items?.length ?? 0} film(s)`);
  console.log('  entry: ' + JSON.stringify(rw?.items?.[0] ?? null).slice(0, 220));
}

main().catch(e => { console.error(e); process.exit(1); });
