"use client"

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import {
  X, Star, Clock, Calendar, Play, Users, Clapperboard, Images as ImagesIcon,
  ChevronLeft, ChevronRight, Check,
} from 'lucide-react';
import { EpisodeDetail, TvEpisode } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

// ─── User star rating ─────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n === value ? 0 : n)}
          className="p-0.5 transition-transform hover:scale-125 active:scale-95"
        >
          <Star
            className={`h-4 w-4 transition-colors ${
              n <= (hover || value) ? 'fill-accent text-accent' : 'text-white/20'
            }`}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm font-bold text-accent self-center">{value}/10</span>
      )}
    </div>
  );
}

// ─── Person chip ──────────────────────────────────────────────────────────────

function PersonChip({ name, role, image }: { name: string; role: string; image?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 shrink-0 w-20 text-center">
      <Avatar className="h-14 w-14 ring-2 ring-white/10">
        <AvatarImage
          src={image ?? `https://picsum.photos/seed/${name}/80/80`}
          alt={name}
          className="object-cover"
        />
      </Avatar>
      <p className="text-[10px] font-bold font-headline line-clamp-2 leading-snug">{name}</p>
      {role && <p className="text-[9px] text-muted-foreground line-clamp-1 -mt-1">{role}</p>}
    </div>
  );
}

// ─── Still lightbox ───────────────────────────────────────────────────────────

