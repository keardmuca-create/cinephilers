"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, Star, Eye, Bookmark, Film, User, MoreHorizontal, Share2, Trash2, Users, MessageSquare, Loader2, UserPlus } from 'lucide-react';
import { ActivityEntry, getFeed, toggleLike, removeActivity, relativeTime } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
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

// ─── Shared helpers ────────────────────────────────────────────────────────────

function relativeTimeStr(iso: string) { return relativeTime(iso); }

function UserAvatar({ user, size = 40 }: {
  user: { username: string; displayName?: string | null; avatarUrl?: string | null };
  size?: number;
}) {
  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
        : <span className="text-primary font-bold text-sm">{initials}</span>
      }
    </div>
  );
}

// ─── My Activity tab ───────────────────────────────────────────────────────────

function myActionLabel(action: ActivityEntry['action']) {
  if (action === 'watched') return 'Watched';
  if (action === 'rated') return 'Rated';
  return 'Added to watchlist';
}

function MyActionIcon({ action }: { action: ActivityEntry['action'] }) {
  if (action === 'watched') return <Eye className="h-3.5 w-3.5 text-blue-400" />;
  if (action === 'rated') return <Star className="h-3.5 w-3.5 text-yellow-400" />;
  return <Bookmark className="h-3.5 w-3.5 text-primary" />;
}

