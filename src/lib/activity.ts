// The activity feed is built by the server (/api/feed). What lives here is the little
// the page still keeps on the device: which of your own cards you removed, and how
// a card says when it happened.
//
// There used to be an on-device log of your own activity as well, written on every
// watch, rating, review and watchlist change. The feed stopped reading it once the
// server started including your own activity, and it went on being written for
// nothing, so it is gone. The login sync clears the copy an older version left.

const DISMISS_KEY = 'activity-dismissed';

// Activity cards come from the server feed, which includes our own activity. A
// removed card is recorded here as well as on the server, so it disappears at once
// and stays gone before the next load.
export function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[];
  } catch { return []; }
}

export function dismissActivity(action: string, contentId: string) {
  try {
    const key = `${action}-${contentId}`;
    const set = new Set(getDismissed());
    set.add(key);
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...set].slice(-500)));
  } catch { /* ignore */ }
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
