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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Genre {
  id: number;
  name: string;
}

interface BrowseData {
  topMovies: Movie[];
  topShows: Movie[];
  upcoming: Movie[];
  genres: Genre[];
}

// ─── Genre color palette (cycles deterministically by index) ─────────────────

const GENRE_COLORS = [
  'bg-red-500/20 text-red-300 border-red-500/20 hover:bg-red-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/20 hover:bg-orange-500/30',
  'bg-amber-500/20 text-amber-300 border-amber-500/20 hover:bg-amber-500/30',
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/20 hover:bg-yellow-500/30',
  'bg-lime-500/20 text-lime-300 border-lime-500/20 hover:bg-lime-500/30',
  'bg-green-500/20 text-green-300 border-green-500/20 hover:bg-green-500/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/30',
  'bg-teal-500/20 text-teal-300 border-teal-500/20 hover:bg-teal-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/20 hover:bg-cyan-500/30',
  'bg-sky-500/20 text-sky-300 border-sky-500/20 hover:bg-sky-500/30',
  'bg-blue-500/20 text-blue-300 border-blue-500/20 hover:bg-blue-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/20 hover:bg-indigo-500/30',
  'bg-violet-500/20 text-violet-300 border-violet-500/20 hover:bg-violet-500/30',
  'bg-purple-500/20 text-purple-300 border-purple-500/20 hover:bg-purple-500/30',
  'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/20 hover:bg-fuchsia-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/20 hover:bg-pink-500/30',
  'bg-rose-500/20 text-rose-300 border-rose-500/20 hover:bg-rose-500/30',
  'bg-zinc-600/30 text-zinc-300 border-zinc-500/30 hover:bg-zinc-600/50',
];

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

// ─── Horizontal card row skeleton ─────────────────────────────────────────────

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

// ─── Genre tile skeleton ──────────────────────────────────────────────────────

function GenreGridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2.5 px-6">
      {Array(12).fill(0).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-8">
      <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Film className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground font-medium">{message}</p>
    </div>
  );
}

// ─── Coming Soon card (shows release date badge) ─────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [browseData, setBrowseData] = useState<BrowseData | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);

  // Genre state
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [genreType, setGenreType] = useState<'movie' | 'tv'>('movie');
  const [genreResults, setGenreResults] = useState<Movie[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const genreResultsRef = useRef<HTMLDivElement>(null);

  const { results: searchResults, loading: searchLoading } = useSearch(searchTerm, []);
  const isSearching = searchTerm.trim().length > 0;

  // ── Fetch all browse data once ──
  useEffect(() => {
    setBrowseLoading(true);
    fetch('/api/discover/browse')
      .then(r => r.json())
      .then((data: BrowseData & { error?: string }) => {
        if (!data.error) setBrowseData(data);
      })
      .catch(() => {/* keep null */})
      .finally(() => setBrowseLoading(false));
  }, []);

  // ── Fetch genre results (lazy, on demand) ──
  const fetchGenreResults = useCallback((genreId: number, type: 'movie' | 'tv') => {
    setGenreLoading(true);
    setGenreResults([]);
    fetch(`/api/discover/genre?id=${genreId}&type=${type}&count=25`)
      .then(r => r.json())
      .then((data: { items?: Movie[]; error?: string }) => {
        if (data.items) setGenreResults(data.items);
      })
      .catch(() => {/* keep empty */})
      .finally(() => setGenreLoading(false));
  }, []);

  const handleGenreSelect = (genre: Genre) => {
    if (selectedGenre?.id === genre.id) {
      setSelectedGenre(null);
      setGenreResults([]);
      return;
    }
    setSelectedGenre(genre);
    setGenreType('movie');
    fetchGenreResults(genre.id, 'movie');
    setTimeout(() => {
      genreResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const handleTypeChange = (type: 'movie' | 'tv') => {
    if (type === genreType) return;
    setGenreType(type);
    if (selectedGenre) fetchGenreResults(selectedGenre.id, type);
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
              <EmptyState message="No movies available right now." />
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
              <EmptyState message="No shows available right now." />
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
              <EmptyState message="No upcoming titles available." />
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

            {/* Genre grid */}
            {browseLoading || !browseData ? (
              <GenreGridSkeleton />
            ) : (
              <div className="grid grid-cols-3 gap-2.5 px-6">
                {browseData.genres.map((genre, i) => {
                  const colorClass = GENRE_COLORS[i % GENRE_COLORS.length];
                  const isSelected = selectedGenre?.id === genre.id;
                  return (
                    <button
                      key={genre.id}
                      onClick={() => handleGenreSelect(genre)}
                      className={[
                        'relative py-5 rounded-2xl border text-center font-headline font-bold text-xs',
                        'transition-all duration-200 hover:scale-[1.03] active:scale-95',
                        colorClass,
                        isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.03]' : '',
                      ].join(' ')}
                    >
                      {genre.name}
                      {isSelected && (
                        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Genre results panel */}
            {selectedGenre && (
              <div ref={genreResultsRef} className="space-y-4 pt-2">

                {/* Type toggle + See All */}
                <div className="flex items-center justify-between px-6">
                  <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
                    <button
                      onClick={() => handleTypeChange('movie')}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                        genreType === 'movie'
                          ? 'bg-primary text-primary-foreground shadow'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <Film className="h-3 w-3" /> Movies
                    </button>
                    <button
                      onClick={() => handleTypeChange('tv')}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                        genreType === 'tv'
                          ? 'bg-primary text-primary-foreground shadow'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <Tv className="h-3 w-3" /> TV Shows
                    </button>
                  </div>
                  <Link
                    href={`/see-all/genre-${genreType}-${selectedGenre.id}?title=${encodeURIComponent(
                      `${selectedGenre.name} ${genreType === 'tv' ? 'TV Shows' : 'Movies'}`
                    )}`}
                    className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold flex items-center gap-1"
                  >
                    See All 100 <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>

                {/* Results */}
                {genreLoading ? (
                  <CardRowSkeleton />
                ) : genreResults.length > 0 ? (
                  <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                    {genreResults.map(m => <MovieCard key={m.id} movie={m} />)}
                  </div>
                ) : (
                  <EmptyState
                    message={`No ${genreType === 'tv' ? 'TV shows' : 'movies'} found in ${selectedGenre.name}.`}
                  />
                )}
              </div>
            )}
          </section>

        </div>
      )}
    </main>
  );
}