function MyActivityCard({
  entry, avatarUrl, username, displayName, onLike, onRemove,
}: {
  entry: ActivityEntry;
  avatarUrl?: string;
  username: string;
  displayName?: string | null;
  onLike: (id: string) => void;
  onRemove: (entry: ActivityEntry) => void;
}) {
  const liked = entry.likes.includes('me');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleShare = () => {
    setMenuOpen(false);
    if (navigator.share) {
      navigator.share({ title: entry.contentTitle, url: `/movie/${entry.contentId}` }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${window.location.origin}/movie/${entry.contentId}`).catch(() => {});
    }
  };

  return (
    <div className="bg-card rounded-3xl border border-white/5 shadow-lg overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <UserAvatar user={{ username, displayName, avatarUrl }} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-headline">{displayName ?? username}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MyActionIcon action={entry.action} />
            <span>{myActionLabel(entry.action)}</span>
            <span>·</span>
            <span>{relativeTimeStr(entry.timestamp)}</span>
          </div>
        </div>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-50 min-w-[140px] bg-card border border-white/10 rounded-2xl shadow-xl overflow-hidden">
              <button onClick={handleShare} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
                <Share2 className="h-4 w-4 text-muted-foreground" />Share
              </button>
              <button onClick={() => { setMenuOpen(false); onRemove(entry); }} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-destructive">
                <Trash2 className="h-4 w-4" />Remove
              </button>
            </div>
          )}
        </div>
      </div>

      <Link href={`/movie/${entry.contentId}`} className="block mx-5 mb-4 group">
        <div className="bg-muted/40 rounded-2xl p-3.5 flex gap-4 hover:bg-muted/70 transition-colors border border-white/5">
          <div className="relative w-16 shrink-0 rounded-xl overflow-hidden shadow-md bg-muted" style={{ aspectRatio: '2/3' }}>
            {entry.contentPoster
              ? <Image src={entry.contentPoster} alt={entry.contentTitle} fill className="object-cover" sizes="64px" />
              : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-muted-foreground/40" /></div>
            }
          </div>
          <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
            <h3 className="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-2 leading-snug">{entry.contentTitle}</h3>
            {entry.contentYear && <p className="text-xs text-muted-foreground">{entry.contentYear}</p>}
            {entry.action === 'rated' && entry.rating !== undefined && (
              <div className="flex items-center gap-1 text-yellow-400 font-bold text-sm bg-yellow-400/10 w-fit px-2.5 py-0.5 rounded-full">
                <Star className="h-3.5 w-3.5 fill-current" />{entry.rating} / 10
              </div>
            )}
          </div>
        </div>
      </Link>

      <div className="px-5 pb-4 flex items-center gap-2">
        <button
          onClick={() => onLike(entry.id)}
          className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
        >
          <Heart className={`h-5 w-5 transition-colors ${liked ? 'fill-primary text-primary' : ''}`} />
          {entry.likes.length > 0 && <span>{entry.likes.length}</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Friends Feed tab ──────────────────────────────────────────────────────────

interface EnrichedFeedItem extends FeedItem {
  meta?: { title: string; year: string; poster: string };
}

const metaCache: Record<string, { title: string; year: string; poster: string }> = {};

async function fetchMeta(tmdbId: string) {
  if (metaCache[tmdbId]) return metaCache[tmdbId];
  try {
    const res = await fetch(`/api/meta/${tmdbId}`);
    if (!res.ok) return null;
    const d = await res.json();
    const meta = { title: d.title ?? 'Unknown', year: d.year ?? '', poster: d.poster ?? '' };
    metaCache[tmdbId] = meta;
    return meta;
  } catch { return null; }
}

function FeedCard({ item }: { item: EnrichedFeedItem }) {
  const [meta, setMeta] = useState(item.meta ?? null);

  useEffect(() => {
    if (meta) return;
    // Try localStorage cache first
    try {
      const cached = localStorage.getItem(`meta-${item.tmdbId}`);
      if (cached) {
        const m = JSON.parse(cached);
        setMeta({ title: m.title ?? 'Unknown', year: m.year ?? '', poster: m.poster ?? '' });
        return;
      }
    } catch { /* ignore */ }
    fetchMeta(item.tmdbId).then(m => { if (m) setMeta(m); });
  }, [item.tmdbId, meta]);

  const isMovie = item.mediaType === 'MOVIE';
  const href = isMovie ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;

  return (
    <div className="bg-card rounded-3xl border border-white/5 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link href={`/profile/${item.user.username}`}>
          <UserAvatar user={item.user} size={40} />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${item.user.username}`} className="text-sm font-bold font-headline hover:text-primary transition-colors">
            {item.user.displayName ?? item.user.username}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.type === 'watched' && <><Eye className="h-3.5 w-3.5 text-blue-400" /><span>Watched</span></>}
            {item.type === 'rated' && <><Star className="h-3.5 w-3.5 text-yellow-400" /><span>Rated</span></>}
            {item.type === 'reviewed' && <><MessageSquare className="h-3.5 w-3.5 text-green-400" /><span>Reviewed</span></>}
            <span>·</span>
            <span>{relativeTimeStr(item.createdAt)}</span>
          </div>
        </div>
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
              ? <>
                  <h3 className="font-bold font-headline text-base group-hover:text-primary transition-colors line-clamp-2 leading-snug">{meta.title}</h3>
                  {meta.year && <p className="text-xs text-muted-foreground">{meta.year}</p>}
                </>
              : <>
                  <div className="h-4 bg-muted rounded-full w-3/4 animate-pulse" />
                  <div className="h-3 bg-muted rounded-full w-1/4 animate-pulse" />
                </>
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
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'friends' | 'me';

export default function SocialPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('friends');

  // My Activity state
  const [myFeed, setMyFeed] = useState<ActivityEntry[]>([]);

  // Friends Feed state
  const [friendFeed, setFriendFeed] = useState<EnrichedFeedItem[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    setMyFeed(getFeed());
    const handler = () => setMyFeed(getFeed());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const loadFriendFeed = useCallback(async () => {
    setFriendLoading(true);
    setFriendError(null);
    try {
      const res = await fetch('/api/feed?limit=30', { credentials: 'include' });
      if (!res.ok) { setFriendError('Failed to load feed'); return; }
      const json = await res.json();
      setFriendFeed(json.data ?? []);
    } catch {
      setFriendError('Failed to load feed');
    } finally {
      setFriendLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'friends' && user) loadFriendFeed();
  }, [tab, user, loadFriendFeed]);

  const handleLike = (id: string) => { setMyFeed(toggleLike(id)); };
  const handleRemove = (entry: ActivityEntry) => { removeActivity(entry.action, entry.contentId); setMyFeed(getFeed()); };

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
        <p className="text-center text-sm text-muted-foreground pt-2">Follow friends to see their ratings and watch activity here.</p>
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
        {(['friends', 'me'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-bold transition-all ${
              tab === t ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'friends' ? <><Users className="h-4 w-4" />Friends</> : <><User className="h-4 w-4" />My Activity</>}
          </button>
        ))}
      </div>

      {/* Friends Feed */}
      {tab === 'friends' && (
        <>
          {friendLoading && (
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

          {!friendLoading && friendError && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <p className="text-sm text-muted-foreground">{friendError}</p>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={loadFriendFeed}>Try again</Button>
            </div>
          )}

          {!friendLoading && !friendError && friendFeed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold font-headline text-lg">No friend activity yet</p>
                <p className="text-sm text-muted-foreground mt-1">Follow people to see their watches and ratings here</p>
              </div>
              <Button asChild size="sm" className="rounded-xl font-bold gap-2 mt-1">
                <Link href="/friends"><UserPlus className="h-4 w-4" />Find People to Follow</Link>
              </Button>
            </div>
          )}

          {!friendLoading && !friendError && friendFeed.length > 0 && (
            <div className="space-y-4">
              {friendFeed.map(item => <FeedCard key={item.id} item={item} />)}
            </div>
          )}
        </>
      )}

      {/* My Activity */}
      {tab === 'me' && (
        <>
          {myFeed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Eye className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold font-headline text-lg">No activity yet</p>
                <p className="text-sm text-muted-foreground mt-1">Watch, rate, or save a movie to see it here</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {myFeed.map(entry => (
                <MyActivityCard
                  key={entry.id}
                  entry={entry}
                  avatarUrl={user?.avatarUrl ?? undefined}
                  username={user?.username ?? ''}
                  displayName={user?.displayName}
                  onLike={handleLike}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
