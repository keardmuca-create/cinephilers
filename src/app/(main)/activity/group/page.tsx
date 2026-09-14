"use client"

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Film, Star } from 'lucide-react';
import type { ItemMeta } from '@/app/api/meta/[id]/route';
import type { GroupEntry } from '@/app/api/feed/group/route';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { batchFetchMeta } from '@/lib/meta-batch';
import { episodeLineFor } from '@/lib/episode-line';
import { countSides, sidesLabel, sideOfTitle, type FeedSide } from '@/lib/feed-groups';
import { MediaToggle } from '@/components/media-toggle';
import { CommunityStar } from '@/components/community-star';
import { SpoilerWrap } from '@/components/spoiler-wrap';

// The page a group card in the activity feed opens: every title in someone's
// watchlist burst, or every episode of one show they watched that day. The card
// shows six posters and a count; this is the rest of it.

interface GroupData {
  owner: { username: string; displayName: string | null };
  kind: 'watchlist' | 'episodes';
  day: string;
  show: string | null;
  entries: GroupEntry[];
}

const SIDES: FeedSide[] = ['movies', 'shows', 'episodes'];

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function GroupRow({ entry, meta }: { entry: GroupEntry; meta: ItemMeta | undefined }) {
  // An episode names its show where a movie or a series gives its year.
  const episodeLine = episodeLineFor(entry.tmdbId, meta);
  const href = `/movie/${entry.tmdbId}`;
  return (
    <div className="flex gap-4 py-3 border-b border-border last:border-0">
      <Link href={href} className="relative w-20 shrink-0 self-start rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
        {meta?.poster
          ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="80px" />
          : <div className="w-full h-full flex items-center justify-center"><Film className="h-5 w-5 text-primary/60" /></div>}
      </Link>
      <div className="flex-1 min-w-0 space-y-1 py-0.5">
        <Link href={href} className="block group">
          {meta
            ? <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-2">{meta.title.replace(/^S\d+E\d+\s·\s/, '')}</p>
            : <div className="h-4 bg-muted rounded-full w-2/3 animate-pulse" />}
          {episodeLine
            ? <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{episodeLine}</p>
            : meta?.year && <p className="text-xs text-muted-foreground mt-1">{meta.year}</p>}
        </Link>
        <div className="flex items-center gap-3 pt-0.5">
          {meta && <CommunityStar id={entry.tmdbId} tmdbRating={meta.tmdbRating} />}
          {entry.rating !== undefined && (
            <span className="flex items-center gap-1 text-sm font-bold text-primary"><Star className="h-3.5 w-3.5" />{entry.rating}</span>
          )}
        </div>
        {/* Their review of this episode, right under their score — the binge card
            only counts reviews, so this is where they are read. Its own tap: it
            opens the episode's reviews at this one, while the poster and title open
            the episode. Revealing a spoiler does not navigate. */}
        {entry.review && (
          <a href={`/movie/${entry.tmdbId}/reviews#review-${entry.review.id}`} className="block pt-1 hover:opacity-80 transition-opacity">
            <SpoilerWrap isSpoiler={entry.review.containsSpoiler}>
              <p className="text-xs text-muted-foreground italic line-clamp-3 leading-relaxed">&ldquo;{entry.review.body}&rdquo;</p>
            </SpoilerWrap>
          </a>
        )}
      </div>
    </div>
  );
}

function GroupPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();

  const [data, setData] = useState<GroupData | null>(null);
  const [problem, setProblem] = useState<'private' | 'missing' | 'failed' | null>(null);
  const [meta, setMeta] = useState<Record<string, ItemMeta>>({});
  const [side, setSide] = useState<FeedSide>('movies');

  useEffect(() => {
    let live = true;
    setData(null);
    setProblem(null);
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/feed/group?${query}`);
        if (!live) return;
        if (res.status === 403) { setProblem('private'); return; }
        if (!res.ok) { setProblem(res.status === 404 ? 'missing' : 'failed'); return; }
        const json = await res.json();
        const next = json.data as GroupData;
        // Open on the first side with anything on it, as the other split lists do.
        const counts = countSides(next.entries);
        setSide(SIDES.find(s => counts[s] > 0) ?? 'movies');
        setData(next);
      } catch {
        if (live) setProblem('failed');
      }
    })();
    return () => { live = false; };
  }, [query]);

  const counts = useMemo(() => countSides(data?.entries ?? []), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    // An episode group is episodes only, so it has no sides to split.
    return data.kind === 'episodes' ? data.entries : data.entries.filter(e => sideOfTitle(e.tmdbId, e.mediaType) === side);
  }, [data, side]);

  useEffect(() => {
    if (!data) return;
    const ids = shown.map(e => e.tmdbId);
    if (data.show) ids.push(data.show);
    const missing = ids.filter(id => !meta[id]);
    if (missing.length === 0) return;
    let live = true;
    batchFetchMeta(missing).then(found => { if (live) setMeta(prev => ({ ...prev, ...found })); });
    return () => { live = false; };
    // meta is left out on purpose: it only grows, and adding it would re-run for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shown]);

  const name = data ? (data.owner.displayName ?? data.owner.username) : '';
  const title = !data ? ''
    : data.kind === 'watchlist' ? 'Added to watchlist'
    : (data.show && meta[data.show]?.title) || 'Episodes watched';
  const n = data?.entries.length ?? 0;
  const subtitle = !data ? ''
    : data.kind === 'watchlist'
      ? `${name} · ${sidesLabel(counts)} · ${formatDay(data.day)}`
      : `${name} watched ${n} episode${n === 1 ? '' : 's'} · ${formatDay(data.day)}`;

  return (
    <main className="pb-32">
      {/* Back arrow — the installed PWA has no browser back button */}
      <div className="px-6 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <button onClick={() => router.back()} aria-label="Go back" className="rounded-full p-1 -ml-2 hover:bg-muted/60 transition-colors">
            <ChevronLeft className="h-6 w-6" />
          </button>
          {data
            ? <h1 className="text-2xl font-headline font-bold truncate">{title}</h1>
            : !problem && <div className="h-7 bg-muted rounded-full w-1/2 animate-pulse" />}
        </div>
        {data && <p className="text-muted-foreground text-sm">{subtitle}</p>}
      </div>

      {problem && (
        <p className="px-6 py-16 text-center text-sm text-muted-foreground">
          {problem === 'private' ? 'This account is private.'
            : problem === 'missing' ? 'This account no longer exists.'
            : "Couldn't load this. Check your connection and try again."}
        </p>
      )}

      {data?.kind === 'watchlist' && n > 0 && (
        <div className="px-6 pb-3">
          <MediaToggle value={side} onChange={setSide} counts={counts} sides={SIDES} />
        </div>
      )}

      {data && (
        shown.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            {n === 0 ? 'Nothing is left in this group.' : `No ${side} in this group.`}
          </p>
        ) : (
          <div className="px-6">
            {shown.map(entry => <GroupRow key={entry.tmdbId} entry={entry} meta={meta[entry.tmdbId]} />)}
          </div>
        )
      )}

      {!data && !problem && (
        <div className="px-6 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-4 py-3">
              <div className="w-20 aspect-[2/3] bg-muted rounded-lg animate-pulse shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function ActivityGroupPage() {
  return (
    <Suspense fallback={null}>
      <GroupPageInner />
    </Suspense>
  );
}