function StillLightbox({
  stills,
  initial,
  onClose,
}: {
  stills: string[];
  initial: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initial);
  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(stills.length - 1, i + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>
      {idx > 0 && (
        <button
          className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20"
          onClick={e => { e.stopPropagation(); prev(); }}
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {idx < stills.length - 1 && (
        <button
          className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20"
          onClick={e => { e.stopPropagation(); next(); }}
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <div
        className="relative max-w-4xl max-h-[85vh] w-full mx-8"
        onClick={e => e.stopPropagation()}
      >
        <Image
          src={stills[idx]}
          alt={`Still ${idx + 1}`}
          width={1280}
          height={720}
          className="w-full h-auto rounded-2xl object-contain"
        />
        <p className="text-center text-xs text-white/40 mt-2">{idx + 1} / {stills.length}</p>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function EpisodeModalSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="w-full aspect-video rounded-2xl" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="flex gap-3">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 shrink-0">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface EpisodeModalProps {
  showTmdbId: string;
  seasonNumber: number;
  episode: TvEpisode;
  showTitle: string;
  isWatched?: boolean;
  onToggleWatched?: () => void;
  onClose: () => void;
}

export function EpisodeModal({ showTmdbId, seasonNumber, episode, showTitle, isWatched = false, onToggleWatched, onClose }: EpisodeModalProps) {
  const [detail, setDetail] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [playTrailer, setPlayTrailer] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const ratingKey = `ep-rating-${showTmdbId}-S${seasonNumber}E${episode.episode_number}`;

  // Load persisted rating
  useEffect(() => {
    try {
      const v = localStorage.getItem(ratingKey);
      if (v) setUserRating(parseInt(v, 10));
    } catch { /* ignore */ }
  }, [ratingKey]);

  const handleRating = useCallback((v: number) => {
    setUserRating(v);
    try { localStorage.setItem(ratingKey, String(v)); } catch { /* ignore */ }
  }, [ratingKey]);

  // Fetch episode detail
  useEffect(() => {
    setLoading(true);
    setDetail(null);
    setPlayTrailer(false);
    fetch(`/api/tv/${showTmdbId}/season/${seasonNumber}/episode/${episode.episode_number}`)
      .then(r => r.json())
      .then((data: EpisodeDetail & { error?: string }) => {
        if (!data.error) setDetail(data);
      })
      .catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [showTmdbId, seasonNumber, episode.episode_number]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stillSrc = episode.still_path
    ? `https://image.tmdb.org/t/p/w780${episode.still_path}`
    : detail?.still_path
      ? `https://image.tmdb.org/t/p/w780${detail.still_path}`
      : `https://picsum.photos/seed/${episode.id}/780/440`;

  const firstTrailer = detail?.trailers?.[0];
  const allPeople = [
    ...(detail?.cast ?? []),
    ...(detail?.guestStars ?? []),
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[110] md:inset-0 md:flex md:items-center md:justify-center md:p-6">
        <div className="relative bg-background border border-white/10 rounded-t-[2rem] md:rounded-[2rem] w-full md:max-w-2xl max-h-[92vh] md:max-h-[90vh] overflow-y-auto shadow-2xl">

          {/* Action buttons — close + watched toggle */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {onToggleWatched && (
              <button
                onClick={onToggleWatched}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border backdrop-blur-sm transition-all ${
                  isWatched
                    ? 'bg-primary/90 border-primary text-white hover:bg-primary/70'
                    : 'bg-black/60 border-white/10 text-white hover:bg-white/10'
                }`}
              >
                <Check className={`h-3 w-3 ${isWatched ? '' : 'opacity-50'}`} />
                {isWatched ? 'Watched' : 'Mark Watched'}
              </button>
            )}
            <button
              className="p-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Still / Trailer hero */}
          <div className="relative aspect-video w-full overflow-hidden rounded-t-[2rem] md:rounded-t-[2rem] bg-black">
            {playTrailer && firstTrailer ? (
              <iframe
                src={`https://www.youtube.com/embed/${firstTrailer.key}?autoplay=1&rel=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                <Image
                  src={stillSrc}
                  alt={episode.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 672px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                {firstTrailer && !loading && (
                  <button
                    className="absolute inset-0 flex items-center justify-center group"
                    onClick={() => setPlayTrailer(true)}
                  >
                    <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl group-hover:bg-primary group-hover:scale-110 transition-all">
                      <Play className="h-6 w-6 fill-current ml-0.5" />
                    </div>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="p-6 space-y-6">
            {/* Episode label + title */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary border border-primary/30 rounded-full px-2.5 py-0.5">
                  S{seasonNumber} · E{episode.episode_number}
                </span>
                <span className="text-[10px] text-muted-foreground font-bold truncate max-w-[200px]">
                  {showTitle}
                </span>
              </div>
              <h2 className="text-xl font-headline font-bold leading-snug">{episode.name}</h2>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
                {episode.air_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(episode.air_date).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                    })}
                  </span>
                )}
                {episode.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {episode.runtime} min
                  </span>
                )}
                {episode.vote_average > 0 && (
                  <span className="flex items-center gap-1 text-accent">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    {episode.vote_average.toFixed(1)}
                    {detail?.vote_count ? (
                      <span className="text-muted-foreground font-normal ml-0.5">
                        ({detail.vote_count.toLocaleString()} votes)
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
            </div>

            {/* Overview */}
            {episode.overview && (
              <p className="text-sm text-gray-300 leading-relaxed">{episode.overview}</p>
            )}

            {/* User rating */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Rating</p>
              <StarRating value={userRating} onChange={handleRating} />
            </div>

            {loading ? (
              <EpisodeModalSkeleton />
            ) : detail ? (
              <>
                {/* Additional trailers list */}
                {detail.trailers.length > 1 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Play className="h-3.5 w-3.5 text-primary" /> Clips & Trailers
                    </p>
                    <div className="space-y-2">
                      {detail.trailers.map(t => (
                        <button
                          key={t.key}
                          onClick={() => { setPlayTrailer(false); setTimeout(() => { setPlayTrailer(true); }, 0); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left"
                        >
                          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <Play className="h-3.5 w-3.5 fill-current text-primary ml-0.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{t.name}</p>
                            <p className="text-[10px] text-muted-foreground">{t.type}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cast & guest stars */}
                {allPeople.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {detail.guestStars.length > 0 ? 'Cast & Guest Stars' : 'Cast'}
                    </p>
                    {detail.guestStars.length > 0 && (
                      <p className="text-[10px] text-muted-foreground -mt-1">
                        Guest stars shown with ★
                      </p>
                    )}
                    <div className="flex gap-4 overflow-x-auto pb-1 no-scrollbar">
                      {detail.cast.map(a => (
                        <PersonChip key={a.id} name={a.name} role={a.role} image={a.profileImage} />
                      ))}
                      {detail.guestStars.map(a => (
                        <div key={a.id} className="relative">
                          <PersonChip name={a.name} role={a.role} image={a.profileImage} />
                          <span className="absolute -top-0.5 -right-0.5 text-[8px] text-accent">★</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crew */}
                {detail.crew.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <Clapperboard className="h-3.5 w-3.5 text-primary" /> Crew
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {detail.crew.map((c, i) => (
                        <div key={i} className="bg-white/5 rounded-xl p-3 border border-white/5">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{c.job}</p>
                          <p className="text-xs font-bold font-headline mt-0.5">{c.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Episode stills */}
                {detail.stills.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      <ImagesIcon className="h-3.5 w-3.5 text-primary" /> Photos
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {detail.stills.map((src, i) => (
                        <button
                          key={i}
                          className="relative aspect-video rounded-xl overflow-hidden group"
                          onClick={() => setLightboxIdx(i)}
                        >
                          <Image
                            src={src}
                            alt={`Still ${i + 1}`}
                            fill
                            className="object-cover transition-transform group-hover:scale-105"
                            sizes="200px"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {/* Bottom padding */}
            <div className="h-4" />
          </div>
        </div>
      </div>

      {/* Stills lightbox */}
      {lightboxIdx !== null && detail?.stills && (
        <StillLightbox
          stills={detail.stills}
          initial={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </>
  );
}
