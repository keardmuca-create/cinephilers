
"use client"

import React, { useState, useMemo } from 'react';
import { Movie } from '@/lib/mock-data';
import { MovieCard } from '@/components/movie-card';
import { ChevronRight, Search, X, Film, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearch, usePopularMovies } from '@/hooks/use-movies';

const GENRES = [
  { name: 'Action', color: 'bg-red-500/20 text-red-400 border-red-500/20' },
  { name: 'Comedy', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20' },
  { name: 'Drama', color: 'bg-blue-500/20 text-blue-400 border-blue-500/20' },
  { name: 'Sci-Fi', color: 'bg-purple-500/20 text-purple-400 border-purple-500/20' },
  { name: 'Horror', color: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  { name: 'Romance', color: 'bg-pink-500/20 text-pink-400 border-pink-500/20' },
  { name: 'Mystery', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20' },
  { name: 'Thriller', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
  { name: 'Animation', color: 'bg-orange-500/20 text-orange-400 border-orange-500/20' },
];

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
      <DialogContent className="max-w-3xl rounded-[2rem] h-[80vh] flex flex-col p-0 bg-background/95 backdrop-blur-xl border-white/10">
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
    <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
      <Film className="h-8 w-8 text-muted-foreground" />
    </div>
    <p className="text-muted-foreground font-medium">{message}</p>
  </div>
);

const EMPTY = { movies: [] as Movie[], shows: [] as Movie[], trending: [] as Movie[] };

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  const { data } = usePopularMovies(EMPTY);
  const { results: searchResults, loading: searchLoading } = useSearch(searchTerm, []);

  const genreFiltered = useMemo(() => {
    if (!selectedGenre) return [];
    return [...data.movies, ...data.shows].filter(m => m.genre.includes(selectedGenre));
  }, [selectedGenre, data]);

  const comingSoonList = data.movies.slice().reverse();
  const isSearching = searchTerm.trim().length > 0;

  return (
    <main className="pt-10 pb-20">
      <div className="px-6 space-y-6 mb-10">
        <h1 className="text-3xl font-headline font-bold">Search</h1>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search movies, shows, people..."
            className="pl-12 pr-12 bg-white/5 border-none h-14 rounded-2xl text-base focus-visible:ring-primary/50"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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

      {isSearching ? (
        <div className="px-6 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground font-medium">
              {searchLoading
                ? 'Searching…'
                : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for `}
              {!searchLoading && <span className="text-foreground font-bold">&quot;{searchTerm}&quot;</span>}
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
        <div className="space-y-10">
          <section className="px-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h3 className="text-xl font-headline font-bold">Browse by Genre</h3>
              </div>
              {selectedGenre && (
                <button
                  onClick={() => setSelectedGenre(null)}
                  className="text-xs text-muted-foreground border border-white/10 rounded-full px-3 py-1 hover:bg-white/5 flex items-center gap-1 transition-colors"
                >
                  Clear <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {GENRES.map((genre) => (
                <button
                  key={genre.name}
                  onClick={() => setSelectedGenre(genre.name === selectedGenre ? null : genre.name)}
                  className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 font-headline font-bold text-sm transition-all hover:scale-105 ${genre.color} border ${selectedGenre === genre.name ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : ''}`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </section>

          {selectedGenre ? (
            <div className="px-6 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-primary rounded-full" />
                <h2 className="text-2xl font-headline font-bold">
                  <span className="text-primary">{selectedGenre}</span>
                </h2>
              </div>
              {genreFiltered.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-10">
                  {genreFiltered.map(m => <MovieCard key={m.id} movie={m} className="w-full" />)}
                </div>
              ) : (
                <EmptyState message={`No titles found in ${selectedGenre}.`} />
              )}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <SectionHeader title="Top Movies" allItems={data.movies} />
                {data.movies.length > 0 ? (
                  <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                    {data.movies.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
                  </div>
                ) : (
                  <EmptyState message="Loading movies…" />
                )}
              </div>
              <div className="space-y-4">
                <SectionHeader title="Top Shows" allItems={data.shows} />
                {data.shows.length > 0 ? (
                  <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                    {data.shows.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
                  </div>
                ) : (
                  <EmptyState message="Loading shows…" />
                )}
              </div>
              <div className="space-y-4">
                <SectionHeader title="Coming Soon" allItems={comingSoonList} />
                {comingSoonList.length > 0 ? (
                  <div className="flex overflow-x-auto gap-4 px-6 pb-4 no-scrollbar">
                    {comingSoonList.slice(0, 10).map(movie => <MovieCard key={movie.id} movie={movie} />)}
                  </div>
                ) : (
                  <EmptyState message="Loading…" />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
