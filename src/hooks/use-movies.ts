
import { useEffect, useState } from 'react';
import { Movie } from '@/lib/types';

export interface PersonResult {
  id: string;
  name: string;
  profileImage: string;
  department: string;
}

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
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults(fallback);
      setPeople([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/movies/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(r => r.json())
      .then((json: { results?: Movie[]; people?: PersonResult[]; error?: string }) => {
        setResults(json.results ?? fallback);
        setPeople(json.people ?? []);
      })
      .catch(() => { setResults(fallback); setPeople([]); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return { results, people, loading };
}
