"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Star, Eye, Bookmark, Film, MoreHorizontal, Share2, Trash2, Users, MessageSquare, Loader2, UserPlus, Bell, User } from 'lucide-react';
import { ActivityEntry, getFeed, toggleLike, removeActivity, relativeTime } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  type: 'watched' | 'rated' | 'reviewed';
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  createdAt: string;
}

interface NotificationItem {
  id: string;
  type: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
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
  type: 'watched' | 'rated' | 'reviewed' | 'watchlist';
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  tmdbId: string;
  meta?: { title: string; year: string; poster: string };
  rating?: number;
  reviewBody?: string;
  containsSpoiler?: boolean;
  createdAt: string;
  // my-activity-only fields
  localId?: string;
  likes?: string[];
}

function ActivityCard({ item, onLike, onRemove }: {
  item: UnifiedItem;
  onLike?: (id: string) => void;
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
  const liked = item.likes?.includes('me') ?? false;

  const handleShare = () => {
    setMenuOpen(false);
    if (navigator.share) navigator.share({ title: meta?.title ?? '', url: href }).catch(() => {});
    else navigator.clipboard.writeText(`${window.location.origin}${href}`).catch(() => {});
  };

  return (
    <div className="bg-card rounded-3xl border border-white/5 shadow-lg overflow-hidden">
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
            {item.type === 'watched' && <><Eye className="h-3.5 w-3.5 text-blue-400" /><span>Watched</span></>}
            {item.type === 'rated' && <><Star className="h-3.5 w-3.5 text-yellow-400" /><span>Rated</span></>}
            {item.type === 'reviewed' && <><MessageSquare className="h-3.5 w-3.5 text-green-400" /><span>Reviewed</span></>}
            {item.type === 'watchlist' && <><Bookmark className="h-3.5 w-3.5 text-primary" /><span>Added to watchlist</span></>}
            <span>·</span>
            <span>{relativeTime(item.createdAt)}</span>
          </div>
        </div>
        {item.isMe && (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-50 min-w-[140px] bg-card border border-white/10 rounded-2xl shadow-xl overflow-hidden">
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
        <div className="bg-muted/40 rounded-2xl p-3.5 flex gap-4 hover:bg-muted/70 transition-colors border border-white/5">
          <div className="relative w-16 shrink-0 rounded-xl overflow-hidden shadow-md bg-muted" style={{ aspectRatio: '2/3' }}>
            {meta?.poster
              ? <Image src={meta.poster} alt={meta.title} fill className="object-cover" sizes="64px" />
              : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground/40" /></div>
            }
          </div>
          <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
            {meta
              ? <><h3 className="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-2 leading-snug">{meta.title}</h3>
                  {meta.year && <p className="text-xs text-muted-foreground">{meta.year}</p>}</>
              : <><div className="h-4 bg-muted rounded-full w-3/4 animate-pulse" /><div className="h-3 bg-muted rounded-full w-1/4 animate-pulse mt-1" /></>
            }
            {item.type === 'rated' && item.rating !== undefined && (
              <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm bg-yellow-400/10 w-fit px-2.5 py-0.5 rounded-full">
                <Star className="h-3.5 w-3.5 fill-current" />{item.rating} / 10
              </div>
            )}
            {item.type === 'reviewed' && item.reviewBody && (
              <p className="text-xs text-muted-foreground line-clamp-2 italic leading-relaxed">
                {item.containsSpoiler && <span className="not-italic font-bold text-yellow-500/80 mr-1">[Spoiler]</span>}
                &ldquo;{item.reviewBody}&rdquo;
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Like (only for own items) */}
      {item.isMe && item.localId && (
        <div className="px-5 pb-4">
          <button onClick={() => onLike?.(item.localId!)} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
            <Heart className={`h-5 w-5 transition-colors ${liked ? 'fill-primary text-primary' : ''}`} />
            {(item.likes?.length ?? 0) > 0 && <span>{item.likes!.length}</span>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Notification Card ─────────────────────────────────────────────────────────

function NotificationCard({ notif, onFollowBack, onRequestHandled }: {
  notif: NotificationItem;
  onFollowBack: (username: string) => void;
  onRequestHandled: (notifId: string) => void;
}) {
  const [followState, setFollowState] = useState<'idle' | 'loading' | 'following'>(notif.from.isFollowingBack ? 'following' : 'idle');
  const [requestState, setRequestState] = useState<'pending' | 'loading' | 'accepted' | 'denied'>('pending');
  const [movieMeta, setMovieMeta] = useState<{ title: string; poster: string } | null>(null);

  const isReviewNotif = notif.type === 'review_like' || notif.type === 'review_comment';

  useEffect(() => {
    if (!isReviewNotif || !notif.refId) return;
    fetchMeta(notif.refId).then(m => { if (m) setMovieMeta(m); });
  }, [isReviewNotif, notif.refId]);

  const handleFollowBack = async () => {
    setFollowState('loading');
    const res = await fetch(`/api/users/${notif.from.username}/follow`, { method: 'POST', credentials: 'include' });
    if (res.ok) { setFollowState('following'); onFollowBack(notif.from.username); }
    else setFollowState('idle');
  };

  const handleRequest = async (action: 'accept' | 'deny') => {
    if (!notif.refId) return;
    setRequestState('loading');
    const method = action === 'accept' ? 'POST' : 'DELETE';
    const res = await fetch(`/api/follow-requests/${notif.refId}`, { method, credentials: 'include' });
    if (res.ok) {
      setRequestState(action === 'accept' ? 'accepted' : 'denied');
      onRequestHandled(notif.id);
    } else setRequestState('pending');
  };

  const text = {
    follow: 'followed you',
    follow_accept: 'accepted your follow request',
    follow_request: 'wants to follow you',
    review_like: 'liked your review',
    review_comment: 'commented on your review',
  }[notif.type] ?? notif.type;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${notif.read ? 'border-white/5 bg-card' : 'border-primary/20 bg-primary/5'}`}>
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
          ? <span className="text-xs text-muted-foreground font-bold px-3 py-1.5 rounded-xl border border-white/10 shrink-0">Following</span>
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

  // Activity: merged my + friends
  const [myLocalFeed, setMyLocalFeed] = useState<ActivityEntry[]>([]);
  const [friendFeed, setFriendFeed] = useState<FeedItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);

  // Load local feed — refresh on storage changes (other tabs) and DB restore (cross-device sync)
  useEffect(() => {
    setMyLocalFeed(getFeed());
    const handler = () => setMyLocalFeed(getFeed());
    window.addEventListener('storage', handler);
    window.addEventListener('cinephilers-db-restored', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('cinephilers-db-restored', handler);
    };
  }, []);

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
        const feed = json.data ?? [];
        setFriendFeed(feed);
        try { localStorage.setItem(FEED_CACHE_KEY, JSON.stringify(feed)); } catch { /* ignore */ }
      }
    } finally {
      setActivityLoading(false);
    }
  }, [user]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.notifications ?? []);
        setUnreadCount(json.data?.unreadCount ?? 0);
      }
    } finally {
      setNotifLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) { loadActivity(); loadNotifications(); } }, [user, loadActivity, loadNotifications]);

  // Refresh on visibility change
  useEffect(() => {
    const onVisible = () => {
      if (!user || document.visibilityState !== 'visible') return;
      setMyLocalFeed(getFeed());
      loadActivity();
      loadNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, loadActivity, loadNotifications]);

  // Mark notifications as read when tab is opened
  useEffect(() => {
    if (tab === 'notifications' && unreadCount > 0) {
      fetch('/api/notifications/read', { method: 'PATCH', credentials: 'include' })
        .then(() => {
          setUnreadCount(0);
          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        })
        .catch(() => {});
    }
  }, [tab, unreadCount]);

  // Build merged + sorted activity list
  const mergedActivity: UnifiedItem[] = React.useMemo(() => {
    const myItems: UnifiedItem[] = myLocalFeed.map(e => ({
      id: `me-${e.id}`,
      localId: e.id,
      isMe: true,
      type: e.action === 'watchlist' ? 'watchlist' : e.action as UnifiedItem['type'],
      user: { username: user?.username ?? '', displayName: user?.displayName ?? null, avatarUrl: user?.avatarUrl ?? null },
      tmdbId: e.contentId,
      meta: e.contentTitle ? { title: e.contentTitle, year: e.contentYear, poster: e.contentPoster } : undefined,
      rating: e.rating,
      likes: e.likes,
      createdAt: e.timestamp,
    }));

    const friendItems: UnifiedItem[] = friendFeed.map(f => ({
      id: f.id,
      isMe: false,
      type: f.type,
      user: f.user,
      tmdbId: f.tmdbId,
      rating: f.rating,
      reviewBody: f.reviewBody,
      containsSpoiler: f.containsSpoiler,
      createdAt: f.createdAt,
    }));

    return [...myItems, ...friendItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [myLocalFeed, friendFeed, user]);

  const handleLike = (localId: string) => { setMyLocalFeed(toggleLike(localId)); };
  const handleRemove = (item: UnifiedItem) => {
    if (!item.localId) return;
    const entry = myLocalFeed.find(e => e.id === item.localId);
    if (entry) { removeActivity(entry.action, entry.contentId); setMyLocalFeed(getFeed()); }
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
            <Button asChild size="sm" className="rounded-xl font-bold"><Link href="/signup">Sign Up Free</Link></Button>
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
      <div className="flex bg-white/5 rounded-2xl p-1 gap-1">
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
          {activityLoading && friendFeed.length === 0 && myLocalFeed.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card rounded-3xl border border-white/5 p-5 space-y-4">
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
              <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
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
                <ActivityCard key={item.id} item={item} onLike={handleLike} onRemove={handleRemove} />
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
              <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
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
