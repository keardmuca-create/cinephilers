"use client"

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { Star, Film, Eye, UserPlus, UserCheck, Loader2, Lock, User, MessageSquare, List, ChevronRight, ChevronLeft, Clock, Heart, Crown, Bookmark, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SpoilerWrap } from '@/components/spoiler-wrap';
import { RING } from '@/components/favorites-section';
import { useAuth } from '@/contexts/auth-context';
import { relativeTime } from '@/lib/activity';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';

interface ProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
  isVerified: boolean;
  ratingsCount: number;
  reviewsCount: number;
  watchedCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isPendingRequest: boolean;
  isOwner: boolean;
}

interface BadgeData {
  currentTier: string;
  nextTier: string | null;
  nextThreshold: number | null;
  ratingsCount: number;
  progress: number;
  memberSince: string;
}

interface FavoriteItem {
  id: string;
  tmdbId: string;
  mediaType: string;
}

interface ReviewItem {
  id: string;
  tmdbId: string;
  mediaType: string;
  body: string;
  containsSpoiler: boolean;
  likesCount: number;
  score: number | null;
  createdAt: string;
  meta?: { title: string; year: string; poster: string };
}

interface ShelfItem {
  tmdbId: string;
  badge?: string; // e.g. rating "8" or rewatch "×3"
}

interface RecentItem {
  id: string;
  type: 'watched' | 'rated' | 'reviewed';
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  createdAt: string;
  meta?: { title: string; year: string; poster: string };
}

interface PublicList {
  id: string;
  name: string;
  isPublic: boolean;
  itemsCount: number;
  items: { tmdbId: string; title: string | null; poster: string | null; year: string | null; mediaType: string }[];
}

const metaCache: Record<string, { title: string; year: string; poster: string }> = {};

async function getMeta(tmdbId: string) {
  if (metaCache[tmdbId]) return metaCache[tmdbId];
  const map = await batchFetchMeta([tmdbId]);
  const d = map[tmdbId];
  if (!d) return null;
  const m = { title: d.title ?? 'Unknown', year: d.year ?? '', poster: d.poster ?? '' };
  metaCache[tmdbId] = m;
  return m;
}

async function prewarmMetaCache(ids: string[]) {
  const map = await batchFetchMeta(ids);
  for (const [id, m] of Object.entries(map)) {
    metaCache[id] = { title: m.title, year: m.year, poster: m.poster };
  }
}

function Avatar({ user, size = 80 }: { user: { username: string; displayName?: string | null; avatarUrl?: string | null }; size?: number }) {
  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase();
  return (
    <div className="rounded-3xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden" style={{ width: size, height: size }}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
        : <span className="text-primary font-bold text-xl">{initials}</span>
      }
    </div>
  );
}

function FollowStatLink({ username, type, count }: { username: string; type: 'following' | 'followers'; count: number }) {
  return (
    <Link href={`/profile/${username}/${type}`} className="flex flex-col items-center hover:opacity-70 transition-opacity">
      <span className="text-xl font-bold font-headline">{count}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{type === 'following' ? 'Following' : 'Followers'}</span>
    </Link>
  );
}

// Read-only ring poster for a friend's Favorites (hero gets a crown badge).
function FavoriteRingPoster({ tmdbId, hero }: { tmdbId: string; hero?: boolean }) {
  const [meta, setMeta] = useState<{ title: string; year: string; poster: string } | null>(null);
  useEffect(() => { getMeta(tmdbId).then(m => { if (m) setMeta(m); }); }, [tmdbId]);
  return (
    <Link href={`/movie/${tmdbId}`} className="group block" aria-label={meta?.title ?? 'Favorite'}>
      <div className={`relative aspect-[2/3] rounded-xl overflow-hidden border-2 ${hero ? 'border-primary shadow-lg' : 'border-foreground/20'}`}>
        {meta?.poster
          ? <Image src={meta.poster} alt={meta.title} fill className="object-cover" sizes="30vw" />
          : <div className="w-full h-full flex items-center justify-center bg-muted"><Film className={`${hero ? 'h-8 w-8' : 'h-6 w-6'} text-primary/60`} /></div>
        }
        {hero && (
          <div className="absolute top-1 left-1 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center shadow">
            <Crown className="h-3 w-3" />
          </div>
        )}
      </div>
    </Link>
  );
}

