"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Play, Eye, Loader2 } from 'lucide-react';
import type { TvEpisode, TvSeason } from '@/lib/types';

interface NextUp { season: number; episode: TvEpisode }

// Whether an episode can actually be watched yet. TMDB's episode_count for a
// season that is still airing includes episodes that have not been broadcast, so
// counting alone would happily tell someone to go watch a programme that does not
// exist. No air date is treated as watchable — that is usually old or incomplete
// data rather than a future broadcast, and hiding a real episode is the worse error.
function hasAired(ep: TvEpisode): boolean {
  if (!ep.air_date) return true;
  const air = new Date(ep.air_date);
  if (isNaN(air.getTime())) return true;
  return air.getTime() <= Date.now();
}

export function UpNext({
  seasons,
  showTmdbId,
  showPoster,
  watchedEpisodes,
  onOpen,
  onMarkWatched,
}: {
  seasons: TvSeason[];
  showTmdbId: string;
  showPoster: string | null;
  watchedEpisodes: Set<string>;
  onOpen: (seasonNumber: number, ep: TvEpisode) => void;
  onMarkWatched: (seasonNumber: number, ep: TvEpisode) => void;
}) {
  const [next, setNext] = useState<NextUp | null>(null);
  const [marking, setMarking] = useState(false);

  // Only for a show already started. "Up next: episode one" on a series someone
  // has never touched is not a reminder, it is just the season list again.
  const started = watchedEpisodes.size > 0;

  useEffect(() => {
    if (!started) { setNext(null); return; }
    let cancelled = false;

    (async () => {
      const ordered = [...seasons].filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);

      for (const season of ordered) {
        const sn = season.season_number;
        // Cheap check first: if every slot in this season is ticked, no request is
        // needed to know the answer is not in here.
        let allWatched = true;
        for (let i = 1; i <= season.episode_count; i++) {
          if (!watchedEpisodes.has(`S${sn}E${i}`)) { allWatched = false; break; }
        }
        if (allWatched) continue;

        // Now the real list, because only it carries the air dates.
        let episodes: TvEpisode[] = [];
        try {
          const res = await fetch(`/api/tv/${showTmdbId}/season/${sn}`);
          if (!res.ok) continue;
          const data = await res.json() as { episodes?: TvEpisode[] };
          episodes = data.episodes ?? [];
        } catch { continue; }
        if (cancelled) return;

        const candidate = episodes
          .sort((a, b) => a.episode_number - b.episode_number)
          .find(ep => !watchedEpisodes.has(`S${sn}E${ep.episode_number}`) && hasAired(ep));

        if (candidate) { setNext({ season: sn, episode: candidate }); return; }
      }

      // Everything aired has been watched — caught up, so nothing to show.
      setNext(null);
    })();

    return () => { cancelled = true; };
  }, [seasons, showTmdbId, watchedEpisodes, started]);

  if (!next) return null;

  const { season, episode } = next;
  const still = episode.still_path
    ? `https://image.tmdb.org/t/p/w300${episode.still_path}`
    : showPoster;

  return (
    <section className="space-y-3">
      <h3 className="text-xl font-headline font-bold flex items-center gap-2">
        <Play className="h-5 w-5 text-primary fill-current" /> Up next
      </h3>

      <div className="flex gap-4 bg-primary/5 border border-primary/30 rounded-2xl p-3.5">
        <button
          onClick={() => onOpen(season, episode)}
          className="relative w-24 aspect-video shrink-0 rounded-xl overflow-hidden bg-muted"
          aria-label={`Open S${season}E${episode.episode_number}`}
        >
          {still
            ? <Image src={still} alt={episode.name} fill className="object-cover" sizes="96px" />
            : <span className="flex h-full w-full items-center justify-center"><Play className="h-6 w-6 text-primary/60" /></span>
          }
        </button>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <button onClick={() => onOpen(season, episode)} className="text-left">
            <p className="text-xs font-bold text-primary">S{season}E{episode.episode_number}</p>
            <p className="font-bold font-headline leading-snug line-clamp-2">{episode.name}</p>
          </button>
          <button
            onClick={async () => { setMarking(true); try { await onMarkWatched(season, episode); } finally { setMarking(false); } }}
            disabled={marking}
            className="mt-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors w-fit"
          >
            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            Mark watched
          </button>
        </div>
      </div>
    </section>
  );
}
