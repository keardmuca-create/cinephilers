"use client"

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Movie } from '@/lib/types';
import { MovieCard } from '@/components/movie-card';
import {
  Search, X, Film, Loader2, Tv, ChevronRight, Star, TrendingUp,
  Calendar, Layers,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useSearch } from '@/hooks/use-movies';
import Image from 'next/image';

// ─── Hardcoded 12 genres with correct TMDB movie + TV genre IDs ───────────────
// tvId = 0 means no equivalent TV genre on TMDB

const BROWSE_GENRES = [
  { name: 'Action',      movieId: 28,    tvId: 10759, emoji: '💥' },
  { name: 'Comedy',      movieId: 35,    tvId: 35,    emoji: '😂' },
  { name: 'Horror',      movieId: 27,    tvId: 0,     emoji: '👻' },
  { name: 'Adventure',   movieId: 12,    tvId: 10759, emoji: '🗺️' },
  { name: 'Mystery',     movieId: 9648,  tvId: 9648,  emoji: '🔍' },
  { name: 'Crime',       movieId: 80,    tvId: 80,    emoji: '🔫' },
  { name: 'Documentary', movieId: 99,    tvId: 99,    emoji: '🎥' },
  { name: 'Drama',       movieId: 18,    tvId: 18,    emoji: '🎭' },
  { name: 'Fantasy',     movieId: 14,    tvId: 10765, emoji: '🧙' },
  { name: 'Romance',     movieId: 10749, tvId: 0,     emoji: '💕' },
  { name: 'Sci-Fi',      movieId: 878,   tvId: 10765, emoji: '🚀' },
  { name: 'Thriller',    movieId: 53,    tvId: 0,     emoji: '🔪' },
] as const;

type BrowseGenre = typeof BROWSE_GENRES[number];

// ─── Genre color palette (one per genre, in order) ───────────────────────────