function ReviewCard({ review }: { review: ReviewItem }) {
  const [meta, setMeta] = useState(review.meta ?? null);
  useEffect(() => { if (!meta) getMeta(review.tmdbId).then(m => { if (m) setMeta(m); }); }, [review.tmdbId, meta]);
  const dateLabel = new Date(review.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <Link href={`/movie/${review.tmdbId}/reviews`} className="block bg-card hover:bg-muted/50 transition-colors rounded-2xl p-4 border border-border group">
      <div className="flex gap-4">
        <div className="relative w-16 shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
          {meta?.poster
            ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="64px" />
            : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/60" /></div>
          }
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {meta
            ? <p className="text-base font-bold group-hover:text-primary transition-colors line-clamp-1">{meta.title}</p>
            : <div className="h-4 bg-muted rounded-full w-2/3 animate-pulse" />
          }
          <p className="text-xs text-muted-foreground">{meta?.year ? `${meta.year} · ` : ''}{dateLabel}</p>
          {review.score != null && (
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-bold text-foreground">{review.score}/10</span>
            </div>
          )}
          <SpoilerWrap isSpoiler={review.containsSpoiler}>
            <p className="text-sm text-muted-foreground italic leading-relaxed line-clamp-3 pt-0.5">
              &ldquo;{review.body}&rdquo;
            </p>
          </SpoilerWrap>
        </div>
      </div>
    </Link>
  );
}

// A horizontal poster shelf for a profile section (Watchlist, Rewatched, etc.).
function ProfileShelf({ title, icon, items }: { title: string; icon: React.ReactNode; items: ShelfItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-headline font-bold flex items-center gap-2">{icon}{title}</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
        {items.map(it => <ShelfPoster key={it.tmdbId} tmdbId={it.tmdbId} badge={it.badge} />)}
      </div>
    </section>
  );
}

function ShelfPoster({ tmdbId, badge }: { tmdbId: string; badge?: string }) {
  const [meta, setMeta] = useState<{ title: string; year: string; poster: string } | null>(null);
  useEffect(() => { getMeta(tmdbId).then(m => { if (m) setMeta(m); }); }, [tmdbId]);
  return (
    <Link href={`/movie/${tmdbId}`} className="shrink-0 w-24 group" aria-label={meta?.title ?? 'Title'}>
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-md">
        {meta?.poster
          ? <Image src={meta.poster} alt={meta.title} fill className="object-cover" sizes="96px" />
          : <div className="w-full h-full flex items-center justify-center"><Film className="h-6 w-6 text-primary/60" /></div>
        }
        {badge && (
          <span className="absolute top-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
            {badge}
          </span>
        )}
      </div>
      {meta && <p className="text-xs font-semibold line-clamp-1 mt-1.5 group-hover:text-primary transition-colors">{meta.title}</p>}
    </Link>
  );
}

