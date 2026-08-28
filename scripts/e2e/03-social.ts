import { api, log, section, FILMS } from './driver';

interface Paged { items?: unknown[]; total?: number }
const len = (d: unknown) => Array.isArray(d) ? d.length : ((d as Paged)?.items?.length ?? 0);

async function main() {
  const A = 'test_alpha', B = 'test_beta', C = 'test_gamma', D = 'test_delta';

  section('Give beta something to be seen doing');
  log('beta watches Se7en',  await api(B, 'POST', '/api/watched', { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE' }));
  log('beta rates it 8',     await api(B, 'POST', '/api/ratings', { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE', score: 8 }));
  const bRev = await api(B, 'POST', '/api/reviews', { tmdbId: FILMS.seven.tmdbId, mediaType: 'MOVIE', body: 'What is in the box stays in the box.' });
  log('beta reviews it', bRev);
  const reviewId = (bRev.data as { id?: string } | null)?.id;

  section('Search for people');
  let r = await api(A, 'GET', '/api/users/search?q=test');
  log('search "test"', r, `${len(r.data)} user(s)`);
  r = await api(A, 'GET', '/api/users/search?q=beta');
  log('search "beta"', r, `${len(r.data)} user(s)`);
  r = await api(A, 'GET', '/api/users/search?q=');
  log('search empty', r, `${len(r.data)} user(s)`);

  section('Follow a public account');
  log('alpha follows beta',   await api(A, 'POST', `/api/users/${B}/follow`));
  log('alpha follows again',  await api(A, 'POST', `/api/users/${B}/follow`), 'must not double-count');
  r = await api(A, 'GET', `/api/users/${B}/followers`);
  log("beta's followers", r, `${len(r.data)}`);
  r = await api(A, 'GET', `/api/users/${A}/following`);
  log("alpha's following", r, `${len(r.data)}`);
  log('alpha follows HIMSELF', await api(A, 'POST', `/api/users/${A}/follow`), 'should be refused');

  section("Beta's activity in alpha's feed");
  r = await api(A, 'GET', '/api/feed');
  log("alpha's feed", r, `${len(r.data)} item(s)`);
  console.log('  ' + JSON.stringify((r.data as Paged)?.items?.[0] ?? (r.data as unknown[])?.[0] ?? null).slice(0, 200));
  r = await api(C, 'GET', '/api/feed');
  log("gamma's feed (follows nobody)", r, `${len(r.data)} item(s) — must be empty`);

  section('Notifications');
  r = await api(B, 'GET', '/api/notifications');
  log('beta was followed', r, `${len(r.data)} notification(s)`);
  console.log('  ' + JSON.stringify((r.data as Paged)?.items?.[0] ?? (r.data as unknown[])?.[0] ?? null).slice(0, 200));
  log('mark read', await api(B, 'PATCH', '/api/notifications/read', {}));
  r = await api(B, 'GET', '/api/notifications');
  log('after marking read', r, `${len(r.data)}`);

  section('Review likes and comments');
  if (reviewId) {
    log('alpha likes it',        await api(A, 'POST', `/api/reviews/${reviewId}/like`));
    log('alpha likes it again',  await api(A, 'POST', `/api/reviews/${reviewId}/like`), 'toggle or duplicate?');
    log('alpha comments',        await api(A, 'POST', `/api/reviews/${reviewId}/comments`, { body: 'Agreed.' }));
    log('empty comment',         await api(A, 'POST', `/api/reviews/${reviewId}/comments`, { body: '' }));
    log('signed-out comment',    await api(null, 'POST', `/api/reviews/${reviewId}/comments`, { body: 'hello' }));
    r = await api(A, 'GET', `/api/reviews/${reviewId}/comments`);
    log('comments', r, `${len(r.data)}`);
    log('alpha DELETES beta\'s review', await api(A, 'DELETE', `/api/reviews/${reviewId}`), 'must be refused');
  }

  section('A private account');
  log('alpha requests delta',      await api(A, 'POST', `/api/users/${D}/follow`));
  log("alpha reads delta's badges", await api(A, 'GET', `/api/users/${D}/badges`), 'must be 403 until accepted');
  log("alpha reads delta's watched", await api(A, 'GET', `/api/users/${D}/watched`), 'must be 403');
  r = await api(D, 'GET', '/api/follow-requests');
  log('delta sees the request', r, `${len(r.data)} request(s)`);
  const reqId = ((r.data as Paged)?.items?.[0] as { id?: string })?.id ?? (r.data as { id?: string }[])?.[0]?.id;
  if (reqId) {
    log('delta accepts', await api(D, 'POST', `/api/follow-requests/${reqId}`, { action: 'accept' }));
    log("alpha reads delta's badges now", await api(A, 'GET', `/api/users/${D}/badges`), 'should be 200');
  } else {
    console.log('  (no request id found — shape: ' + JSON.stringify(r.data).slice(0, 200) + ')');
  }

  section('Unfollow');
  log('alpha unfollows beta', await api(A, 'DELETE', `/api/users/${B}/follow`));
  r = await api(A, 'GET', `/api/users/${B}/followers`);
  log("beta's followers", r, `${len(r.data)}`);
  r = await api(A, 'GET', '/api/feed');
  log("alpha's feed after unfollow", r, `${len(r.data)} item(s) — should be empty again`);
}

main().catch(e => { console.error(e); process.exit(1); });
