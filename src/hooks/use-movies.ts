
import { useEffect, useState } from 'react';
import { Movie } from '@/lib/types';

interface PopularData {
  movies: Movie[];
  shows: Movie[];
  trending: Movie[];
}

export function usePopularMovies(fallback: PopularData) {
  const [data, setData] = useState<PopularData>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/movies/popular')
      .then(r => r.json())
      .then((json: PopularData & { error?: string }) => {
        if (!json.error) setData(json);
      })
      .catch(() => {/* keep fallback */})
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

export function useSearch(query: string, fallback: Movie[]) {
  const [results, setResults] = useState<Movie[]>(fallback);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(fallback);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/movies/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(r => r.json())
      .then((json: { results?: Movie[]; error?: string }) => {
        if (json.results) setResults(json.results);
        else setResults(fallback);
      })
      .catch(() => setResults(fallback))
      .finally(() => setLoading(false));
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { results, loading };
}
