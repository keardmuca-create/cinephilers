export interface ActivityEntry {
  id: string;
  action: 'watched' | 'rated' | 'watchlist' | 'reviewed';
  contentId: string;
  contentTitle: string;
  contentPoster: string;
  contentYear: string;
  rating?: number;
  timestamp: string;
  likes: string[];
}

const KEY = 'activity-feed';

export function logActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp' | 'likes'>) {
  try {
    const feed: ActivityEntry[] = getFeed();
    const filtered = feed.filter(e => !(e.action === entry.action && e.contentId === entry.contentId));
    const next: ActivityEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      likes: [],
    };
    localStorage.setItem(KEY, JSON.stringify([next, ...filtered].slice(0, 100)));
  } catch { /* ignore */ }
}

export function removeActivity(action: string, contentId: string) {
  try {
    const feed = getFeed().filter(e => !(e.action === action && e.contentId === contentId));
    localStorage.setItem(KEY, JSON.stringify(feed));
  } catch { /* ignore */ }
}

const DISMISS_KEY = 'activity-dismissed';

// Activity cards are derived from both the local log AND the server feed (which
// includes our own activity). Removing only the local copy lets the server twin
// reappear, so we also record a dismissed key the feed filters out from both sources.
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

export function toggleLike(entryId: string) {
  try {
    const feed = getFeed().map(e => {
      if (e.id !== entryId) return e;
      const liked = e.likes.includes('me');
      return { ...e, likes: liked ? e.likes.filter(l => l !== 'me') : [...e.likes, 'me'] };
    });
    localStorage.setItem(KEY, JSON.stringify(feed));
    return feed;
  } catch { return getFeed(); }
}

export function getFeed(): ActivityEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ActivityEntry[];
  } catch { return []; }
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
