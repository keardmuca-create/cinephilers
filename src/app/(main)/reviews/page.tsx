"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Star, Film } from 'lucide-react';
import { batchFetchMeta } from '@/lib/meta-batch';
import { MediaToggle } from '@/components/media-toggle';
import { SIDE_LABELS, type MediaSide } from '@/lib/media-type';
import { parseEpisodeId } from '@/lib/media-id';
import { cachedEpisodeLine, episodeLineFor } from '@/lib/episode-line';

interface UserReview {
  movieId: string;
  movieTitle: string;
  moviePoster: string;
  movieYear: string;
  content: string;
  rating: number;
  date: string;
  /** "S1·E2 · House of the Dragon" for a review of one episode. */
  episodeLine?: string;
}

// Which side of the pill a review sits on. The id says it with no metadata: an
// episode ends in -S1E2, a series starts with tmdb-tv-, and the rest are films.
function sideOfReview(id: string): MediaSide {
  if (parseEpisodeId(id)) return 'episodes';
  return id.startsWith('tmdb-tv-') ? 'shows' : 'movies';
}

// A cached episode title can still carry the old "S1E2 · " prefix.
const stripEpisodePrefix = (title: string) => title.replace(/^S\d+E\d+\s·\s/, '');

export default function ReviewsPage() {
  const router = useRouter();
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Server-safe default; the saved side is read after mount, as on /history.
  const [side, setSide] = useState<MediaSide>('movies');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('reviews-side');
      if (saved === 'movies' || saved === 'shows' || saved === 'episodes') setSide(saved);
    } catch { /* ignore */ }
  }, []);

  const changeSide = useCallback((next: MediaSide) => {
    setSide(next);
    try { localStorage.setItem('reviews-side', next); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const load = async () => {
      const found: UserReview[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)!;
          if (!k.startsWith('review-')) continue;
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const r = JSON.parse(raw) as UserReview;
            found.push({ ...r, movieTitle: stripEpisodePrefix(r.movieTitle ?? ''), episodeLine: cachedEpisodeLine(r.movieId) });
          } catch { /* ignore */ }
        }
        setReviews(found.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } catch { /* ignore */ }
      setLoaded(true);

      // Reviews synced from the DB on a new device have no title/poster — backfill from the meta API
      const missing = found.filter(r => !r.movieTitle || !r.moviePoster);
      if (missing.length === 0) return;
      const metaMap = await batchFetchMeta(missing.map(r => r.movieId));
      const patches = missing.flatMap(r => {
        const m = metaMap[r.movieId];
        if (!m?.title) return [];
        const patched = { ...r, movieTitle: m.title, moviePoster: m.poster ?? '', movieYear: m.year ?? r.movieYear };
        // Stored without the line, which is worked out on every read.
        try { localStorage.setItem(`review-${r.movieId}`, JSON.stringify({ ...patched, episodeLine: undefined })); } catch { /* ignore */ }
        return [{ ...patched, movieTitle: stripEpisodePrefix(m.title), episodeLine: episodeLineFor(r.movieId, m) }];
      });
      if (patches.length > 0) {
        setReviews(prev => prev.map(p => patches.find(f => f.movieId === p.movieId) ?? p));
      }
    };
    load();
    // Re-load once the login sync finishes writing DB reviews into localStorage
    window.addEventListener('cinephilers-db-restored', load);
    return () => window.removeEventListener('cinephilers-db-restored', load);
  }, []);

  // Split like every other list: the count sits in the pill, per side, instead of
  // one mixed total in the title.
  const counts = useMemo(() => {
    const c: Record<MediaSide, number> = { movies: 0, shows: 0, episodes: 0 };
    for (const r of reviews) c[sideOfReview(r.movieId)]++;
    return c;
  }, [reviews]);
  const shown = useMemo(() => reviews.filter(r => sideOfReview(r.movieId) === side), [reviews, side]);

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-headline font-bold">Your Reviews</h1>
      </div>

      <MediaToggle value={side} onChange={changeSide} counts={counts} sides={['movies', 'shows', 'episodes']} />

      {loaded && reviews.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">Your reviews will appear here.</p>
      )}
      {loaded && reviews.length > 0 && shown.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">No {SIDE_LABELS[side].toLowerCase()} reviewed yet.</p>
      )}

      <div className="space-y-3">
        {shown.map(r => (
          <Link key={r.movieId} href={`/movie/${r.movieId}`} className="group flex gap-4 p-4 rounded-2xl border border-border hover:bg-muted/40 transition-colors">
            <div className="w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-muted">
              {r.moviePoster ? (
                <img src={r.moviePoster} alt={r.movieTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-5 w-5 text-primary/60" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold font-headline line-clamp-1 group-hover:text-primary transition-colors">{r.movieTitle}</p>
                {r.rating > 0 && (
                  <div className="flex items-center gap-0.5 shrink-0 text-primary text-xs font-black">
                    <Star className="h-3 w-3" /> {r.rating}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-1">{r.episodeLine ?? r.movieYear} · {r.date}</p>
              <p className="text-xs text-foreground/80 italic leading-relaxed">&ldquo;{r.content}&rdquo;</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
