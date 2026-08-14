
"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, X, ChevronRight, Film, Loader2, User } from 'lucide-react';
import { Movie } from '@/lib/mock-data';
import { MovieCard } from '@/components/movie-card';
import { useSearch, PersonResult } from '@/hooks/use-movies';
import { MediaToggle } from '@/components/media-toggle';
import type { MediaSide } from '@/lib/media-type';

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
      {/* Same shape and size as the movie-poster rows, so mixed results line up */}
      <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm">
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

function ResultRow({ id, poster, title, sub, onRemove }: {
  id: string;
  poster: string;
  title: string;
  sub: string;
  onRemove?: () => void;
}) {
  return (
    <Link href={`/movie/${id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm flex items-center justify-center">
        {poster ? (
          <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Film className="h-6 w-6 text-primary/60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
      {onRemove && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </Link>
  );
}

function RecentPersonRow({ item, onRemove }: { item: RecentItem; onRemove?: () => void }) {
  return (
    <Link href={`/person/${item.id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      {/* Same shape and size as the movie-poster rows, so mixed results line up */}
      <div className="w-20 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm flex items-center justify-center">
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
      {onRemove && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </Link>
  );
}

// ─── Section header used for Top Movies / Top Shows / Coming Soon ─────────────

const SectionHeader = ({ title, seeAllHref }: { title: string; seeAllHref?: string }) => (
  <div className="flex items-center justify-between px-6">
    <div className="flex items-center gap-3">
      <div className="w-1 h-5 bg-primary rounded-full" />
      <h3 className="text-xl font-headline font-bold">{title}</h3>
    </div>
    {seeAllHref && (
      <Link
        href={seeAllHref}
        className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
      >
        See All <ChevronRight className="h-3 w-3" />
      </Link>
    )}
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

  const [comingSoonTab, setComingSoonTab] = useState<MediaSide>('movies');
  const [searchTab, setSearchTab] = useState<'titles' | 'people'>('titles');

  const { combined: searchCombined, loading: searchLoading } = useSearch(searchTerm, []);

  // Top Movies / Top Shows rows are ranked by rating (same source the
  // Top-100 "See All" pages use), so the preview matches the full list.
  const [topMovies, setTopMovies] = useState<Movie[]>([]);
  const [topShows, setTopShows] = useState<Movie[]>([]);
  const [upcomingMovies, setUpcomingMovies] = useState<Movie[]>([]);
  const [upcomingShows, setUpcomingShows] = useState<Movie[]>([]);
  useEffect(() => {
    fetch('/api/discover/browse')
      .then(r => r.json())
      .then((d: { topMovies?: Movie[]; topShows?: Movie[]; upcoming?: Movie[]; upcomingShows?: Movie[] }) => {
        setTopMovies(d.topMovies ?? []);
        setTopShows(d.topShows ?? []);
        setUpcomingMovies(d.upcoming ?? []);
        setUpcomingShows(d.upcomingShows ?? []);
      })
      .catch(() => {});
  }, []);

  const comingSoonList   = comingSoonTab === 'movies' ? upcomingMovies : upcomingShows;
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

  const removeRecent = (id: string) => {
    const updated = recentItems.filter(item => item.id !== id);
    setRecentItems(updated);
    try { localStorage.setItem('recently-viewed', JSON.stringify(updated)); } catch { /* ignore */ }
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
              className="w-full pl-11 pr-11 py-3.5 rounded-2xl border-2 border-primary/80 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
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
            ) : searchCombined.length > 0 ? (
              <>
                <div className="flex w-full rounded-full border border-border p-1 mb-3">
                  <button
                    onClick={() => setSearchTab('titles')}
                    className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${searchTab === 'titles' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    Movies &amp; Shows
                  </button>
                  <button
                    onClick={() => setSearchTab('people')}
                    className={`flex-1 rounded-full py-2 text-sm font-medium transition-colors ${searchTab === 'people' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  >
                    People
                  </button>
                </div>
                {searchTab === 'titles' ? (
                  searchCombined.some(i => i.kind === 'movie') ? (
                    <div className="divide-y divide-border">
                      {searchCombined.map((item, i) =>
                        item.kind === 'movie' ? (
                          <ResultRow key={`movie-${item.data.id}-${i}`} id={item.data.id} poster={item.data.poster} title={item.data.title} sub={item.data.year} />
                        ) : null
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No movies or shows for &ldquo;{searchTerm}&rdquo;</p>
                  )
                ) : (
                  searchCombined.some(i => i.kind === 'person') ? (
                    <div className="divide-y divide-border">
                      {searchCombined.map((item, i) =>
                        item.kind === 'person' ? (
                          <PersonRow key={`person-${item.data.id}-${i}`} person={item.data} />
                        ) : null
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-8 text-center">No people for &ldquo;{searchTerm}&rdquo;</p>
                  )
                )}
              </>
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
                      <RecentPersonRow key={item.id} item={item} onRemove={() => removeRecent(item.id)} />
                    ) : (
                      <ResultRow
                        key={item.id}
                        id={item.id}
                        poster={item.poster}
                        title={item.title}
                        sub={item.type === 'show' ? `${item.year} · TV Series` : item.year}
                        onRemove={() => removeRecent(item.id)}
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
            <SectionHeader title="Top Movies" seeAllHref="/see-all/top-rated-movies?title=Top+100+Movies" />
            <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
              {topMovies.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
            </div>
          </div>
          <div className="space-y-4">
            <SectionHeader title="Top Shows" seeAllHref="/see-all/top-rated-shows?title=Top+100+Shows" />
            {topShows.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {topShows.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            ) : (
              <EmptyState message="No shows yet. Check back soon." />
            )}
          </div>
          <div className="space-y-4">
            <SectionHeader title="Coming Soon" seeAllHref={comingSoonTab === 'shows' ? '/see-all/coming-soon-shows' : '/see-all/coming-soon'} />
            {/* The same Movies | Shows pill every other list uses. This one had
                its own square full-width version with singular labels. */}
            <div className="px-6">
              <MediaToggle value={comingSoonTab} onChange={setComingSoonTab} />
            </div>
            {comingSoonList.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {comingSoonList.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
              </div>
            ) : (
              <EmptyState message={`No ${comingSoonTab === 'movies' ? 'movies' : 'shows'} coming soon yet.`} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
