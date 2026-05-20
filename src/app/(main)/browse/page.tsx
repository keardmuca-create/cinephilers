
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, ChevronRight, Film, Loader2 } from 'lucide-react';
import { Movie } from '@/lib/mock-data';
import { MovieCard } from '@/components/movie-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearch, usePopularMovies } from '@/hooks/use-movies';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
}

// ─── Shared row used in Recent + search results ───────────────────────────────

function ResultRow({ id, poster, title, sub }: {
  id: string;
  poster: string;
  title: string;
  sub: string;
}) {
  return (
    <Link href={`/movie/${id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      <div className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm">
        <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}

// ─── Section header used for Top Movies / Top Shows / Coming Soon ─────────────

const SectionHeader = ({ title, allItems }: { title: string; allItems: Movie[] }) => (
  <div className="flex items-center justify-between px-6">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h3 className="text-xl font-headline font-bold">{title}</h3>
    </div>
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1">
          See All <ChevronRight className="h-3 w-3" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl rounded-[2rem] h-[80vh] flex flex-col p-0 bg-background/95 backdrop-blur-xl border-border">
        <DialogHeader className="p-8 pb-2">
          <DialogTitle className="font-headline text-3xl font-bold">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-8 pb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 pt-4">
            {allItems.map(movie => <MovieCard key={movie.id} movie={movie} className="w-full" />)}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-8">
    <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
      <Film className="h-8 w-8 text-muted-foreground" />
    </div>
    <p className="text-muted-foreground font-medium">{message}</p>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const [searchTerm, setSearchTerm]   = useState('');
  const [focused, setFocused]         = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const [comingSoonTab, setComingSoonTab] = useState<'movie' | 'show'>('movie');

  const fallback = { movies: [], shows: [], trending: [] };
  const { data } = usePopularMovies(fallback);
  const { results: searchResults, loading: searchLoading } = useSearch(searchTerm, []);

  const comingSoonMovies = useMemo(() => data.movies.slice().reverse(), [data.movies]);
  const comingSoonShows  = useMemo(() => data.shows.slice().reverse(),  [data.shows]);
  const comingSoonList   = comingSoonTab === 'movie' ? comingSoonMovies : comingSoonShows;
  const isSearching = searchTerm.trim().length > 0;
  const showOverlay  = focused || isSearching; // search bar active

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) setRecentItems((JSON.parse(stored) as RecentItem[]).slice(0, 30));
    } catch { /* ignore */ }
  }, []);

  const cancel = () => {
    setSearchTerm('');
    setFocused(false);
  };

  return (
    <main className="pt-10 pb-28 max-w-2xl mx-auto">
      {/* Search bar */}
      <div className="px-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search movies, shows, people..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setFocused(true)}
              className="w-full pl-11 pr-11 py-3.5 rounded-2xl border-2 border-foreground/80 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {showOverlay && (
            <button onClick={cancel} className="text-sm font-medium text-foreground shrink-0">
              Cancel
            </button>
          )}
        </div>
      </div>

      {showOverlay ? (
        /* ── Search bar active: Recent list or live results ── */
        <div className="px-6">
          {isSearching ? (
            /* Live results */
            searchLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : searchResults.length > 0 ? (
              <div className="divide-y divide-border">
                {searchResults.map(m => (
                  <ResultRow key={m.id} id={m.id} poster={m.poster} title={m.title} sub={m.year} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No results for &ldquo;{searchTerm}&rdquo;
              </p>
            )
          ) : (
            /* Recent */
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Recent</p>
              {recentItems.length > 0 ? (
                <div className="divide-y divide-border">
                  {recentItems.map(item => (
                    <ResultRow
                      key={item.id}
                      id={item.id}
                      poster={item.poster}
                      title={item.title}
                      sub={item.type === 'show' ? `${item.year} · TV Series` : item.year}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">No recently viewed titles yet</p>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Default: Top Movies, Top Shows, Coming Soon ── */
        <div className="space-y-10">
          <div className="space-y-4">
            <SectionHeader title="Top Movies" allItems={data.movies} />
            <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
              {data.movies.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
            </div>
          </div>
          <div className="space-y-4">
            <SectionHeader title="Top Shows" allItems={data.shows} />
            {data.shows.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {data.shows.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            ) : (
              <EmptyState message="No shows yet. Check back soon." />
            )}
          </div>
          <div className="space-y-4">
            <SectionHeader title="Coming Soon" allItems={comingSoonList} />
            {/* Full-width Movie / Show toggle */}
            <div className="flex mx-6 rounded-2xl overflow-hidden border border-border">
              <button
                onClick={() => setComingSoonTab('movie')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  comingSoonTab === 'movie'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Movie
              </button>
              <button
                onClick={() => setComingSoonTab('show')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  comingSoonTab === 'show'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                Show
              </button>
            </div>
            {comingSoonList.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {comingSoonList.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            ) : (
              <EmptyState message={`No ${comingSoonTab === 'movie' ? 'movies' : 'shows'} coming soon yet.`} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
