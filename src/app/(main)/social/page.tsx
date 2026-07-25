"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Star, Eye, Bookmark, Film, MoreHorizontal, Share2, Trash2, Users, MessageSquare, Loader2, UserPlus, Bell, User, Repeat, Sparkles } from 'lucide-react';
import { dismissActivity, getDismissed, relativeTime } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { Button } from '@/components/ui/button';
import { SpoilerWrap } from '@/components/spoiler-wrap';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: 'activity' | 'rewatched' | 'imported' | 'watchlist' | 'watchlist_batch' | 'daily_pick';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  watched?: boolean;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  importPlatform?: string;
  importCount?: number;
  batchCount?: number;
  batchTmdbIds?: string[];
  createdAt: string;
  likeCount?: number;
  likedByMe?: boolean;
}

interface NotificationItem {
  id: string;
  type: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
  // follow_request notifications only: the request's live server-side state,
  // so an already-handled request never shows Accept/Deny again.
  requestStatus?: 'pending' | 'accepted' | 'denied';
  from: { username: string; displayName: string | null; avatarUrl: string | null; isFollowingBack: boolean };
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

const metaCache: Record<string, { title: string; year: string; poster: string }> = {};

async function fetchMeta(tmdbId: string) {
  if (metaCache[tmdbId]) return metaCache[tmdbId];
  try {
    const cached = localStorage.getItem(`meta-${tmdbId}`);
    if (cached) {
      const m = JSON.parse(cached);
      const meta = { title: m.title ?? 'Unknown', year: m.year ?? '', poster: m.poster ?? '' };
      metaCache[tmdbId] = meta;
      return meta;
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(`/api/meta/${tmdbId}`);
    if (!res.ok) return null;
    const d = await res.json();
    const meta = { title: d.title ?? 'Unknown', year: d.year ?? '', poster: d.poster ?? '' };
    metaCache[tmdbId] = meta;
    return meta;
  } catch { return null; }
}

function UserAvatar({ user, size = 40 }: {
  user: { username: string; displayName?: string | null; avatarUrl?: string | null };
  size?: number;
}) {
  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase();
  return (
    <div className="rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden" style={{ width: size, height: size }}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
        : <span className="text-primary font-bold text-sm">{initials}</span>
      }
    </div>
  );
}

// ─── Unified Activity Card ─────────────────────────────────────────────────────

interface UnifiedItem {
  id: string;
  isMe: boolean;
  type: 'activity' | 'rewatched' | 'watchlist' | 'watchlist_batch' | 'daily_pick' | 'imported';
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  meta?: { title: string; year: string; poster: string };
  watched?: boolean;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  importPlatform?: string;
  importCount?: number;
  batchCount?: number;
  batchTmdbIds?: string[];
  createdAt: string;
  // server-backed social likes (activity/rewatched/watchlist cards)
  likeCount?: number;
  likedByMe?: boolean;
}

const LIKEABLE_TYPES = ['activity', 'rewatched', 'watchlist'];

function ActivityCard({ item, onToggleLike, onRemove }: {
  item: UnifiedItem;
  onToggleLike?: (item: UnifiedItem) => void;
  onRemove?: (item: UnifiedItem) => void;
}) {
  const [meta, setMeta] = useState(item.meta ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (meta) return;
    fetchMeta(item.tmdbId).then(m => { if (m) setMeta(m); });
  }, [item.tmdbId, meta]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const href = `/movie/${item.tmdbId}`;
  const liked = item.likedByMe ?? false;
  // Your own activity keeps the same layout as everyone else's, but gets a
  // subtle tint so it's easy to pick your own entries out of the feed.
  const mine = item.isMe;

  const handleShare = () => {
    setMenuOpen(false);
    if (navigator.share) navigator.share({ title: meta?.title ?? '', url: href }).catch(() => {});
    else navigator.clipboard.writeText(`${window.location.origin}${href}`).catch(() => {});
  };

  // Import activity card — no movie poster, just a summary banner
  if (item.type === 'imported') {
    const platformLabel = item.importPlatform === 'letterboxd' ? 'Letterboxd' : item.importPlatform === 'imdb' ? 'IMDb' : item.importPlatform ?? 'another platform';
    const platformColor = item.importPlatform === 'letterboxd' ? 'text-orange-400 bg-orange-400/10' : 'text-yellow-400 bg-yellow-400/10';
    const platformLetter = item.importPlatform === 'letterboxd' ? 'L' : 'i';
    return (
      <div className={`rounded-3xl border shadow-lg overflow-hidden ${mine ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
        <div className="flex items-center gap-3 px-5 py-4">
          <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`}>
            <UserAvatar user={item.user} size={40} />
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`} className="text-sm font-bold font-headline hover:text-primary transition-colors">
              {item.user.displayName ?? item.user.username}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">{relativeTime(item.createdAt)}</p>
          </div>
        </div>
        <div className="mx-5 mb-4 flex items-center gap-3 bg-muted/40 rounded-2xl p-3.5 border border-border">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 font-black text-base ${platformColor}`}>
            {platformLetter}
          </div>
          <p className="text-sm text-foreground/80 leading-snug">
            Imported <span className="font-bold text-foreground">{item.importCount?.toLocaleString()} film{item.importCount !== 1 ? 's' : ''}</span> from <span className="font-semibold">{platformLabel}</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-3xl border shadow-lg overflow-hidden ${mine ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`}>
          <UserAvatar user={item.user} size={40} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`} className="text-sm font-bold font-headline hover:text-primary transition-colors">
            {item.isMe ? (item.user.displayName ?? item.user.username) : (item.user.displayName ?? item.user.username)}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.type === 'activity' && (
              <>
                {item.watched && <Eye className="h-3.5 w-3.5 text-blue-400" />}
                {item.rating !== undefined && <Star className="h-3.5 w-3.5 text-yellow-400 fill-current" />}
                {item.reviewBody && <MessageSquare className="h-3.5 w-3.5 text-green-400" />}
                <span>{[item.watched ? 'Watched' : null, item.rating !== undefined ? `Rated ${item.rating}/10` : null, item.reviewBody ? 'Reviewed' : null].filter(Boolean).join(' · ')}</span>
              </>
            )}
            {item.type === 'rewatched' && <><Repeat className="h-3.5 w-3.5 text-primary" /><span>Rewatched</span></>}
            {item.type === 'watchlist' && <><Bookmark className="h-3.5 w-3.5 text-primary" /><span>Added to watchlist</span></>}
            {item.type === 'daily_pick' && <><Sparkles className="h-3.5 w-3.5 text-accent" /><span>Today&apos;s pick</span></>}
            <span>·</span>
            <span>{relativeTime(item.createdAt)}</span>
          </div>
        </div>
        {item.isMe && item.type !== 'daily_pick' && (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-50 min-w-[140px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
                <button onClick={handleShare} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                  <Share2 className="h-4 w-4 text-muted-foreground" />Share
                </button>
                <button onClick={() => { setMenuOpen(false); onRemove?.(item); }} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-destructive">
                  <Trash2 className="h-4 w-4" />Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Movie card */}
      <Link href={href} className="block mx-5 mb-4 group">
        <div className="bg-muted/40 rounded-2xl p-3.5 flex gap-4 hover:bg-muted/70 transition-colors border border-border">
          <div className="relative w-16 shrink-0 rounded-xl overflow-hidden shadow-md bg-muted" style={{ aspectRatio: '2/3' }}>
            {meta?.poster
              ? <Image src={meta.poster} alt={meta.title} fill className="object-cover" sizes="64px" />
              : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-primary/60" /></div>
            }
          </div>
          <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
            {meta
              ? <><h3 className="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-2 leading-snug">{meta.title}</h3>
                  {meta.year && <p className="text-xs text-muted-foreground">{meta.year}</p>}</>
              : <><div className="h-4 bg-muted rounded-full w-3/4 animate-pulse" /><div className="h-3 bg-muted rounded-full w-1/4 animate-pulse mt-1" /></>
            }
            {item.type === 'activity' && item.rating !== undefined && (
              <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm bg-yellow-400/10 w-fit px-2.5 py-0.5 rounded-full">
                <Star className="h-3.5 w-3.5 fill-current" />{item.rating} / 10
              </div>
            )}
            {item.type === 'activity' && item.reviewBody && (
              <SpoilerWrap isSpoiler={item.containsSpoiler}>
                <p className="text-xs text-muted-foreground line-clamp-2 italic leading-relaxed">
                  &ldquo;{item.reviewBody}&rdquo;
                </p>
              </SpoilerWrap>
            )}
          </div>
        </div>
      </Link>

      {/* Like — real server-backed likes on every activity card (yours and
          friends'); the owner gets a notification when someone likes theirs */}
      {LIKEABLE_TYPES.includes(item.type) && item.tmdbId && (
        <div className="px-5 pb-4">
          <button onClick={() => onToggleLike?.(item)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
            <Heart className={`h-5 w-5 transition-colors ${liked ? 'fill-primary text-primary' : ''}`} />
            {(item.likeCount ?? 0) > 0 && <span>{item.likeCount}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Watchlist batch card ──────────────────────────────────────────────────────
// A burst of watchlist adds collapsed into one card (poster strip), so a
// browsing session doesn't flood followers. Informational — no like/menu,
// matching the import summary card.
function WatchlistBatchCard({ item }: { item: UnifiedItem }) {
  const ids = item.batchTmdbIds ?? [];
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(ids.map(async id => {
        const m = await fetchMeta(id);
        return [id, m?.poster ?? ''] as const;
      }));
      if (!cancelled) setPosters(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div className="bg-card rounded-3xl border border-border shadow-lg overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`}>
          <UserAvatar user={item.user} size={40} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={item.isMe ? '/profile' : `/profile/${item.user.username}`} className="text-sm font-bold font-headline hover:text-primary transition-colors">
            {item.user.displayName ?? item.user.username}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bookmark className="h-3.5 w-3.5 text-primary" />
            <span>Added {item.batchCount} to watchlist</span>
            <span>·</span>
            <span>{relativeTime(item.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2 px-5 pb-5 overflow-x-auto no-scrollbar">
        {ids.map(id => (
          <Link key={id} href={`/movie/${id}`} className="shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm">
            {posters[id]
              ? <Image src={posters[id]} alt="" width={56} height={84} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/50" /></div>
            }
          </Link>
        ))}
        {(item.batchCount ?? 0) > ids.length && (
          <div className="shrink-0 w-14 aspect-[2/3] rounded-lg bg-muted/60 border border-border flex items-center justify-center">
            <span className="text-xs font-bold text-muted-foreground">+{(item.batchCount ?? 0) - ids.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notification Card ─────────────────────────────────────────────────────────

function NotificationCard({ notif, onFollowBack, onRequestHandled }: {
  notif: NotificationItem;
  onFollowBack: (username: string) => void;
  onRequestHandled: (notifId: string) => void;
}) {
  const [followState, setFollowState] = useState<'idle' | 'loading' | 'following' | 'requested'>(notif.from.isFollowingBack ? 'following' : 'idle');
  const [requestState, setRequestState] = useState<'pending' | 'loading' | 'accepted' | 'denied'>(notif.requestStatus ?? 'pending');
  const [movieMeta, setMovieMeta] = useState<{ title: string; poster: string } | null>(null);

  // Notification types whose refId is a tmdbId — show the movie thumbnail.
  const isReviewNotif = notif.type === 'review_like' || notif.type === 'review_comment' || notif.type === 'activity_like';

  useEffect(() => {
    if (!isReviewNotif || !notif.refId) return;
    fetchMeta(notif.refId).then(m => { if (m) setMovieMeta(m); });
  }, [isReviewNotif, notif.refId]);

  const handleFollowBack = async () => {
    setFollowState('loading');
    try {
      const res = await fetch(`/api/users/${notif.from.username}/follow`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        // Private accounts answer { requested: true } — show "Requested",
        // it's a pending request, not a follow.
        const json = await res.json().catch(() => null);
        if (json?.data?.requested === true) {
          setFollowState('requested');
        } else {
          setFollowState('following');
          onFollowBack(notif.from.username);
        }
      } else setFollowState('idle');
    } catch { setFollowState('idle'); }
  };

  const handleRequest = async (action: 'accept' | 'deny') => {
    if (!notif.refId) return;
    setRequestState('loading');
    const method = action === 'accept' ? 'POST' : 'DELETE';
    try {
      const res = await fetch(`/api/follow-requests/${notif.refId}`, { method, credentials: 'include' });
      if (res.ok || res.status === 404) {
        // 404 = the request row is already gone (handled elsewhere) — resolve
        // the card instead of bouncing back to Accept/Deny forever.
        setRequestState(action === 'accept' ? 'accepted' : 'denied');
        onRequestHandled(notif.id);
      } else setRequestState('pending');
    } catch { setRequestState('pending'); }
  };

  const text = {
    follow: 'followed you',
    follow_accept: 'accepted your follow request',
    follow_request: 'wants to follow you',
    review_like: 'liked your review',
    activity_like: 'liked your activity',
    review_comment: 'commented on your review',
  }[notif.type] ?? notif.type;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${notif.read ? 'border-border bg-card' : 'border-primary/20 bg-primary/5'}`}>
      <Link href={`/profile/${notif.from.username}`}>
        <UserAvatar user={notif.from} size={44} />
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <Link href={`/profile/${notif.from.username}`} className="font-bold hover:text-primary transition-colors">
            {notif.from.displayName ?? notif.from.username}
          </Link>
          {' '}
          <span className="text-muted-foreground">{text}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{relativeTime(notif.createdAt)}</p>

        {/* Movie poster for review notifications */}
        {isReviewNotif && notif.refId && (
          <Link href={`/movie/${notif.refId}/reviews`} className="flex items-center gap-2.5 mt-2.5 bg-muted/40 hover:bg-muted/70 transition-colors rounded-xl p-2 group">
            {movieMeta?.poster
              ? <img src={movieMeta.poster} alt={movieMeta.title} className="w-8 rounded-lg object-cover shrink-0" style={{ aspectRatio: '2/3' }} />
              : <div className="w-8 rounded-lg bg-muted shrink-0" style={{ aspectRatio: '2/3' }} />
            }
            <span className="text-xs font-bold text-foreground/80 group-hover:text-primary transition-colors truncate">
              {movieMeta?.title ?? 'View review'}
            </span>
          </Link>
        )}

        {/* Follow request accept/deny */}
        {notif.type === 'follow_request' && (requestState === 'pending' || requestState === 'loading') && (
          <div className="flex gap-2 mt-2.5">
            <Button size="sm" className="rounded-xl font-bold text-xs h-8 px-3" onClick={() => handleRequest('accept')} disabled={requestState === 'loading'}>
              Accept
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl font-bold text-xs h-8 px-3" onClick={() => handleRequest('deny')} disabled={requestState === 'loading'}>
              Deny
            </Button>
          </div>
        )}
        {notif.type === 'follow_request' && requestState === 'accepted' && (
          <p className="text-xs text-green-400 font-bold mt-1.5">Accepted</p>
        )}
        {notif.type === 'follow_request' && requestState === 'denied' && (
          <p className="text-xs text-muted-foreground font-bold mt-1.5">Denied</p>
        )}
      </div>

      {/* Follow back button for regular follows */}
      {notif.type === 'follow' && (
        followState === 'following'
          ? <span className="text-xs text-muted-foreground font-bold px-3 py-1.5 rounded-xl border border-border shrink-0">Following</span>
          : followState === 'requested'
            ? <span className="text-xs text-muted-foreground font-bold px-3 py-1.5 rounded-xl border border-border shrink-0">Requested</span>
            : <Button size="sm" variant="outline" className="rounded-xl font-bold text-xs gap-1.5 shrink-0" onClick={handleFollowBack} disabled={followState === 'loading'}>
                {followState === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5" />Follow back</>}
              </Button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'activity' | 'notifications';

const FEED_CACHE_KEY = 'friend-feed-cache';

export default function SocialPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('activity');

  // Activity feed (server-fed: my activity + the people I follow)
  const [friendFeed, setFriendFeed] = useState<FeedItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!user) return;
    // Show cached feed immediately so the page isn't blank while the request is in-flight
    try {
      const cached = localStorage.getItem(FEED_CACHE_KEY);
      if (cached) setFriendFeed(JSON.parse(cached));
    } catch { /* ignore */ }
    setActivityLoading(true);
    try {
      const res = await fetchWithAuth('/api/feed?limit=30');
      if (res.ok) {
        const json = await res.json();
        const feed: FeedItem[] = json.data ?? [];
        const ids = [...new Set(feed.map(f => f.tmdbId).filter(Boolean))];
        if (ids.length > 0) {
          const map = await batchFetchMeta(ids);
          for (const [id, m] of Object.entries(map)) {
            metaCache[id] = { title: m.title, year: m.year, poster: m.poster };
          }
        }
        setFriendFeed(feed);
        try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(feed)); } catch { /* ignore */ }
      }
    } catch { /* network error (e.g. app reopened while offline) — keep cached feed */
    } finally {
      setActivityLoading(false);
    }
  }, [user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      const res = await fetchWithAuth('/api/notifications');
      if (res.ok) {
        const json = await res.json();
        const notifs: NotificationItem[] = json.data?.notifications ?? [];
        const reviewRefIds = [...new Set(
          notifs
            .filter(n => (n.type === 'review_like' || n.type === 'review_comment') && n.refId)
            .map(n => n.refId as string)
        )];
        if (reviewRefIds.length > 0) {
          const map = await batchFetchMeta(reviewRefIds);
          for (const [id, m] of Object.entries(map)) {
            metaCache[id] = { title: m.title, year: m.year, poster: m.poster };
          }
        }
        setNotifications(notifs);
        setUnreadCount(json.data?.unreadCount ?? 0);
      }
    } catch { /* network error — keep current notifications */
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) { loadActivity(); loadNotifications(); } }, [user, loadActivity, loadNotifications]);

  // Refresh on visibility change
  useEffect(() => {
    const onVisible = () => {
      if (!user || document.visibilityState !== 'visible') return;
      loadActivity();
      loadNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, loadActivity, loadNotifications]);

  // Mark notifications as read when tab is opened
  useEffect(() => {
    if (tab === 'notifications' && unreadCount > 0) {
      fetchWithAuth('/api/notifications/read', { method: 'PATCH' })
        .then(() => {
          setUnreadCount(0);
          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        })
        .catch(() => {});
    }
  }, [tab, unreadCount]);

  // The feed is entirely server-fed now (the server merges each film's watched
  // + rated + reviewed into one 'activity' card and includes my own activity),
  // so there's no local/server merge — just map, dismiss-filter, and sort.
  const mergedActivity: UnifiedItem[] = React.useMemo(() => {
    const dismissed = new Set(getDismissed());
    return friendFeed
      .filter(f => !dismissed.has(`${f.type}-${f.tmdbId}`))
      .map(f => ({
        id: f.id,
        isMe: f.user.username === user?.username,
        type: f.type,
        user: f.user,
        tmdbId: f.tmdbId,
        watched: f.watched,
        rating: f.rating,
        reviewBody: f.reviewBody,
        containsSpoiler: f.containsSpoiler,
        importPlatform: f.importPlatform,
        importCount: f.importCount,
        batchCount: f.batchCount,
        batchTmdbIds: f.batchTmdbIds,
        likeCount: f.likeCount,
        likedByMe: f.likedByMe,
        createdAt: f.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [friendFeed, user]);

  // Toggle a like; the server returns the new state + count, written back into
  // friendFeed (the single source of truth) so every view re-renders.
  const likeBusy = useRef(new Set<string>());
  const handleToggleLike = async (item: UnifiedItem) => {
    const key = `${item.user.username}:${item.type}:${item.tmdbId}`;
    if (likeBusy.current.has(key)) return;
    likeBusy.current.add(key);
    try {
      const res = await fetchWithAuth('/api/activity/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: item.user.username, type: item.type, tmdbId: item.tmdbId }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const { liked, count } = json.data as { liked: boolean; count: number };
      setFriendFeed(prev => prev.map(f =>
        f.user.username === item.user.username && f.type === item.type && f.tmdbId === item.tmdbId
          ? { ...f, likedByMe: liked, likeCount: count }
          : f
      ));
    } catch { /* ignore */ }
    finally { likeBusy.current.delete(key); }
  };

  const handleRemove = (item: UnifiedItem) => {
    // Dismiss locally for instant removal, then persist the hide server-side.
    dismissActivity(item.type, item.tmdbId);
    setFriendFeed(prev => prev.filter(f => !(f.type === item.type && f.tmdbId === item.tmdbId && f.user.username === user?.username)));
    if (item.tmdbId) {
      fetchWithAuth('/api/feed/hidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, tmdbId: item.tmdbId }),
      }).catch(() => {});
    }
  };

  // Guest view
  if (!authLoading && !user) {
    return (
      <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-6">
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col gap-3">
          <div className="space-y-1">
            <p className="font-bold text-base">Join Cinephilers</p>
            <p className="text-sm text-muted-foreground">Sign up to track what you watch, share your ratings, and follow friends.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-xl font-bold"><Link href="/signup">Sign Up</Link></Button>
            <Button asChild size="sm" variant="outline" className="rounded-xl font-bold"><Link href="/login">Log In</Link></Button>
          </div>
        </div>
        <h1 className="text-3xl font-headline font-bold px-2">Activity</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-muted/30">
              <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-muted rounded-full w-2/3 animate-pulse" />
                <div className="h-3 bg-muted rounded-full w-1/3 animate-pulse" />
              </div>
              <div className="w-10 h-14 rounded-lg bg-muted animate-pulse shrink-0" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-5">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-3xl font-headline font-bold">Activity</h1>
        <Button asChild size="sm" variant="outline" className="rounded-xl font-bold gap-1.5">
          <Link href="/friends"><UserPlus className="h-4 w-4" />Find People</Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex bg-muted rounded-2xl p-1 gap-1">
        {(['activity', 'notifications'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 relative flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold transition-all ${
              tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'activity'
              ? <><Users className="h-4 w-4" />Activity</>
              : <>
                  <Bell className="h-4 w-4" />Notifications
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </>
            }
          </button>
        ))}
      </div>

      {/* Activity tab */}
      {tab === 'activity' && (
        <>
          {activityLoading && friendFeed.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card rounded-3xl border border-border p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-muted animate-pulse" />
                    <div className="space-y-2 flex-1">
                      <div className="h-3 bg-muted rounded-full w-1/3 animate-pulse" />
                      <div className="h-3 bg-muted rounded-full w-1/4 animate-pulse" />
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-2xl p-3.5 flex gap-4">
                    <div className="w-16 rounded-xl bg-muted animate-pulse" style={{ aspectRatio: '2/3' }} />
                    <div className="flex-1 space-y-2 pt-2">
                      <div className="h-4 bg-muted rounded-full w-3/4 animate-pulse" />
                      <div className="h-3 bg-muted rounded-full w-1/4 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!activityLoading && mergedActivity.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <Eye className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold font-headline text-lg">Nothing here yet</p>
                <p className="text-sm text-muted-foreground mt-1">Watch or rate something, or follow people to see their activity</p>
              </div>
              <Button asChild size="sm" className="rounded-xl font-bold gap-2 mt-1">
                <Link href="/friends"><UserPlus className="h-4 w-4" />Find People to Follow</Link>
              </Button>
            </div>
          )}

          {mergedActivity.length > 0 && (
            <div className="space-y-4">
              {mergedActivity.map(item => (
                item.type === 'watchlist_batch'
                  ? <WatchlistBatchCard key={item.id} item={item} />
                  : <ActivityCard key={item.id} item={item} onToggleLike={handleToggleLike} onRemove={handleRemove} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Notifications tab */}
      {tab === 'notifications' && (
        <>
          {notifLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!notifLoading && notifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <Bell className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold font-headline text-lg">No notifications yet</p>
                <p className="text-sm text-muted-foreground mt-1">You&apos;ll be notified when someone follows you</p>
              </div>
            </div>
          )}
          {!notifLoading && notifications.length > 0 && (
            <div className="space-y-3">
              {notifications.map(n => (
                <NotificationCard
                  key={n.id}
                  notif={n}
                  onFollowBack={() => {}}
                  onRequestHandled={(id) => setNotifications(prev => prev.map(x => x.id === id ? { ...x, read: true } : x))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
