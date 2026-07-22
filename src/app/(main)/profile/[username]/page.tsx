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
  watchlistCount: number;
  rewatchedCount: number;
  listsCount: number;
  watchedThisYear: number;
  rewatchedThisYear: number;
  ratingDistribution: number[];
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

// A single film's activity, folded from watched + rated + reviewed (so one film
// is one row, not three) — matches the consolidated feed card.
interface RecentItem {
  tmdbId: string;
  mediaType: string;
  watched?: boolean;
  rating?: number;
  reviewBody?: string;
  createdAt: string; // latest of the three
}

interface PublicList {
  id: string;
  name: string;
  isPublic: boolean;
  itemsCount: number;
  items: { tmdbId: string; title: string | null; poster: string | null; year: string | null; mediaType: string }[];
}

type Meta = { title: string; year: string; poster: string; tmdbRating?: number };
const metaCache: Record<string, Meta> = {};

async function getMeta(tmdbId: string) {
  if (metaCache[tmdbId]) return metaCache[tmdbId];
  const map = await batchFetchMeta([tmdbId]);
  const d = map[tmdbId];
  if (!d) return null;
  const m: Meta = { title: d.title ?? 'Unknown', year: d.year ?? '', poster: d.poster ?? '', tmdbRating: d.tmdbRating };
  metaCache[tmdbId] = m;
  return m;
}

