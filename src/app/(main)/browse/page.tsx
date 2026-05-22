
"use client"

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, ChevronRight, Film, Loader2, Eye, User } from 'lucide-react';
import { Movie } from '@/lib/mock-data';
import { MovieCard } from '@/components/movie-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearch, usePopularMovies, PersonResult } from '@/hooks/use-movies';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
}

// ─── Person row in search results ─────────────────────────────────────────────

function PersonRow({ person }: { person: PersonResult }) {
  return (
    <Link href={`/person/${person.id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      <div className="w-14 h-14 rounded-full overflow-hidden bg-muted shrink-0 shadow-sm border border-white/10">
        {person.profileImage ? (
          <img src={person.profileImage} alt={person.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{person.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{person.department}</p>
      </div>
    </Link>
  );
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
      <div className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm flex items-center justify-center">
        {poster ? (
          <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Film className="h-6 w-6 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}

function RecentPersonRow({ item }: { item: RecentItem }) {
  return (
    <Link href={`/person/${item.id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      <div className="w-14 h-14 rounded-full overflow-hidden bg-muted shrink-0 shadow-sm border border-white/10 flex items-center justify-center">
        {item.poster ? (
          <img src={item.poster} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <User className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Person</p>
      </div>
    </Link>
  );
}

// ─── List row inside the See All dialog ──────────────────────────────────────

function DialogMovieRow({ movie }: { movie: Movie }) {
  const [userRating, setUserRating] = useState<number | undefined>();
  const [watched, setWatched] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(`watched-${movie.id}`) === 'true') setWatched(true);
      const r = localStorage.getItem(`movie-rating-${movie.id}`);
      if (r) setUserRating(Number(r));
    } catch { /* ignore */ }
  }, [movie.id]);

  return (
    <Link href={`/movie/${movie.id}`} className="group flex items-center gap-4 py-3.5 border-b border-border last:border-0">
      <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm shrink-0">
        <img src={movie.poster} alt={movie.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {movie.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">{movie.year}</p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-yellow-400 font-bold">★</span>
            <span className="text-xs font-bold text-foreground">{movie.rating.toFixed(1)}</span>
          </div>
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
          {watched && (
            <div className="flex items-center gap-1 text-blue-400">
              <Eye className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Watched</span>
            </div>
          )}
        </div>
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
      <DialogContent className="max-w-lg rounded-3xl h-[80vh] flex flex-col p-0 bg-background border-border">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
          <DialogTitle className="font-headline text-2xl font-bold">{title}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <div className="pt-2">
            {allItems.map(movie => <DialogMovieRow key={movie.id} movie={movie} />)}
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
  const { results: searchResults, people: searchPeople, loading: searchLoading } = useSearch(searchTerm, []);

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
            ) : (searchResults.length > 0 || searchPeople.length > 0) ? (
              <div>
                {searchPeople.length > 0 && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1 mt-1">People</p>
                    <div className="divide-y divide-border">
                      {searchPeople.map(p => <PersonRow key={p.id} person={p} />)}
                    </div>
                  </>
                )}
                {searchResults.length > 0 && (
                  <>
                    {searchPeople.length > 0 && (
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-5 mb-1">Movies & Shows</p>
                    )}
                    <div className="divide-y divide-border">
                      {searchResults.map(m => (
                        <ResultRow key={m.id} id={m.id} poster={m.poster} title={m.title} sub={m.year} />
                      ))}
                    </div>
                  </>
                )}
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
                    item.type === 'person' ? (
                      <RecentPersonRow key={item.id} item={item} />
                    ) : (
                      <ResultRow
                        key={item.id}
                        id={item.id}
                        poster={item.poster}
                        title={item.title}
                        sub={item.type === 'show' ? `${item.year} · TV Series` : item.year}
                      />
                    )
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