function RecentCard({ item }: { item: RecentItem }) {
  const [meta, setMeta] = useState(item.meta ?? null);
  useEffect(() => { if (!meta) getMeta(item.tmdbId).then(m => { if (m) setMeta(m); }); }, [item.tmdbId, meta]);
  const href = `/movie/${item.tmdbId}`;

  return (
    <Link href={href} className="flex items-center gap-3 py-3 border-b border-border last:border-0 group">
      <div className="relative w-12 shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
        {meta?.poster ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="48px" /> : <div className="w-full h-full flex items-center justify-center"><Film className="h-4 w-4 text-primary/60" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        {meta ? <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{meta.title}</p> : <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />}
        <div className="flex items-center gap-2 mt-1">
          {item.type === 'watched' && <span className="flex items-center gap-1 text-xs text-blue-400"><Eye className="h-3 w-3" />Watched</span>}
          {item.type === 'rated' && <span className="flex items-center gap-1 text-xs text-yellow-400"><Star className="h-3 w-3 fill-current" />{item.rating}/10</span>}
          {item.type === 'reviewed' && <span className="flex items-center gap-1 text-xs text-green-400"><MessageSquare className="h-3 w-3" />Reviewed</span>}
          <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentItem[]>([]);
  const [lists, setLists] = useState<PublicList[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<ShelfItem[]>([]);
  const [ratingsShelf, setRatingsShelf] = useState<ShelfItem[]>([]);
  const [watchlist, setWatchlist] = useState<ShelfItem[]>([]);
  const [rewatched, setRewatched] = useState<ShelfItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [badgeData, setBadgeData] = useState<BadgeData | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);
  const [loadingMoreLists, setLoadingMoreLists] = useState(false);
  const [allActivityLoaded, setAllActivityLoaded] = useState(false);
  const [allReviewsLoaded, setAllReviewsLoaded] = useState(false);
  const [allListsLoaded, setAllListsLoaded] = useState(false);

  const loadProfile = useCallback(async () => {
    const res = await fetchWithAuth(`/api/users/${username}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    const p: ProfileUser = json.data;

    // Redirect to own profile page
    if (p.isOwner) { router.replace('/profile'); return; }

    setProfile(p);
    setLoading(false);

    // Load recent activity, lists, favorites and reviews if profile is visible
    if (!p.isPrivate || p.isFollowing) {
      loadActivity(p.id, p.username);
      fetch(`/api/users/${p.username}/lists?limit=3`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.data) setLists(json.data); })
        .catch(() => {});
      fetch(`/api/users/${p.username}/favorites`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          if (!json?.data) return;
          await prewarmMetaCache(json.data.map((f: { tmdbId: string }) => f.tmdbId));
          setFavorites(json.data);
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/reviews?limit=3`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          const items: ReviewItem[] = json?.data ?? [];
          if (!items.length) return;
          await prewarmMetaCache(items.map(r => r.tmdbId));
          setReviews(items);
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/watched?limit=15`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          const items: { tmdbId: string }[] = json?.data ?? [];
          if (!items.length) return;
          await prewarmMetaCache(items.map(i => i.tmdbId));
          setWatchHistory(items.map(i => ({ tmdbId: i.tmdbId })));
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/ratings?limit=15`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          const items: { tmdbId: string; score: number }[] = json?.data ?? [];
          if (!items.length) return;
          await prewarmMetaCache(items.map(i => i.tmdbId));
          setRatingsShelf(items.map(i => ({ tmdbId: i.tmdbId, badge: `★${i.score}` })));
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/watchlist?limit=15`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          const items: { tmdbId: string }[] = json?.data ?? [];
          if (!items.length) return;
          await prewarmMetaCache(items.map(i => i.tmdbId));
          setWatchlist(items.map(i => ({ tmdbId: i.tmdbId })));
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/rewatched?min=2&sort=recent&limit=15`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          const items: { tmdbId: string; count: number }[] = json?.data?.items ?? [];
          if (!items.length) return;
          await prewarmMetaCache(items.map(i => i.tmdbId));
          setRewatched(items.map(i => ({ tmdbId: i.tmdbId, badge: `×${i.count}` })));
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/badges`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.data) setBadgeData(json.data); })
        .catch(() => {});
    }
  }, [username, router]);

  const loadActivity = async (userId: string, uname: string) => {
    try {
      const [watchedRes, ratingsRes] = await Promise.all([
        fetch(`/api/users/${uname}/watched?limit=5`),
        fetch(`/api/users/${uname}/ratings?limit=5`),
      ]);
      const items: RecentItem[] = [];
      if (watchedRes.ok) {
        const d = await watchedRes.json();
        for (const w of (d.data ?? [])) {
          items.push({ id: `w-${w.id ?? w.tmdbId}`, type: 'watched', tmdbId: w.tmdbId, mediaType: w.mediaType, createdAt: w.watchedAt ?? w.addedAt ?? new Date().toISOString() });
        }
      }
      if (ratingsRes.ok) {
        const d = await ratingsRes.json();
        for (const r of (d.data ?? [])) {
          items.push({ id: `r-${r.id ?? r.tmdbId}`, type: 'rated', tmdbId: r.tmdbId, mediaType: r.mediaType, rating: r.score, createdAt: r.updatedAt ?? r.createdAt ?? new Date().toISOString() });
        }
      }
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const activityItems = items.slice(0, 6);
      await prewarmMetaCache(activityItems.map(i => i.tmdbId));
      setRecentActivity(activityItems);
    } catch { /* ignore */ }
  };

  const loadAllActivity = async () => {
    if (!profile) return;
    setLoadingMoreActivity(true);
    try {
      const [watchedRes, ratingsRes] = await Promise.all([
        fetch(`/api/users/${profile.username}/watched?limit=100`, { credentials: 'include' }),
        fetch(`/api/users/${profile.username}/ratings?limit=100`, { credentials: 'include' }),
      ]);
      const items: RecentItem[] = [];
      if (watchedRes.ok) {
        const d = await watchedRes.json();
        for (const w of (d.data ?? [])) items.push({ id: `w-${w.id ?? w.tmdbId}`, type: 'watched', tmdbId: w.tmdbId, mediaType: w.mediaType, createdAt: w.watchedAt ?? new Date().toISOString() });
      }
      if (ratingsRes.ok) {
        const d = await ratingsRes.json();
        for (const r of (d.data ?? [])) items.push({ id: `r-${r.id ?? r.tmdbId}`, type: 'rated', tmdbId: r.tmdbId, mediaType: r.mediaType, rating: r.score, createdAt: r.updatedAt ?? new Date().toISOString() });
      }
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecentActivity(items);
      setAllActivityLoaded(true);
    } catch { /* ignore */ }
    finally { setLoadingMoreActivity(false); }
  };

  const loadAllReviews = async () => {
    if (!profile) return;
    setLoadingMoreReviews(true);
    try {
      const res = await fetch(`/api/users/${profile.username}/reviews?limit=50`, { credentials: 'include' });
      if (res.ok) { const json = await res.json(); setReviews(json.data ?? []); setAllReviewsLoaded(true); }
    } catch { /* ignore */ }
    finally { setLoadingMoreReviews(false); }
  };

  const loadAllLists = async () => {
    if (!profile) return;
    setLoadingMoreLists(true);
    try {
      const res = await fetch(`/api/users/${profile.username}/lists`, { credentials: 'include' });
      if (res.ok) { const json = await res.json(); setLists(json.data ?? []); setAllListsLoaded(true); }
    } catch { /* ignore */ }
    finally { setLoadingMoreLists(false); }
  };

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const toggleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    const isUnfollow = profile.isFollowing || profile.isPendingRequest;
    const method = isUnfollow ? 'DELETE' : 'POST';
    const res = await fetch(`/api/users/${profile.username}/follow`, { method, credentials: 'include' });
    if (res.ok) {
      const json = await res.json();
      const requested = json.data?.requested ?? false;
      setProfile(p => p ? ({
        ...p,
        isFollowing: !isUnfollow && !requested,
        isPendingRequest: requested,
        followersCount: p.followersCount + (!isUnfollow && !requested ? 1 : isUnfollow && p.isFollowing ? -1 : 0),
      }) : p);
    }
    setFollowLoading(false);
  };

  if (loading) return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-6">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 rounded-3xl bg-muted animate-pulse shrink-0" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-5 bg-muted rounded-full w-1/2 animate-pulse" />
          <div className="h-4 bg-muted rounded-full w-1/3 animate-pulse" />
          <div className="h-8 bg-muted rounded-xl w-24 animate-pulse" />
        </div>
      </div>
    </main>
  );

  if (notFound || !profile) return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 flex flex-col items-center justify-center gap-4 text-center py-32">
      <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
        <User className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-bold font-headline text-lg">User not found</p>
        <p className="text-sm text-muted-foreground mt-1">@{username} doesn&apos;t exist</p>
      </div>
      <Button asChild variant="outline" className="rounded-xl"><Link href="/friends">Find People</Link></Button>
    </main>
  );

  const isVisible = !profile.isPrivate || profile.isFollowing;

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-8">
      {/* Back arrow — the installed PWA has no browser back button */}
      <button onClick={() => router.back()} aria-label="Go back" className="rounded-full p-1 -ml-1 hover:bg-muted/60 transition-colors">
        <ChevronLeft className="h-6 w-6" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <Avatar user={profile} size={80} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-headline truncate">{profile.displayName ?? profile.username}</h1>
                {profile.isVerified && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0">✓</span>}
                {profile.isPrivate && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground">@{profile.username}</p>
              {badgeData?.memberSince && (
                <span
                  className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold"
                  style={{ color: '#8a6d00' }}
                >
                  Founding Member · since {new Date(badgeData.memberSince).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {profile.bio && isVisible && <p className="text-sm text-foreground/80 leading-relaxed mt-1">{profile.bio}</p>}
            </div>
            {me && (
              <Button
                size="sm"
                variant={profile.isFollowing || profile.isPendingRequest ? 'outline' : 'default'}
                className="rounded-xl font-bold gap-1.5 shrink-0"
                onClick={toggleFollow}
                disabled={followLoading}
              >
                {followLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : profile.isFollowing
                    ? <><UserCheck className="h-3.5 w-3.5" />Following</>
                    : profile.isPendingRequest
                      ? <><Clock className="h-3.5 w-3.5" />Requested</>
                      : <><UserPlus className="h-3.5 w-3.5" />Follow</>
                }
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      {isVisible && (
        <div className="flex gap-8">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold font-headline">{profile.watchedCount ?? 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Watched</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold font-headline">{profile.ratingsCount}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Ratings</span>
          </div>
          <FollowStatLink username={profile.username} type="following" count={profile.followingCount} />
          <FollowStatLink username={profile.username} type="followers" count={profile.followersCount} />
        </div>
      )}

      {/* Favorites — ring layout: a crowned #1 hero with 6 orbiting it */}
      {isVisible && favorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-headline font-bold flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />Favorites
          </h2>
          <div className="relative w-full max-w-[380px] mx-auto" style={{ aspectRatio: '202 / 262' }}>
            {RING.map((pos, i) => {
              const fav = favorites[i];
              if (!fav) return null;
              return (
                <div key={i} className="absolute" style={{ left: pos.left, top: pos.top, width: pos.width }}>
                  <FavoriteRingPoster tmdbId={fav.tmdbId} hero={pos.hero} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Private lock */}
      {profile.isPrivate && !profile.isFollowing && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border border-border rounded-3xl bg-muted">
          <div className="h-14 w-14 rounded-2xl bg-muted border border-border flex items-center justify-center">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">This account is private</p>
            <p className="text-sm text-muted-foreground mt-1">Follow to see their ratings and activity</p>
          </div>
        </div>
      )}

      {/* Recent Activity — right below Favorites, capped at 5 with See All */}
      {isVisible && recentActivity.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-headline font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />Recent Activity
            </h2>
            {!allActivityLoaded && recentActivity.length >= 5 && (
              <button onClick={loadAllActivity} disabled={loadingMoreActivity}
                className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity flex items-center gap-1">
                {loadingMoreActivity ? <Loader2 className="h-3 w-3 animate-spin" /> : 'See All'}
              </button>
            )}
          </div>
          <div className="bg-card rounded-3xl border border-border px-5 py-2">
            {(allActivityLoaded ? recentActivity : recentActivity.slice(0, 5)).map(item => <RecentCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {/* Empty activity */}
      {isVisible && recentActivity.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Film className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </div>
      )}

      {/* Watch History → Rewatched → Ratings → Watchlist shelves (scroll freely) */}
      {isVisible && <ProfileShelf title="Watch History" icon={<Eye className="h-5 w-5 text-primary" />} items={watchHistory} />}
      {isVisible && <ProfileShelf title="Rewatched" icon={<Repeat className="h-5 w-5 text-primary" />} items={rewatched} />}
      {isVisible && <ProfileShelf title="Ratings" icon={<Star className="h-5 w-5 text-primary" />} items={ratingsShelf} />}
      {isVisible && <ProfileShelf title="Watchlist" icon={<Bookmark className="h-5 w-5 text-primary" />} items={watchlist} />}

      {/* Reviews */}
      {isVisible && reviews.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-headline font-bold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />Reviews
            </h2>
            {!allReviewsLoaded && reviews.length >= 3 && (
              <button onClick={loadAllReviews} disabled={loadingMoreReviews}
                className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity flex items-center gap-1">
                {loadingMoreReviews ? <Loader2 className="h-3 w-3 animate-spin" /> : 'See All'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
          </div>
        </section>
      )}

      {/* Lists */}
      {isVisible && lists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-headline font-bold flex items-center gap-2">
              <List className="h-5 w-5 text-primary" />Lists
            </h2>
            {!allListsLoaded && lists.length >= 3 && (
              <button onClick={loadAllLists} disabled={loadingMoreLists}
                className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity flex items-center gap-1">
                {loadingMoreLists ? <Loader2 className="h-3 w-3 animate-spin" /> : 'See All'}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {lists.map(l => (
              <Link key={l.id} href={`/lists/${l.id}`} className="bg-card rounded-3xl border border-border px-5 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                {/* Mini poster strip */}
                <div className="flex gap-1 shrink-0">
                  {l.items.slice(0, 3).map(item => (
                    <div key={item.tmdbId} className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0">
                      {item.poster
                        ? <img src={item.poster} alt={item.title ?? ''} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Film className="h-3 w-3 text-primary/60" /></div>
                      }
                    </div>
                  ))}
                  {l.items.length === 0 && (
                    <div className="w-10 aspect-[2/3] rounded-lg bg-muted flex items-center justify-center">
                      <Film className="h-3 w-3 text-primary/60" />
                    </div>
                  )}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? 'title' : 'titles'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