const GENRE_COLORS = [
  'bg-red-500/20 text-red-300 border-red-500/20 hover:bg-red-500/30',       // Action
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/30', // Comedy
  'bg-zinc-700/50 text-zinc-200 border-zinc-600/50 hover:bg-zinc-700/70',   // Horror
  'bg-orange-500/20 text-orange-300 border-orange-500/20 hover:bg-orange-500/30', // Adventure
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/30', // Mystery
  'bg-slate-600/40 text-slate-200 border-slate-500/40 hover:bg-slate-600/60', // Crime
  'bg-teal-500/20 text-teal-300 border-teal-500/20 hover:bg-teal-500/30',   // Documentary
  'bg-blue-500/20 text-blue-300 border-blue-500/20 hover:bg-blue-500/30',   // Drama
  'bg-violet-500/20 text-violet-300 border-violet-500/20 hover:bg-violet-500/30', // Fantasy
  'bg-pink-500/20 text-pink-300 border-pink-500/20 hover:bg-pink-500/30',   // Romance
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/30',   // Sci-Fi
  'bg-rose-700/30 text-rose-200 border-rose-600/30 hover:bg-rose-700/50',   // Thriller
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrowseData {
  topMovies: Movie[];
  topShows: Movie[];
  upcoming: Movie[];
}

// ─── Shared section header ────────────────────────────────────────────────────

function SectionHeader({
  title,
  icon,
  seeAllHref,
}: {
  title: string;
  icon: React.ReactNode;
  seeAllHref?: string;
}) {
  return (
    <div className="flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="w-1 h-5 bg-primary rounded-full" />
        <h2 className="text-xl font-headline font-bold flex items-center gap-2">
          {icon}
          {title}
        </h2>
      </div>
      {seeAllHref && (
        <Link
          href={seeAllHref}
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1 shrink-0"
        >
          See All <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CardRowSkeleton() {
  return (
    <div className="flex gap-4 px-6 pb-4">
      {Array(5).fill(0).map((_, i) => (
        <div key={i} className="space-y-3 shrink-0">
          <div className="h-[240px] w-44 rounded-xl bg-white/5 animate-pulse" />
          <div className="h-4 w-32 rounded bg-white/5 animate-pulse" />
          <div className="h-3 w-20 rounded bg-white/5 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-8">
      <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Film className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground text-sm font-medium">{message}</p>
    </div>
  );
}

// ─── Coming Soon card (poster + release date badge) ──────────────────────────

function UpcomingCard({ movie }: { movie: Movie }) {
  return (
    <Link href={`/movie/${movie.id}`} className="shrink-0 group w-44">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-lg mb-2 movie-card-hover">
        <Image
          src={movie.poster}
          alt={movie.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="176px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        {movie.releaseDate && (
          <div className="absolute bottom-2 left-2 right-2">
            <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-primary/90 text-white px-2 py-1 rounded-full uppercase tracking-wide">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(movie.releaseDate).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
          </div>
        )}
      </div>
      <h3 className="text-xs font-bold font-headline line-clamp-2 leading-snug px-0.5 group-hover:text-primary transition-colors">
        {movie.title}
      </h3>
      {movie.genre && (
        <p className="text-[10px] text-muted-foreground mt-0.5 px-0.5">
          {movie.genre.split(' · ')[0]}
        </p>
      )}
    </Link>
  );
}

// ─── Genre results sub-section ───────────────────────────────────────────────

function GenreResults({
  genre,
  results,
  loading,
}: {
  genre: BrowseGenre;
  results: Movie[];
  loading: boolean;
}) {
  const movieCount = results.filter(m => m.type === 'movie').length;
  const showCount = results.filter(m => m.type === 'show').length;

  const seeAllHref = `/see-all/genre-${genre.movieId}-${genre.tvId}?title=${encodeURIComponent(genre.name)}`;

  return (
    <div className="space-y-3 pt-1">
      {/* Header row */}
      <div className="flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          {movieCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground border border-white/10 rounded-full px-2 py-0.5">
              <Film className="h-2.5 w-2.5" /> {movieCount} movies
            </span>
          )}
          {showCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground border border-white/10 rounded-full px-2 py-0.5">
              <Tv className="h-2.5 w-2.5" /> {showCount} shows
            </span>
          )}
        </div>
        <Link
          href={seeAllHref}
          className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
        >
          See All 100 <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Results */}
      {loading ? (
        <CardRowSkeleton />
      ) : results.length > 0 ? (
        <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
          {results.map(m => <MovieCard key={m.id} movie={m} />)}
        </div>
      ) : (
        <EmptyState message={`No results found for ${genre.name}.`} />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [browseData, setBrowseData] = useState<BrowseData | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);

  // Genre state
  const [selectedGenre, setSelectedGenre] = useState<BrowseGenre | null>(null);
  const [genreResults, setGenreResults] = useState<Movie[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const genreResultsRef = useRef<HTMLDivElement>(null);

  const { results: searchResults, loading: searchLoading } = useSearch(searchTerm, []);
  const isSearching = searchTerm.trim().length > 0;

  // Fetch all browse data on mount
  useEffect(() => {
    fetch('/api/discover/browse')
      .then(r => r.json())
      .then((data: BrowseData & { error?: string }) => {
        if (!data.error) setBrowseData(data);
      })
      .catch(() => {})
      .finally(() => setBrowseLoading(false));
  }, []);

  // Lazy-fetch genre results (movies + shows combined)
  const fetchGenre = useCallback((genre: BrowseGenre) => {
    setGenreLoading(true);
    setGenreResults([]);
    const url = `/api/discover/genre?movieId=${genre.movieId}&tvId=${genre.tvId}&count=25`;
    fetch(url)
      .then(r => r.json())
      .then((data: { items?: Movie[] }) => {
        if (data.items) setGenreResults(data.items);
      })
      .catch(() => {})
      .finally(() => setGenreLoading(false));
  }, []);

  const handleGenreSelect = (genre: BrowseGenre) => {
    if (selectedGenre?.name === genre.name) {
      setSelectedGenre(null);
      setGenreResults([]);
      return;
    }
    setSelectedGenre(genre);
    fetchGenre(genre);
    setTimeout(() => {
      genreResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  return (
    <main className="pt-10 pb-24">

      {/* ── Search bar ── */}
      <div className="px-6 space-y-6 mb-8">
        <h1 className="text-3xl font-headline font-bold">Search</h1>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search movies, shows, people…"
            className="pl-12 pr-12 bg-white/5 border-white/10 h-14 rounded-2xl text-base focus-visible:ring-primary/50"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ── Search results ── */}
      {isSearching ? (
        <div className="px-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {searchLoading
                ? 'Searching…'
                : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for `}
              {!searchLoading && (
                <span className="text-foreground font-bold">&quot;{searchTerm}&quot;</span>
              )}
            </p>
            {searchLoading && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
          </div>
          {searchLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-10">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                  <div className="h-4 w-3/4 rounded bg-white/5 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-white/5 animate-pulse" />
                </div>
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-10">
              {searchResults.map(m => <MovieCard key={m.id} movie={m} className="w-full" />)}
            </div>
          ) : (
            <EmptyState message={`No titles found for "${searchTerm}". Try a different search.`} />
          )}
        </div>

      ) : (
        /* ── Browse sections ── */
        <div className="space-y-10">

          {/* Top 100 Movies by Rating */}
          <section className="space-y-4">
            <SectionHeader
              title="Top 100 Movies by Rating"
              icon={<Star className="h-5 w-5 text-accent fill-current" />}
              seeAllHref="/see-all/top-rated-movies"
            />
            {browseLoading || !browseData ? (
              <CardRowSkeleton />
            ) : browseData.topMovies.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {browseData.topMovies.map(m => <MovieCard key={m.id} movie={m} />)}
              </div>
            ) : (
              <EmptyState message="No movies available." />
            )}
          </section>

          {/* Top 100 TV Shows by Rating */}
          <section className="space-y-4">
            <SectionHeader
              title="Top 100 TV Shows by Rating"
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
              seeAllHref="/see-all/top-rated-shows"
            />
            {browseLoading || !browseData ? (
              <CardRowSkeleton />
            ) : browseData.topShows.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {browseData.topShows.map(m => <MovieCard key={m.id} movie={m} />)}
              </div>
            ) : (
              <EmptyState message="No shows available." />
            )}
          </section>

          {/* Coming Soon */}
          <section className="space-y-4">
            <SectionHeader
              title="Coming Soon"
              icon={<Calendar className="h-5 w-5 text-primary" />}
              seeAllHref="/see-all/coming-soon"
            />
            {browseLoading || !browseData ? (
              <CardRowSkeleton />
            ) : browseData.upcoming.length > 0 ? (
              <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                {browseData.upcoming.map(m => <UpcomingCard key={m.id} movie={m} />)}
              </div>
            ) : (
              <EmptyState message="No upcoming titles." />
            )}
          </section>

          {/* Browse by Genre */}
          <section className="space-y-5">
            <div className="flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h2 className="text-xl font-headline font-bold flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  Browse by Genre
                </h2>
              </div>
              {selectedGenre && (
                <button
                  onClick={() => { setSelectedGenre(null); setGenreResults([]); }}
                  className="text-xs text-muted-foreground border border-white/10 rounded-full px-3 py-1 hover:bg-white/5 flex items-center gap-1 transition-colors"
                >
                  Clear <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* 4-column genre grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 px-6">
              {BROWSE_GENRES.map((genre, i) => {
                const isSelected = selectedGenre?.name === genre.name;
                return (
                  <button
                    key={genre.name}
                    onClick={() => handleGenreSelect(genre)}
                    className={[
                      'relative flex flex-col items-center justify-center gap-1.5',
                      'py-4 rounded-2xl border font-headline font-bold text-[11px] uppercase tracking-wide',
                      'transition-all duration-200 hover:scale-[1.04] active:scale-95',
                      GENRE_COLORS[i],
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.04]'
                        : '',
                    ].join(' ')}
                  >
                    <span className="text-xl leading-none">{genre.emoji}</span>
                    {genre.name}
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Genre results — shown below the grid when a genre is selected */}
            <div ref={genreResultsRef}>
              {selectedGenre && (
                <div className="space-y-1 pt-2">
                  <div className="px-6 pb-1">
                    <h3 className="text-base font-headline font-bold">
                      {selectedGenre.emoji} {selectedGenre.name}
                      {selectedGenre.tvId === 0 && (
                        <span className="ml-2 text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
                          (movies only)
                        </span>
                      )}
                    </h3>
                  </div>
                  <GenreResults
                    genre={selectedGenre}
                    results={genreResults}
                    loading={genreLoading}
                  />
                </div>
              )}
            </div>
          </section>

        </div>
      )}
    </main>
  );
}