async function prewarmMetaCache(ids: string[]) {
  const map = await batchFetchMeta(ids);
  for (const [id, m] of Object.entries(map)) {
    metaCache[id] = { title: m.title, year: m.year, poster: m.poster, tmdbRating: m.tmdbRating };
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
  const [meta, setMeta] = useState<Meta | null>(metaCache[tmdbId] ?? null);
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
  const [meta, setMeta] = useState(review.meta ?? metaCache[review.tmdbId] ?? null);
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

// Consolidated recent-activity row: one film showing watched / rated / reviewed
// together, like the feed card.
function RecentCard({ item }: { item: RecentItem }) {
  const [meta, setMeta] = useState<Meta | null>(metaCache[item.tmdbId] ?? null);
  useEffect(() => { if (!meta) getMeta(item.tmdbId).then(m => { if (m) setMeta(m); }); }, [item.tmdbId, meta]);
  const label = [item.watched ? 'Watched' : null, item.rating != null ? `Rated ${item.rating}/10` : null, item.reviewBody ? 'Reviewed' : null].filter(Boolean).join(' · ');
  return (
    <Link href={`/movie/${item.tmdbId}`} className="flex items-center gap-3 py-3 border-b border-border last:border-0 group">
      <div className="relative w-12 shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
        {meta?.poster ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="48px" /> : <div className="w-full h-full flex items-center justify-center"><Film className="h-4 w-4 text-primary/60" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        {meta ? <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{meta.title}</p> : <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />}
        <div className="flex items-center gap-1.5 mt-1 text-xs">
          {item.watched && <Eye className="h-3 w-3 text-blue-400 shrink-0" />}
          {item.rating != null && <Star className="h-3 w-3 text-yellow-400 fill-current shrink-0" />}
          {item.reviewBody && <MessageSquare className="h-3 w-3 text-green-400 shrink-0" />}
          <span className="text-muted-foreground truncate">{label}</span>
          <span className="text-muted-foreground shrink-0">· {relativeTime(item.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// The rating-distribution histogram (10 buckets, score 1–10).
function RatingGraph({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const max = Math.max(...distribution);
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-headline font-bold flex items-center gap-2"><Star className="h-5 w-5 text-primary" />Ratings</h2>
        <span className="text-xs text-muted-foreground">{total.toLocaleString()} rated</span>
      </div>
      <div className="flex items-end gap-1 h-16">
        {distribution.map((c, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end" title={`${i + 1}/10 · ${c}`}>
            <div className="rounded-t bg-primary/80" style={{ height: max > 0 ? `${(c / max) * 100}%` : 0, minHeight: c > 0 ? 4 : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />1</span>
        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />10</span>
      </div>
    </section>
  );
}

// One tappable stat row on the profile (Watch History, Ratings, …).
function StatRow({ icon, label, count, thisYear, onClick }: { icon: React.ReactNode; label: string; count: number; thisYear?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={count === 0}
      className="w-full flex items-center gap-3 py-4 border-b border-border last:border-0 text-left disabled:opacity-40 disabled:cursor-default hover:opacity-70 transition-opacity">
      {icon}
      <span className="flex-1 font-semibold">{label}</span>
      <span className="text-sm text-muted-foreground">
        {count.toLocaleString()}
        {thisYear != null && thisYear > 0 && <span className="text-muted-foreground/60"> · {thisYear} this year</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

type SectionKey = 'watched' | 'rewatched' | 'ratings' | 'watchlist';
type OpenKey = SectionKey | 'reviews' | 'lists';

// Per-poster-section config for the full-list rows.
const SECTION_META: Record<SectionKey, { label: string; statusIcon: React.ElementType }> = {
  watched: { label: 'Watched', statusIcon: Eye },
  rewatched: { label: 'Rewatched', statusIcon: Repeat },
  ratings: { label: 'Rated', statusIcon: Star },
  watchlist: { label: 'Watchlist', statusIcon: Bookmark },
};

// Header (title + icon) for every full-screen "See All" view.
const OPEN_META: Record<OpenKey, { title: string; icon: React.ReactNode }> = {
  watched: { title: 'Watch History', icon: <Eye className="h-5 w-5 text-primary" /> },
  rewatched: { title: 'Rewatched', icon: <Repeat className="h-5 w-5 text-primary" /> },
  ratings: { title: 'Ratings', icon: <Star className="h-5 w-5 text-primary" /> },
  watchlist: { title: 'Watchlist', icon: <Bookmark className="h-5 w-5 text-primary" /> },
  reviews: { title: 'Reviews', icon: <MessageSquare className="h-5 w-5 text-primary" /> },
  lists: { title: 'Custom Lists', icon: <List className="h-5 w-5 text-primary" /> },
};

const SECTION_PAGE_SIZE = 60;

// One row in a poster section's full list — TMDB rating, the user's own rating
// (when they rated it), a status label (only where it adds info), and the date.
interface SectionItem {
  tmdbId: string;
  score?: number;
  rewatchCount?: number;
  date?: string;
}

async function fetchSectionPage(key: SectionKey, uname: string, page: number, year?: number): Promise<{ items: SectionItem[]; hasMore: boolean }> {
  const yearParam = year ? `&year=${year}` : '';
  try {
    if (key === 'rewatched') {
      const res = await fetch(`/api/users/${uname}/rewatched?min=2&sort=recent&limit=${SECTION_PAGE_SIZE}&page=${page}${yearParam}`, { credentials: 'include' });
      if (!res.ok) return { items: [], hasMore: false };
      const json = await res.json();
      const rows: { tmdbId: string; count: number; lastWatchedAt?: string }[] = json.data?.items ?? [];
      return { items: rows.map(i => ({ tmdbId: i.tmdbId, rewatchCount: i.count, date: i.lastWatchedAt })), hasMore: !!json.data?.hasMore };
    }
    const res = await fetch(`/api/users/${uname}/${key}?limit=${SECTION_PAGE_SIZE}&page=${page}${yearParam}`, { credentials: 'include' });
    if (!res.ok) return { items: [], hasMore: false };
    const json = await res.json();
    const rows: { tmdbId: string; score?: number | null; watchedAt?: string; addedAt?: string; updatedAt?: string; createdAt?: string }[] = json.data ?? [];
    const items: SectionItem[] = rows.map(i => ({
      tmdbId: i.tmdbId,
      score: i.score ?? undefined,
      date: i.watchedAt ?? i.addedAt ?? i.updatedAt ?? i.createdAt,
    }));
    const total: number = json.pagination?.total ?? rows.length;
    return { items, hasMore: page * SECTION_PAGE_SIZE < total };
  } catch { return { items: [], hasMore: false }; }
}

function SectionRow({ item, section }: { item: SectionItem; section: SectionKey }) {
  const [meta, setMeta] = useState<Meta | null>(metaCache[item.tmdbId] ?? null);
  useEffect(() => { if (!meta) getMeta(item.tmdbId).then(m => { if (m) setMeta(m); }); }, [item.tmdbId, meta]);
  const cfg = SECTION_META[section];
  const StatusIcon = cfg.statusIcon;
  // The label only adds info for watched/rewatched — for ratings the blue score
  // says it all, and on the Watchlist page "Watchlist" is redundant.
  const showLabel = section === 'watched' || section === 'rewatched';
  const label = section === 'rewatched' && item.rewatchCount ? `Rewatched ×${item.rewatchCount}` : cfg.label;
  const dateLabel = item.date ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return (
    <Link href={`/movie/${item.tmdbId}`} className="flex gap-4 py-3 border-b border-border last:border-0 group">
      <div className="relative w-14 shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
        {meta?.poster ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="56px" /> : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/60" /></div>}
      </div>
      <div className="flex-1 min-w-0 space-y-1 py-0.5">
        {meta ? <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{meta.title}</p> : <div className="h-4 bg-muted rounded-full w-2/3 animate-pulse" />}
        {meta?.year && <p className="text-xs text-muted-foreground">{meta.year}</p>}
        <div className="flex items-center gap-3 flex-wrap pt-0.5">
          {meta?.tmdbRating != null && meta.tmdbRating > 0 && (
            <span className="flex items-center gap-1 text-sm font-bold"><Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />{meta.tmdbRating.toFixed(1)}</span>
          )}
          {item.score != null && (
            <span className="flex items-center gap-1 text-sm font-bold text-blue-400"><Star className="h-3.5 w-3.5 fill-current" />{item.score}</span>
          )}
          {showLabel && (
            <span className="flex items-center gap-1 text-xs font-semibold text-blue-400"><StatusIcon className="h-3.5 w-3.5" />{label}</span>
          )}
        </div>
        {dateLabel && <p className="text-xs text-muted-foreground">Added on {dateLabel}</p>}
      </div>
    </Link>
  );
}

function ListRow({ list }: { list: PublicList }) {
  return (
    <Link href={`/lists/${list.id}`} className="bg-card rounded-3xl border border-border px-5 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
      <div className="flex gap-1 shrink-0">
        {list.items.slice(0, 3).map(item => (
          <div key={item.tmdbId} className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0">
            {item.poster
              ? <img src={item.poster} alt={item.title ?? ''} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Film className="h-3 w-3 text-primary/60" /></div>
            }
          </div>
        ))}
        {list.items.length === 0 && (
          <div className="w-10 aspect-[2/3] rounded-lg bg-muted flex items-center justify-center">
            <Film className="h-3 w-3 text-primary/60" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{list.name}</p>
        <p className="text-xs text-muted-foreground">{list.items.length} {list.items.length === 1 ? 'title' : 'titles'}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [badgeData, setBadgeData] = useState<BadgeData | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Full-screen "See All" view for a section
  const [openSection, setOpenSection] = useState<OpenKey | null>(null);
  const [sectionItems, setSectionItems] = useState<SectionItem[]>([]);
  const [sectionPage, setSectionPage] = useState(1);
  const [sectionHasMore, setSectionHasMore] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  // Watch History / Rewatched full views: filter to this calendar year
  const [yearOnly, setYearOnly] = useState(false);
  const thisYear = new Date().getFullYear();

  const loadActivity = async (uname: string) => {
    try {
      const [wRes, rRes, vRes] = await Promise.all([
        fetch(`/api/users/${uname}/watched?limit=100`, { credentials: 'include' }),
        fetch(`/api/users/${uname}/ratings?limit=100`, { credentials: 'include' }),
        fetch(`/api/users/${uname}/reviews?limit=100`, { credentials: 'include' }),
      ]);
      const map = new Map<string, RecentItem>();
      const bump = (tmdbId: string, mediaType: string, patch: Partial<RecentItem>, date: string) => {
        const key = `${tmdbId}:${mediaType}`;
        const cur = map.get(key) ?? { tmdbId, mediaType, createdAt: '1970-01-01T00:00:00.000Z' };
        Object.assign(cur, patch);
        if (new Date(date).getTime() > new Date(cur.createdAt).getTime()) cur.createdAt = date;
        map.set(key, cur);
      };
      if (wRes.ok) { const d = await wRes.json(); for (const w of (d.data ?? [])) bump(w.tmdbId, w.mediaType, { watched: true }, w.watchedAt ?? new Date().toISOString()); }
      if (rRes.ok) { const d = await rRes.json(); for (const r of (d.data ?? [])) bump(r.tmdbId, r.mediaType, { rating: r.score }, r.updatedAt ?? r.createdAt ?? new Date().toISOString()); }
      if (vRes.ok) { const d = await vRes.json(); for (const v of (d.data ?? [])) bump(v.tmdbId, v.mediaType, { reviewBody: v.body }, v.createdAt ?? new Date().toISOString()); }
      const list = [...map.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      await prewarmMetaCache(list.slice(0, 30).map(i => i.tmdbId));
      setRecentActivity(list);
    } catch { /* ignore */ }
  };

  const loadProfile = useCallback(async () => {
    const res = await fetchWithAuth(`/api/users/${username}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    const p: ProfileUser = json.data;

    if (p.isOwner) { router.replace('/profile'); return; }

    setProfile(p);
    setLoading(false);

    if (!p.isPrivate || p.isFollowing) {
      loadActivity(p.username);
      fetch(`/api/users/${p.username}/favorites`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(async json => {
          if (!json?.data) return;
          await prewarmMetaCache(json.data.map((f: { tmdbId: string }) => f.tmdbId));
          setFavorites(json.data);
        })
        .catch(() => {});
      fetch(`/api/users/${p.username}/badges`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.data) setBadgeData(json.data); })
        .catch(() => {});
    }
  }, [username, router]);

  // (Re)load page 1 of a poster section, optionally filtered to this year.
  const loadSectionFirstPage = async (key: SectionKey, year?: number) => {
    if (!profile) return;
    setSectionItems([]);
    setSectionPage(1);
    setSectionHasMore(false);
    setSectionLoading(true);
    const { items, hasMore } = await fetchSectionPage(key, profile.username, 1, year);
    await prewarmMetaCache(items.map(i => i.tmdbId));
    setSectionItems(items);
    setSectionHasMore(hasMore);
    setSectionLoading(false);
  };

  const toggleYearOnly = () => {
    if (!openSection || (openSection !== 'watched' && openSection !== 'rewatched')) return;
    const next = !yearOnly;
    setYearOnly(next);
    loadSectionFirstPage(openSection, next ? thisYear : undefined);
  };

  const openSectionView = async (key: OpenKey) => {
    if (!profile) return;
    setOpenSection(key);
    setYearOnly(false);
    window.scrollTo(0, 0);

    if (key === 'reviews') {
      if (reviews.length === 0) {
        setReviewsLoading(true);
        try {
          const res = await fetch(`/api/users/${profile.username}/reviews?limit=50`, { credentials: 'include' });
          if (res.ok) { const j = await res.json(); const items: ReviewItem[] = j.data ?? []; await prewarmMetaCache(items.map(r => r.tmdbId)); setReviews(items); }
        } catch { /* ignore */ }
        finally { setReviewsLoading(false); }
      }
      return;
    }
    if (key === 'lists') {
      if (lists.length === 0) {
        setListsLoading(true);
        try {
          const res = await fetch(`/api/users/${profile.username}/lists`, { credentials: 'include' });
          if (res.ok) { const j = await res.json(); setLists(j.data ?? []); }
        } catch { /* ignore */ }
        finally { setListsLoading(false); }
      }
      return;
    }

    loadSectionFirstPage(key);
  };

  const loadMoreSection = async () => {
    if (!profile || !openSection || openSection === 'reviews' || openSection === 'lists' || sectionLoading) return;
    const next = sectionPage + 1;
    setSectionLoading(true);
    const { items, hasMore } = await fetchSectionPage(openSection, profile.username, next, yearOnly ? thisYear : undefined);
    await prewarmMetaCache(items.map(i => i.tmdbId));
    setSectionItems(prev => [...prev, ...items]);
    setSectionPage(next);
    setSectionHasMore(hasMore);
    setSectionLoading(false);
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

  // Full-screen "See All" view — replaces the profile until the back arrow is
  // pressed (the installed PWA has no browser back button).
  if (openSection) {
    const meta = OPEN_META[openSection];
    const posterSkeleton = (
      <div className="bg-card rounded-2xl border border-border px-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-3 border-b border-border last:border-0">
            <div className="w-14 aspect-[2/3] rounded-lg bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-muted rounded-full w-2/3 animate-pulse" />
              <div className="h-3 bg-muted rounded-full w-1/4 animate-pulse" />
              <div className="h-3 bg-muted rounded-full w-1/3 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
    const emptyState = (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Film className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nothing here yet</p>
      </div>
    );
    return (
      <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
        <div className="flex items-center gap-2">
          <button onClick={() => setOpenSection(null)} aria-label="Go back" className="rounded-full p-1 -ml-1 hover:bg-muted/60 transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-headline font-bold flex items-center gap-2">{meta.icon}{meta.title}</h1>
        </div>

        {/* All / This Year filter — Watch History and Rewatched only */}
        {(openSection === 'watched' || openSection === 'rewatched') && (
          <div className="flex gap-1 p-1 bg-muted rounded-full w-fit">
            <button onClick={() => { if (yearOnly) toggleYearOnly(); }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${!yearOnly ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
              All Time
            </button>
            <button onClick={() => { if (!yearOnly) toggleYearOnly(); }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${yearOnly ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}>
              {thisYear}
            </button>
          </div>
        )}

        {openSection === 'reviews' ? (
          reviewsLoading && reviews.length === 0 ? posterSkeleton
            : reviews.length === 0 ? emptyState
            : <div className="space-y-2">{reviews.map(r => <ReviewCard key={r.id} review={r} />)}</div>
        ) : openSection === 'lists' ? (
          listsLoading && lists.length === 0 ? posterSkeleton
            : lists.length === 0 ? emptyState
            : <div className="space-y-3">{lists.map(l => <ListRow key={l.id} list={l} />)}</div>
        ) : (
          sectionLoading && sectionItems.length === 0 ? posterSkeleton
            : sectionItems.length === 0 ? emptyState
            : (
              <>
                <div className="bg-card rounded-2xl border border-border px-4">
                  {sectionItems.map(it => <SectionRow key={it.tmdbId} item={it} section={openSection as SectionKey} />)}
                </div>
                {sectionHasMore && (
                  <div className="flex justify-center">
                    <Button variant="outline" onClick={loadMoreSection} disabled={sectionLoading} className="rounded-xl">
                      {sectionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                    </Button>
                  </div>
                )}
              </>
            )
        )}
      </main>
    );
  }

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
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: '#8a6d00' }}>
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

      {/* Stats — only Following / Followers (the rest live in the rows below) */}
      {isVisible && (
        <div className="flex gap-10">
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

      {/* Recent Activity — consolidated per film; 5 → See All (30) → See Less */}
      {isVisible && recentActivity.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-headline font-bold flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />Recent Activity
            </h2>
            {recentActivity.length > 5 && (
              <button onClick={() => setActivityExpanded(v => !v)}
                className="text-xs font-semibold text-primary hover:opacity-70 transition-opacity">
                {activityExpanded ? 'See Less' : 'See All'}
              </button>
            )}
          </div>
          <div className="bg-card rounded-3xl border border-border px-5 py-2">
            {(activityExpanded ? recentActivity.slice(0, 30) : recentActivity.slice(0, 5)).map(item => <RecentCard key={`${item.tmdbId}:${item.mediaType}`} item={item} />)}
          </div>
        </section>
      )}

      {/* Ratings distribution graph */}
      {isVisible && <RatingGraph distribution={profile.ratingDistribution ?? []} />}

      {/* Stat rows — each opens the full-screen list */}
      {isVisible && (
        <section className="bg-card rounded-2xl border border-border px-4">
          <StatRow icon={<Eye className="h-5 w-5 text-primary" />} label="Watch History" count={profile.watchedCount} thisYear={profile.watchedThisYear} onClick={() => openSectionView('watched')} />
          <StatRow icon={<Repeat className="h-5 w-5 text-primary" />} label="Rewatched" count={profile.rewatchedCount} thisYear={profile.rewatchedThisYear} onClick={() => openSectionView('rewatched')} />
          <StatRow icon={<Star className="h-5 w-5 text-primary" />} label="Ratings" count={(profile.ratingDistribution ?? []).reduce((a, b) => a + b, 0)} onClick={() => openSectionView('ratings')} />
          <StatRow icon={<Bookmark className="h-5 w-5 text-primary" />} label="Watchlist" count={profile.watchlistCount} onClick={() => openSectionView('watchlist')} />
          <StatRow icon={<List className="h-5 w-5 text-primary" />} label="Custom Lists" count={profile.listsCount} onClick={() => openSectionView('lists')} />
          <StatRow icon={<MessageSquare className="h-5 w-5 text-primary" />} label="Reviews" count={profile.reviewsCount} onClick={() => openSectionView('reviews')} />
        </section>
      )}
    </main>
  );
}
