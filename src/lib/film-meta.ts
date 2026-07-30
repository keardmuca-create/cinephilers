import { prisma } from './db';
import { MediaType } from '@/generated/prisma/client';
import type { ItemMeta } from '@/app/api/meta/[id]/route';

// Persist what a title IS, so the server can answer questions the database
// otherwise can't — someone's languages, decades, genres, directors or total
// hours watched. One row per title, shared by every user.
//
// Episodes are skipped: they'd bloat the table and inherit their show's genre
// and language anyway, reachable through the show id.
export async function saveFilmMeta(meta: ItemMeta): Promise<void> {
  if (meta.isEpisode) return;

  const data = {
    mediaType: (meta.type === 'show' ? 'SHOW' : 'MOVIE') as MediaType,
    title: meta.title,
    year: meta.year && meta.year !== '—' ? meta.year : null,
    releaseDate: meta.releaseDate || null,
    language: meta.language ?? null,
    genres: meta.genre ? meta.genre.split(',').map(g => g.trim()).filter(Boolean) : [],
    runtime: typeof meta.runtime === 'number' && meta.runtime > 0 ? meta.runtime : null,
    director: meta.director ?? null,
    topCast: meta.topCast ?? [],
    voteAverage: typeof meta.tmdbRating === 'number' ? meta.tmdbRating : null,
    episodeCount: typeof meta.totalEps === 'number' && meta.totalEps > 0 ? meta.totalEps : null,
    showStatus: meta.tmdbStatus ?? null,
    showType: meta.showType ?? null,
  };

  await prisma.filmMeta.upsert({
    where: { tmdbId: meta.id },
    create: { tmdbId: meta.id, ...data },
    update: data,
  });
}

// Fire-and-forget wrapper: filling the cache must never slow down or break the
// response the user is waiting on.
export function saveFilmMetaQuietly(meta: ItemMeta): void {
  saveFilmMeta(meta).catch(() => { /* best effort */ });
}
