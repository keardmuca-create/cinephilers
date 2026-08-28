import { api, log, section } from './driver';

interface Notifs { notifications?: { id: string; type: string; refId?: string; read: boolean; from?: { username?: string } }[]; unreadCount?: number }
interface Feed { items?: { user?: { username?: string } }[] }

async function main() {
  const A = 'test_alpha', B = 'test_beta', D = 'test_delta';

  section('Notifications — correct shape');
  let r = await api(B, 'GET', '/api/notifications');
  let n = r.data as Notifs;
  log('beta', r, `${n.notifications?.length ?? 0} notification(s), ${n.unreadCount ?? 0} unread`);
  for (const x of n.notifications ?? []) console.log(`    ${x.type} from @${x.from?.username} read=${x.read}`);

  section('Whose activity is in a feed?');
  r = await api(A, 'GET', '/api/feed');
  const f = r.data as Feed;
  const who = [...new Set((f.items ?? []).map(i => i.user?.username))];
  log('alpha feed after unfollowing beta', r, `${f.items?.length ?? 0} item(s) from: ${who.join(', ')}`);
  console.log('  (alpha follows nobody now — so these should all be alpha\'s own)');

  section('Follow request → notification → accept');
  r = await api(D, 'GET', '/api/notifications');
  n = r.data as Notifs;
  log('delta notifications', r, `${n.notifications?.length ?? 0}, ${n.unreadCount ?? 0} unread`);
  for (const x of n.notifications ?? []) console.log(`    ${x.type} from @${x.from?.username} refId=${x.refId}`);

  const req = (n.notifications ?? []).find(x => x.type === 'follow_request');
  if (req?.refId) {
    log("alpha sees delta's badges BEFORE accept", await api(A, 'GET', `/api/users/${D}/badges`), 'expect 403');
    log('delta accepts', await api(D, 'POST', `/api/follow-requests/${req.refId}`));
    log("alpha sees delta's badges AFTER accept", await api(A, 'GET', `/api/users/${D}/badges`), 'expect 200');
    r = await api(A, 'GET', `/api/users/${D}/following`);
    log('is alpha now following delta?', r, JSON.stringify(r.data).slice(0, 100));
  } else {
    console.log('  no follow_request notification found');
  }

  section('Follow back');
  log('delta follows alpha back', await api(D, 'POST', `/api/users/${A}/follow`));
  r = await api(A, 'GET', '/api/notifications');
  n = r.data as Notifs;
  log('alpha notifications', r, `${n.notifications?.length ?? 0}, ${n.unreadCount ?? 0} unread`);
  for (const x of n.notifications ?? []) console.log(`    ${x.type} from @${x.from?.username}`);

  section('Delta unfollows / alpha unfollows');
  log('alpha unfollows delta', await api(A, 'DELETE', `/api/users/${D}/follow`));
  log("alpha reads delta's badges again", await api(A, 'GET', `/api/users/${D}/badges`), 'private again — expect 403');
}

main().catch(e => { console.error(e); process.exit(1); });
