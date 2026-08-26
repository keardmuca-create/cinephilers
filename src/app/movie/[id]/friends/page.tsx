"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, MessageSquare, Star, Users, Loader2, Search, X, Bookmark } from 'lucide-react';
import { WatchedEye } from '@/components/watched-eye';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { lensCounts, matchesLens, lensRank, type Lens } from '@/lib/friend-lens';

interface FriendRatingEntry {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  rating: number | null;
  watched: boolean;
  reviewed: boolean;
  inWatchlist: boolean;
  /** Shows only: "62 / 62", "Season 1", "13 / 62", "1 episode". */
  progress?: string;
}

export default function MovieFriendsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  const [entries, setEntries] = useState<FriendRatingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [movieTitle, setMovieTitle] = useState<string>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authUser) return;

    // Load movie title from cache
    try {
      const cached = localStorage.getItem(`meta-${id}`);
      if (cached) setMovieTitle(JSON.parse(cached).title ?? '');
    } catch { /* ignore */ }

    fetchWithAuth(`/api/movies/friends-ratings?tmdbId=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { setEntries(json?.data ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, authUser]);

  // Which chip is on. Null is "everyone who has anything here", which is what
  // the endpoint returns in the first place — it only ever includes people you
  // follow who watched, rated, reviewed or watchlisted this title.
  const [lens, setLens] = useState<Lens>(null);

  // Derived, never fetched: the payload already carries every flag, so the chip
  // numbers cost one pass over an array the page is holding anyway.
  const counts = useMemo(() => lensCounts(entries), [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (e: FriendRatingEntry) =>
      !q ||
      (e.user.displayName ?? e.user.username).toLowerCase().includes(q) ||
      e.user.username.toLowerCase().includes(q);

    // Ties fall back to the name, so the order is stable between visits rather
    // than depending on which query happened to return first.
    return entries
      .filter(e => matchesLens(e, lens) && matchesSearch(e))
      .sort((a, b) =>
        lensRank(a) - lensRank(b) ||
        (a.user.displayName ?? a.user.username).localeCompare(b.user.displayName ?? b.user.username)
      );
  }, [entries, search, lens]);

  if (!authLoading && !authUser) {
    router.replace('/login');
    return null;
  }

  return (
    <main className="max-w-xl mx-auto px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={() => router.back()}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">Friends</h1>
          {movieTitle && <p className="text-sm text-muted-foreground truncate">{movieTitle}</p>}
        </div>
      </div>

      {/* The chips. They FILTER rather than label — at eighty-three friends,
          knowing that twenty-four reviewed it does not help; seeing only those
          twenty-four does. Same decision as the role chips on a person page.

          A chip with nothing behind it is left out entirely: "0 reviewed" is a
          dead control that still costs a tap's worth of attention. */}
      {!loading && entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            [null, 'friends', counts.all],
            ['watched', 'watched', counts.watched],
            ['rated', 'rated', counts.rated],
            ['reviewed', 'reviewed', counts.reviewed],
            ['watchlist', 'watchlist', counts.watchlist],
          ] as [Lens, string, number][])
            .filter(([key, , n]) => key === null || n > 0)
            .map(([key, label, n]) => {
              const on = lens === key;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setLens(key)}
                  aria-pressed={on}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition-colors ${
                    on
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {n} {label}
                </button>
              );
            })}
        </div>
      )}

      {/* Search */}
      {!loading && entries.length > 4 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search friends"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No friend activity yet</p>
            {/* "watched or rated" undersold what this page checks — it also lists
                friends who reviewed or watchlisted the title. */}
            <p className="text-sm text-muted-foreground mt-1">Nothing yet from the people you follow</p>
          </div>
        </div>
      )}

      {/* Nothing left after the search and the chip. A chip alone can't empty the
          list — one with a count of zero is never rendered — so this only appears
          once a search is involved, and it says which of the two to undo. */}
      {!loading && entries.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? <>No friends match &ldquo;{search}&rdquo;</> : 'Nothing here'}
            {lens && <> in <span className="font-bold">{lens}</span></>}
          </p>
          <button
            onClick={() => { setSearch(''); setLens(null); }}
            className="text-xs text-primary font-bold"
          >
            Show all friends
          </button>
        </div>
      )}

      {/* List */}
      {!loading && filtered.length > 0 && (
        <div className="bg-card rounded-3xl border border-border divide-y divide-border overflow-hidden">
          {filtered.map(e => (
            <Link
              key={e.user.id}
              href={`/profile/${e.user.username}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
            >
              {/* Avatar */}
              <div className="h-12 w-12 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                {e.user.avatarUrl
                  ? <img src={e.user.avatarUrl} alt={e.user.username} className="w-full h-full object-cover" />
                  : <span className="text-primary font-bold">{(e.user.displayName ?? e.user.username).slice(0, 2).toUpperCase()}</span>
                }
              </div>

              {/* Name + username, and for a show how far through it they are.
                  The label goes here rather than in the icon row because
                  "Seasons 1–2" won't fit a fixed slot. */}
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{e.user.displayName ?? e.user.username}</p>
                <p className="text-sm text-muted-foreground truncate">@{e.user.username}</p>
                {e.progress && (
                  <p className="text-xs font-medium text-primary/90 truncate mt-0.5">{e.progress}</p>
                )}
              </div>

              {/* Three constant slots, always in the same order: watched eye ·
                  rating · review. A dash fills any empty slot so every row
                  lines up. Rating or reviewing implies they watched it, so the
                  eye shows even if the watched flag never got set. */}
              <div className="flex items-center gap-3 shrink-0">
                <span className="w-5 flex justify-center">
                  {(e.watched || e.rating !== null || e.reviewed)
                    ? <WatchedEye state="complete" className="h-4 w-4" />
                    : e.progress
                      // Part-way through a show — the hollow eye, same as everywhere.
                      ? <WatchedEye state="partial" className="h-4 w-4" />
                      : <span className="text-sm text-muted-foreground/50">—</span>}
                </span>
                <span className="w-10 flex items-center justify-center gap-1">
                  {e.rating !== null ? (
                    <>
                      <Star className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-bold text-foreground">{e.rating}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground/50">—</span>
                  )}
                </span>
                <span className="w-5 flex justify-center">
                  {e.reviewed
                    ? <MessageSquare className="h-4 w-4 text-green-400" />
                    : <span className="text-sm text-muted-foreground/50">—</span>}
                </span>
                <span className="w-5 flex justify-center">
                  {e.inWatchlist
                    ? <Bookmark className="h-4 w-4 text-primary fill-primary/20" />
                    : <span className="text-sm text-muted-foreground/50">—</span>}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
