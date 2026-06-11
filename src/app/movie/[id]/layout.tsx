import type { Metadata } from 'next';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE = 'https://api.themoviedb.org/3';

async function fetchMovieMeta(id: string) {
  // App ids look like "tmdb-123" (movie) or "tmdb-tv-456" (show)
  const isShow = id.startsWith('tmdb-tv-');
  const numId = id.replace('tmdb-tv-', '').replace('tmdb-', '');
  const endpoints = isShow ? ['tv', 'movie'] : ['movie', 'tv'];
  for (const kind of endpoints) {
    try {
      const res = await fetch(`${BASE}/${kind}/${numId}?api_key=${TMDB_API_KEY}&language=en-US`, {
        next: { revalidate: 86400 },
      });
      if (res.ok) {
        const d = await res.json();
        return {
          title: d.title ?? d.name,
          year: (d.release_date ?? d.first_air_date)?.slice(0, 4),
          overview: d.overview,
          poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
        };
      }
    } catch { /* ignore */ }
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchMovieMeta(id);
  if (!meta) return { title: 'Cinephilers' };

  const title = `${meta.title}${meta.year ? ` (${meta.year})` : ''} — Cinephilers`;
  const description = meta.overview
    ? meta.overview.slice(0, 155) + (meta.overview.length > 155 ? '…' : '')
    : `Track, rate, and review ${meta.title} on Cinephilers.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: meta.poster ? [{ url: meta.poster, width: 500, height: 750, alt: meta.title }] : [],
      url: `https://cinephilers.app/movie/${id}`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: meta.poster ? [meta.poster] : [],
    },
  };
}

export default function MovieLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
