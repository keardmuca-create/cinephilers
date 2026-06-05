"use client"

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Movie, Actor, TvEpisode, TvSeason } from '@/lib/types';
import { EpisodeModal } from '@/components/episode-modal';
import { Button } from '@/components/ui/button';
import {
  Play, Check, Plus, Star, ChevronLeft, Share2, ListPlus, Quote,
  Info, Film, Calendar, Clock, Globe, Building2, Tv, ChevronDown, ChevronUp,
  DollarSign, Images, Clapperboard, PenLine, Eye, ChevronRight, User,
} from 'lucide-react';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { appendWatchLog, removeFromWatchLog, saveMovieRating, ensureSignupDate } from '@/lib/badges';
import { logActivity, removeActivity } from '@/lib/activity';
import { useAuth } from '@/contexts/auth-context';
import { AuthGateModal } from '@/components/auth-gate-modal';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <main className="min-h-screen pb-32 bg-background">
      <div className="relative w-full h-[50vh] bg-muted animate-pulse" />
      <div className="px-6 space-y-12 mt-8">
        <div className="flex gap-8">
          <Skeleton className="w-48 aspect-[2/3] rounded-[2rem] shrink-0" />
          <div className="flex-1 space-y-4 pt-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Person filmography ────────────────────────────────────────────────────────

interface PersonCreditItem {
  id: string;
  title: string;
  year: string;
  poster: string;
  rating: number;
  type: 'movie' | 'show';
  character?: string;
  job?: string;
}

interface PersonCreditSection {
  label: string;
  credits: PersonCreditItem[];
}

interface PersonFilmographyData {
  name: string;
  profileImage: string;
  sections: PersonCreditSection[];
  upcoming: PersonCreditSection[];
}

function CreditListItem({ credit, watched, userRating }: {
  credit: PersonCreditItem;
  watched: boolean;
  userRating?: number;
}) {
  return (
    <Link
      href={`/movie/${credit.id}`}
      className="group flex items-center gap-4 px-6 py-3.5 border-b border-border hover:bg-muted/40 transition-colors"
    >
      <div className="relative w-12 shrink-0 rounded-lg overflow-hidden shadow-sm bg-muted/60 border border-white/5" style={{ aspectRatio: '2/3' }}>
        {credit.poster ? (
          <Image src={credit.poster} alt={credit.title} fill className="object-cover transition-transform group-hover:scale-105" sizes="48px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold font-headline line-clamp-2 group-hover:text-primary transition-colors leading-snug mb-0.5">
          {credit.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1">{credit.year || 'TBA'}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {credit.rating > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-yellow-400 font-bold">★</span>
              <span className="text-xs font-bold">{credit.rating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-blue-400 font-bold">★</span>
              <span className="text-xs font-bold text-blue-400">{userRating}</span>
            </div>
          )}
          {watched && (
            <div className="flex items-center gap-1 text-blue-400">
              <Eye className="h-3 w-3" />
              <span className="text-xs font-semibold">Watched</span>
            </div>
          )}
        </div>
        {(credit.character || credit.job) && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {credit.character || credit.job}
          </p>
        )}
      </div>
    </Link>
  );
}

function FilmographySectionBlock({ section, upcomingSection, watchedMap, ratingsMap }: {
  section: PersonCreditSection;
  upcomingSection?: PersonCreditSection;
  watchedMap: Record<string, boolean>;
  ratingsMap: Record<string, number>;
}) {
  const hasReleased = section.credits.length > 0;
  const hasUpcoming = !!(upcomingSection && upcomingSection.credits.length > 0);
  const showToggle = hasReleased && hasUpcoming;
  const [tab, setTab] = useState<'released' | 'upcoming'>(hasReleased ? 'released' : 'upcoming');

  const activeCredits = tab === 'upcoming' && hasUpcoming ? upcomingSection!.credits : section.credits;
  const isUpcomingView = tab === 'upcoming' || (!hasReleased && hasUpcoming);

  const watchedCount = section.credits.filter(c => watchedMap[c.id]).length;
  const pct = section.credits.length > 0 ? Math.round((watchedCount / section.credits.length) * 100) : 0;

  return (
    <div>
      <div className="px-6 py-2.5 bg-muted/30 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1 h-4 rounded-full ${isUpcomingView ? 'bg-orange-400' : 'bg-primary'}`} />
          <span className="text-xs font-bold uppercase tracking-widest">{section.label}</span>
          <span className="text-xs text-muted-foreground">({activeCredits.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {!isUpcomingView && section.credits.length > 0 && (
            <div className="flex items-center gap-1">
              <Eye className="h-3 w-3 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">{pct}%</span>
            </div>
          )}
          {showToggle && (
            <div className="flex rounded-full overflow-hidden border border-border text-[10px] font-bold">
              <button
                onClick={() => setTab('released')}
                className={`px-2 py-0.5 transition-colors ${tab === 'released' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Released
              </button>
              <button
                onClick={() => setTab('upcoming')}
                className={`px-2 py-0.5 transition-colors ${tab === 'upcoming' ? 'bg-orange-400 text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Upcoming
              </button>
            </div>
          )}
        </div>
      </div>
      {activeCredits.map(credit => (
        <CreditListItem
          key={`${section.label}-${tab}-${credit.id}`}
          credit={credit}
          watched={!!watchedMap[credit.id]}
          userRating={ratingsMap[credit.id]}
        />
      ))}
    </div>
  );
}

function PersonFilmographyDialog({
  personId, personName, personRole, personImage, open, onClose,
}: {
  personId: string;
  personName: string;
  personRole: string;
  personImage?: string;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<PersonFilmographyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [watchedMap, setWatchedMap] = useState<Record<string, boolean>>({});
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !personId) return;
    setLoading(true);
    setData(null);
    fetch(`/api/person/${personId}`)
      .then(r => r.json())
      .then((json: PersonFilmographyData & { error?: string }) => {
        if (!json.error) {
          setData(json);
          const watched: Record<string, boolean> = {};
          const ratings: Record<string, number> = {};
          try {
            const allCredits = [...json.sections, ...(json.upcoming ?? [])].flatMap((s: PersonCreditSection) => s.credits);
            for (const c of allCredits) {
              if (localStorage.getItem(`watched-${c.id}`) === 'true') watched[c.id] = true;
              const r = localStorage.getItem(`movie-rating-${c.id}`);
              if (r) ratings[c.id] = parseInt(r, 10);
            }
          } catch { /* ignore */ }
          setWatchedMap(watched);
          setRatingsMap(ratings);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, personId]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-[2.5rem] h-[85vh] flex flex-col p-0 border-border">
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 rounded-2xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
              {personImage ? (
                <Image src={personImage} alt={personName} fill className="object-cover" />
              ) : (
                <User className="h-7 w-7 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-headline font-bold text-lg leading-tight">{personName}</h2>
              <p className="text-sm text-primary font-semibold truncate">{personRole}</p>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div>
              {(() => {
                const upcomingByLabel = new Map((data?.upcoming ?? []).map((s: PersonCreditSection) => [s.label, s]));
                const upcomingOnlySections = (data?.upcoming ?? []).filter((us: PersonCreditSection) => !(data?.sections ?? []).find(s => s.label === us.label));
                return (
                  <>
                    {(data?.sections ?? []).map(section => (
                      <FilmographySectionBlock
                        key={section.label}
                        section={section}
                        upcomingSection={upcomingByLabel.get(section.label)}
                        watchedMap={watchedMap}
                        ratingsMap={ratingsMap}
                      />
                    ))}
                    {upcomingOnlySections.map((upSection: PersonCreditSection) => (
                      <FilmographySectionBlock
                        key={`only-${upSection.label}`}
                        section={{ label: upSection.label, credits: [] }}
                        upcomingSection={upSection}
                        watchedMap={watchedMap}
                        ratingsMap={ratingsMap}
                      />
                    ))}
                    {data && data.sections.length === 0 && (data.upcoming ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-12">No credits found.</p>
                    )}
                  </>
                );
              })()}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="shrink-0 w-28 group cursor-pointer" onClick={() => setOpen(true)}>
        <div className="relative aspect-square rounded-2xl overflow-hidden mb-2 group-hover:ring-2 ring-primary ring-offset-2 ring-offset-background transition-all bg-muted flex items-center justify-center">
          {actor.profileImage ? (
            <Image src={actor.profileImage} alt={actor.name} fill className="object-cover" />
          ) : (
            <User className="h-10 w-10 text-muted-foreground/40" />
          )}
        </div>
        <h4 className="text-xs font-bold font-headline line-clamp-1">{actor.name}</h4>
        <p className="text-[10px] text-muted-foreground line-clamp-1">{actor.role}</p>
      </div>
      <PersonFilmographyDialog
        personId={actor.id}
        personName={actor.name}
        personRole={actor.role}
        personImage={actor.profileImage}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ─── Cast & Crew See All dialog ────────────────────────────────────────────────

function CastCrewSeeAllDialog({ movie }: { movie: Movie }) {
  const [listOpen, setListOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{
    id: string; name: string; role: string; image?: string;
  } | null>(null);

  const openPerson = (id: string, name: string, role: string, image?: string) => {
    setListOpen(false);
    setSelectedPerson({ id, name, role, image });
  };

  const crew = (movie.crew ?? []).filter(c => c.id);

  return (
    <>
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        <DialogTrigger asChild>
          <button className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold">
            See All
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-md rounded-[2.5rem] h-[80vh] flex flex-col p-0 border-border">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-headline text-xl">Cast & Crew</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="px-4 py-3">
              {movie.cast.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Cast</p>
                  <div className="space-y-0.5">
                    {movie.cast.map(actor => (
                      <button
                        key={actor.id}
                        onClick={() => openPerson(actor.id, actor.name, actor.role, actor.profileImage)}
                        className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                      >
                        <div className="relative h-10 w-10 rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                          {actor.profileImage ? (
                            <Image src={actor.profileImage} alt={actor.name} fill className="object-cover" />
                          ) : (
                            <User className="h-5 w-5 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{actor.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{actor.role}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {crew.length > 0 && (
                <div className="mt-4">
                  <Separator className="mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Crew</p>
                  <div className="space-y-0.5">
                    {crew.map(member => (
                      <button
                        key={`${member.id}-${member.job}`}
                        onClick={() => openPerson(member.id!, member.name, member.job)}
                        className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors text-left"
                      >
                        <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                          <Film className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{member.job}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {selectedPerson && (
        <PersonFilmographyDialog
          personId={selectedPerson.id}
          personName={selectedPerson.name}
          personRole={selectedPerson.role}
          personImage={selectedPerson.image}
          open
          onClose={() => setSelectedPerson(null)}
        />
      )}
    </>
  );
}

// ─── Trailer section ──────────────────────────────────────────────────────────

function TrailersSection({ trailers }: { trailers: NonNullable<Movie['trailers']> }) {
  const [active, setActive] = useState(0);
  if (trailers.length === 0) return null;

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-primary" /> Trailers & Clips
      </h3>
      <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl aspect-video w-full">
        <iframe
          key={trailers[active].key}
          src={`https://www.youtube.com/embed/${trailers[active].key}?rel=0`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={trailers[active].name}
        />
      </div>
    </section>
  );
}

// ─── Images gallery ───────────────────────────────────────────────────────────

function ImagesGallery({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
          <Images className="h-6 w-6 text-primary" /> Photos
        </h3>
        <Dialog>
          <DialogTrigger asChild>
            <button className="text-xs text-primary border border-primary/30 rounded-full px-3 py-1 hover:bg-primary/10 transition-colors font-semibold">
              See All {images.length}
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl rounded-[2rem] h-[85vh] flex flex-col p-0 border-white/10">
            <DialogHeader className="p-6 pb-2 shrink-0">
              <DialogTitle className="font-headline text-2xl">All Photos</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 px-6 pb-6">
              <div className="grid grid-cols-2 gap-3">
                {images.map((url, i) => (
                  <div key={i} className="relative aspect-video rounded-xl overflow-hidden">
                    <Image src={url} alt="" fill className="object-cover" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {images.slice(0, 6).map((url, i) => (
          <div key={i} className="relative aspect-video rounded-2xl overflow-hidden border border-white/5">
            <Image src={url} alt="" fill className="object-cover hover:scale-105 transition-transform duration-500" />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Release info ─────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function ReleaseInfo({ movie }: { movie: Movie }) {
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : `$${n.toLocaleString()}`;

  const rows: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [];

  if (movie.releaseDate) rows.push({ icon: Calendar, label: 'Release Date', value: new Date(movie.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) });
  if (movie.runtime) rows.push({ icon: Clock, label: 'Runtime', value: `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` });
  if (movie.episodeRuntime) rows.push({ icon: Clock, label: 'Episode Length', value: `${movie.episodeRuntime} min` });
  if (movie.status) rows.push({ icon: Info, label: 'Status', value: movie.status });
  if (movie.originalLanguage) rows.push({ icon: Globe, label: 'Language', value: movie.originalLanguage.toUpperCase() });
  if (movie.networks && movie.networks.length > 0) rows.push({ icon: Tv, label: 'Network', value: movie.networks.join(', ') });
  if (movie.budget) rows.push({ icon: DollarSign, label: 'Budget', value: fmt(movie.budget) });
  if (movie.revenue) rows.push({ icon: DollarSign, label: 'Box Office', value: fmt(movie.revenue) });
  if (movie.productionCompanies && movie.productionCompanies.length > 0) rows.push({ icon: Building2, label: 'Production', value: movie.productionCompanies.join(', ') });

  if (rows.length === 0) return null;

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Info className="h-6 w-6 text-primary" /> Release Info
      </h3>
      <div className="bg-white/5 rounded-3xl p-8 border border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-6">
        {rows.map(r => <InfoRow key={r.label} {...r} />)}
      </div>
    </section>
  );
}

// ─── Seasons & episodes ────────────────────────────────────────────────────────

function EpisodeRow({
  ep,
  isWatched,
  onToggleWatched,
  onClick,
}: {
  ep: TvEpisode;
  isWatched: boolean;
  onToggleWatched: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  const still = ep.still_path
    ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
    : `https://picsum.photos/seed/${ep.id}/300/170`;

  return (
    <div className={`flex gap-4 p-4 rounded-2xl border transition-colors ${isWatched ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
      {/* Still — opens modal */}
      <button className="relative aspect-video w-28 shrink-0 rounded-xl overflow-hidden group" onClick={onClick}>
        <Image src={still} alt={ep.name} fill className="object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="h-6 w-6 fill-current text-white" />
        </div>
      </button>

      {/* Info — opens modal */}
      <button className="flex-1 min-w-0 space-y-1 text-left" onClick={onClick}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-primary uppercase tracking-widest shrink-0">E{ep.episode_number}</span>
          <h5 className={`text-sm font-bold font-headline line-clamp-1 ${isWatched ? 'text-gray-400' : 'text-gray-900'}`}>{ep.name}</h5>
        </div>
        {ep.air_date && (
          <p className="text-[10px] text-gray-500 font-bold">{new Date(ep.air_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
        )}
        {ep.overview && <p className="text-xs text-gray-500 line-clamp-2">{ep.overview}</p>}
        <div className="flex items-center gap-3 pt-1">
          {ep.vote_average > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-gray-900">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {ep.vote_average.toFixed(1)}
            </span>
          )}
          {ep.runtime && <span className="text-[10px] text-gray-500 font-bold">{ep.runtime} min</span>}
        </div>
      </button>

      {/* Watched checkbox */}
      <button
        onClick={onToggleWatched}
        title={isWatched ? 'Remove from watched' : 'Mark as watched'}
        className={`shrink-0 self-center h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all ${
          isWatched
            ? 'bg-primary border-primary text-white hover:bg-primary/80'
            : 'border-gray-300 bg-transparent hover:border-primary hover:bg-primary/5'
        }`}
      >
        {isWatched && <Check className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SeasonsSection({
  seasons,
  showTmdbId,
  watchedEpisodes,
  onToggleEpisodeWatched,
  onMarkSeasonWatched,
  onUnmarkSeasonWatched,
  onEpisodeClick,
}: {
  seasons: TvSeason[];
  showTmdbId: string;
  watchedEpisodes: Set<string>;
  onToggleEpisodeWatched: (seasonNumber: number, ep: TvEpisode) => void;
  onMarkSeasonWatched: (season: TvSeason, cachedEpisodes?: TvEpisode[]) => Promise<void>;
  onUnmarkSeasonWatched: (season: TvSeason) => void;
  onEpisodeClick: (ep: TvEpisode, seasonNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [cache, setCache] = useState<Record<number, TvEpisode[]>>({});
  const [expandLoading, setExpandLoading] = useState<number | null>(null);
  const [markLoading, setMarkLoading] = useState<number | null>(null);

  const toggle = async (n: number) => {
    if (expanded === n) { setExpanded(null); return; }
    if (cache[n]) { setExpanded(n); return; }
    setExpandLoading(n);
    try {
      const res = await fetch(`/api/tv/${showTmdbId}/season/${n}`);
      const data = await res.json() as { episodes?: TvEpisode[] };
      setCache(prev => ({ ...prev, [n]: data.episodes ?? [] }));
      setExpanded(n);
    } finally { setExpandLoading(null); }
  };

  const handleMarkSeason = async (e: React.MouseEvent, season: TvSeason) => {
    e.stopPropagation();
    setMarkLoading(season.season_number);
    await onMarkSeasonWatched(season, cache[season.season_number]);
    setMarkLoading(null);
  };

  const getProgress = (sn: number, total: number) => {
    let watched = 0;
    for (const k of watchedEpisodes) { if (k.startsWith(`S${sn}E`)) watched++; }
    return { watched, total };
  };

  return (
    <section className="space-y-6">
      <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
        <Tv className="h-6 w-6 text-primary" /> Seasons & Episodes
      </h3>
      <div className="space-y-3">
        {seasons.map(season => {
          const sn = season.season_number;
          const isOpen = expanded === sn;
          const posterSrc = season.poster_path
            ? `https://image.tmdb.org/t/p/w154${season.poster_path}`
            : `https://picsum.photos/seed/season-${season.id}/154/231`;
          const { watched, total } = getProgress(sn, season.episode_count);
          const allWatched = total > 0 && watched >= total;

          return (
            <div key={season.id} className="rounded-3xl border border-white/5 overflow-hidden">
              {/* Season header */}
              <div className="flex items-center gap-3 p-4 bg-white/5">
                {/* Expand area */}
                <button
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                  onClick={() => toggle(sn)}
                >
                  <div className="relative w-10 aspect-[2/3] rounded-lg overflow-hidden shrink-0">
                    <Image src={posterSrc} alt={season.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold font-headline text-sm">{season.name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <p className="text-xs text-muted-foreground font-bold">
                        {total} ep{season.air_date ? ` · ${season.air_date.slice(0, 4)}` : ''}
                      </p>
                      {watched > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${allWatched ? 'bg-primary/20 text-primary' : 'bg-white/10 text-muted-foreground'}`}>
                          {allWatched ? '✓ All watched' : `${watched} / ${total}`}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Mark / Unmark season */}
                {allWatched ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUnmarkSeasonWatched(season); }}
                    className="text-[10px] font-bold text-primary/60 hover:text-primary px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors shrink-0"
                  >
                    Unmark
                  </button>
                ) : (
                  <button
                    onClick={(e) => handleMarkSeason(e, season)}
                    disabled={markLoading === sn}
                    className="text-[10px] font-bold text-muted-foreground hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40"
                  >
                    {markLoading === sn
                      ? <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                      : 'Mark All'
                    }
                  </button>
                )}

                {/* Chevron */}
                <button onClick={() => toggle(sn)} className="text-muted-foreground hover:text-white transition-colors shrink-0">
                  {expandLoading === sn
                    ? <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    : isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />
                  }
                </button>
              </div>

              {/* Episodes */}
              {isOpen && cache[sn] && (
                <div className="p-4 space-y-2 bg-gray-50">
                  {season.overview && <p className="text-sm text-gray-500 italic pb-2">{season.overview}</p>}
                  {cache[sn].map(ep => (
                    <EpisodeRow
                      key={ep.id}
                      ep={ep}
                      isWatched={watchedEpisodes.has(`S${sn}E${ep.episode_number}`)}
                      onToggleWatched={(e) => { e.stopPropagation(); onToggleEpisodeWatched(sn, ep); }}
                      onClick={() => onEpisodeClick(ep, sn)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Lists helpers ────────────────────────────────────────────────────────────

interface UserList {
  id: string;
  title: string;
  isPrivate: boolean;
  createdAt: string;
  items: { movieId: string; title: string; poster: string; year: string; type: string }[];
}

function loadLists(): UserList[] {
  try { return JSON.parse(localStorage.getItem('user-lists') ?? '[]'); } catch { return []; }
}
function saveLists(lists: UserList[]) {
  try { localStorage.setItem('user-lists', JSON.stringify(lists)); } catch { /* ignore */ }
}

function AddToListButton({ movie }: { movie: Movie }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserList[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrivate, setNewPrivate] = useState(false);

  useEffect(() => { if (open) setLists(loadLists()); }, [open]);

  const addToList = (listId: string) => {
    const updated = lists.map(l => {
      if (l.id !== listId) return l;
      if (l.items.some(i => i.movieId === movie.id)) return l;
      return { ...l, items: [...l.items, { movieId: movie.id, title: movie.title, poster: movie.poster, year: movie.year, type: movie.type }] };
    });
    saveLists(updated);
    setLists(updated);
    toast({ title: 'Added to list' });
  };

  const createAndAdd = () => {
    if (!newTitle.trim()) return;
    const newList: UserList = { id: Date.now().toString(), title: newTitle.trim(), isPrivate: newPrivate, createdAt: new Date().toISOString(), items: [{ movieId: movie.id, title: movie.title, poster: movie.poster, year: movie.year, type: movie.type }] };
    const updated = [...lists, newList];
    saveLists(updated);
    setLists(updated);
    setCreateOpen(false);
    setNewTitle('');
    setNewPrivate(false);
    toast({ title: `Added to "${newList.title}"` });
  };

  const isInList = (listId: string) => lists.find(l => l.id === listId)?.items.some(i => i.movieId === movie.id) ?? false;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-14 px-8 rounded-2xl border-2 border-foreground bg-background text-foreground font-bold flex-1 md:flex-none text-base">
            <ListPlus className="h-5 w-5 mr-2" /> Add to List
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-3xl max-w-sm border-border">
          <DialogHeader><DialogTitle className="font-headline">Add to List</DialogTitle></DialogHeader>
          <div className="space-y-2 pt-2">
            {lists.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No lists yet. Create one below.</p>}
            {lists.map(l => (
              <button
                key={l.id}
                onClick={() => addToList(l.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${isInList(l.id) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.items.length} {l.items.length === 1 ? 'title' : 'titles'} · {l.isPrivate ? 'Private' : 'Public'}</p>
                </div>
                {isInList(l.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
            <Separator className="my-2" />
            <Button className="w-full h-11 rounded-xl" variant="outline" onClick={() => { setOpen(false); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Create New List
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-3xl max-w-sm border-border">
          <DialogHeader><DialogTitle className="font-headline">Create New List</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="List title…"
              className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setNewPrivate(p => !p)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${newPrivate ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'}`}
            >
              <span className="text-sm font-semibold">Private list</span>
              <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${newPrivate ? 'bg-primary' : 'bg-foreground/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${newPrivate ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" disabled={!newTitle.trim()} onClick={createAndAdd}>Create & Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Reviews section ──────────────────────────────────────────────────────────

interface UserReview { movieId: string; movieTitle: string; moviePoster: string; movieYear: string; content: string; rating: number; date: string; }

function ReviewsSection({ movie, writeOpen, setWriteOpen, myReview, setMyReview }: {
  movie: Movie;
  writeOpen: boolean;
  setWriteOpen: (v: boolean) => void;
  myReview: UserReview | null;
  setMyReview: (r: UserReview | null) => void;
}) {
  const [draftContent, setDraftContent] = useState('');
  const [draftRating, setDraftRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  // Sync draft when dialog opens
  useEffect(() => {
    if (writeOpen) {
      setDraftContent(myReview?.content ?? '');
      setDraftRating(myReview?.rating ?? 0);
    }
  }, [writeOpen, myReview]);

  const submitReview = () => {
    if (!draftContent.trim()) return;
    const review: UserReview = {
      movieId: movie.id,
      movieTitle: movie.title,
      moviePoster: movie.poster,
      movieYear: movie.year,
      content: draftContent.trim(),
      rating: draftRating,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    };
    try { localStorage.setItem(`review-${movie.id}`, JSON.stringify(review)); } catch { /* ignore */ }
    fetch('/api/reviews', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: movie.id, mediaType: movie.type === 'show' ? 'SHOW' : 'MOVIE', body: review.content, containsSpoiler: false }),
    }).catch(() => { /* background sync */ });
    setMyReview(review);
    setWriteOpen(false);
    toast({ title: 'Review saved' });
  };

  const allReviews = movie.reviews ?? [];

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-headline font-bold">Community Reviews</h3>
        {allReviews.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="link" className="text-primary font-bold px-0">See All</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl rounded-[2.5rem] h-[80vh] flex flex-col p-0 border-border">
              <DialogHeader className="px-8 pt-8 pb-4 border-b border-border shrink-0">
                <DialogTitle className="font-headline text-2xl">All Reviews</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 px-8 pb-8">
                <div className="space-y-6 pt-4">
                  {allReviews.map(r => (
                    <div key={r.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9"><AvatarImage src={r.userAvatar} /></Avatar>
                          <div>
                            <span className="text-sm font-bold font-headline block">{r.userName}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{r.date}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-500 px-3 py-1 rounded-full text-xs font-black">
                          <Star className="h-3 w-3 fill-current" /> {r.rating}
                        </div>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{r.content}&rdquo;</p>
                      <Separator />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* My review */}
      {myReview && (
        <div className="bg-primary/5 border border-primary/20 p-5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Your Review</span>
            {myReview.rating > 0 && (
              <div className="flex items-center gap-1 text-yellow-500 text-xs font-black">
                <Star className="h-3 w-3 fill-current" /> {myReview.rating}
              </div>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed italic">&ldquo;{myReview.content}&rdquo;</p>
          <p className="text-[10px] text-muted-foreground">{myReview.date}</p>
        </div>
      )}

      {/* Community preview */}
      {allReviews.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allReviews.slice(0, 2).map(r => (
            <div key={r.id} className="bg-muted/50 p-5 rounded-2xl border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8"><AvatarImage src={r.userAvatar} /></Avatar>
                  <div>
                    <span className="text-sm font-bold font-headline block">{r.userName}</span>
                    <span className="text-[10px] text-muted-foreground font-bold">{r.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-yellow-400/10 text-yellow-500 px-2.5 py-1 rounded-full text-xs font-black">
                  <Star className="h-3 w-3 fill-current" /> {r.rating}
                </div>
              </div>
              <p className="text-sm text-foreground line-clamp-3 italic leading-relaxed">&ldquo;{r.content}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {/* Write / edit review dialog */}
      <Dialog open={writeOpen} onOpenChange={setWriteOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle className="font-headline text-xl">{myReview ? 'Edit Your Review' : 'Write a Review'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Your Thoughts</p>
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                placeholder={`What did you think of ${movie.title}?`}
                className="w-full h-36 p-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setWriteOpen(false)}>Cancel</Button>
              <Button className="flex-1 rounded-xl" disabled={!draftContent.trim()} onClick={submitReview}>Save Review</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MovieDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [episodeModal, setEpisodeModal] = useState<{ ep: TvEpisode; seasonNumber: number } | null>(null);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());
  const [writeReviewOpen, setWriteReviewOpen] = useState(false);
  const [myReview, setMyReview] = useState<UserReview | null>(null);
  const [authGate, setAuthGate] = useState<string | null>(null);

  const { user: authUser } = useAuth();

  const syncDb = useCallback((method: string, path: string, body?: object) => {
    fetch(path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => { /* background sync — ignore errors */ });
  }, []);

  useEffect(() => {
    if (!id) return;
    ensureSignupDate();
    try {
      setIsWatched(localStorage.getItem(`watched-${id}`) === 'true');
      setIsInWatchlist(localStorage.getItem(`watchlist-${id}`) !== null);
      const saved = localStorage.getItem(`movie-rating-${id}`);
      const rev = localStorage.getItem(`review-${id}`);
      if (rev) setMyReview(JSON.parse(rev));
      if (saved) setUserRating(parseInt(saved, 10));
      // Load watched episodes — use index key for O(1) lookup instead of full scan
      const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
      const watched = new Set<string>(indexRaw ? JSON.parse(indexRaw) : []);
      setWatchedEpisodes(watched);
    } catch { /* ignore */ }
    fetch(`/api/movies/${id}`)
      .then(r => r.json())
      .then((data: Movie & { error?: string }) => {
        if (!data.error) {
          setMovie(data);
          // Cache metadata for profile/watchlist lookups
          try {
            localStorage.setItem(`meta-${data.id}`, JSON.stringify({
              title: data.title,
              poster: data.poster,
              backdrop: data.backdrop,
              year: data.year,
              genre: data.genre,
              language: data.originalLanguage,
              description: data.description,
              type: data.type,
              tmdbRating: data.rating,
            }));
          } catch { /* ignore */ }
          // Track recently viewed in localStorage
          try {
            const stored = localStorage.getItem('recently-viewed');
            const viewed: { id: string; title: string; poster: string; year: string; type: string }[] =
              stored ? JSON.parse(stored) : [];
            const entry = { id: data.id, title: data.title, poster: data.poster, year: data.year, type: data.type, rating: data.rating };
            const filtered = viewed.filter(v => v.id !== data.id);
            localStorage.setItem('recently-viewed', JSON.stringify([entry, ...filtered].slice(0, 100)));
          } catch { /* ignore */ }
        } else {
          setMovie(null);
        }
      })
      .catch(() => setMovie(null))
      .finally(() => setLoading(false));
  }, [id]);

  // ─── Episode watch helpers ─────────────────────────────────────────────────

  const epKey = (sn: number, epNum: number) => `S${sn}E${epNum}`;

  const toggleEpisodeWatched = useCallback((sn: number, ep: TvEpisode) => {
    const key   = epKey(sn, ep.episode_number);
    const lsKey = `watched-ep-${id}-${key}`;
    const logId = `${id}-${key}`;
    const nowWatched = !watchedEpisodes.has(key);

    setWatchedEpisodes(prev => {
      const next = new Set(prev);
      nowWatched ? next.add(key) : next.delete(key);
      return next;
    });

    if (nowWatched) {
      try {
        localStorage.setItem(lsKey, 'true');
        const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
        const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
        if (!index.includes(key)) localStorage.setItem(`watched-eps-index-${id}`, JSON.stringify([...index, key]));
      } catch { /* ignore */ }
      appendWatchLog({ id: logId, type: 'episode', genre: movie?.genre ?? '', language: movie?.originalLanguage ?? '' });
      toast({ title: `${ep.name} marked as watched` });
    } else {
      try {
        localStorage.removeItem(lsKey);
        const indexRaw = localStorage.getItem(`watched-eps-index-${id}`);
        const index: string[] = indexRaw ? JSON.parse(indexRaw) : [];
        localStorage.setItem(`watched-eps-index-${id}`, JSON.stringify(index.filter(k => k !== key)));
      } catch { /* ignore */ }
      removeFromWatchLog(logId, 'episode');
      toast({ title: `${ep.name} removed from watched` });
    }
  }, [id, watchedEpisodes, movie]);

  const markSeasonWatched = useCallback(async (season: TvSeason, cached?: TvEpisode[]) => {
    let episodes = cached;
    if (!episodes) {
      try {
        const res  = await fetch(`/api/tv/${id.replace('tmdb-tv-', '')}/season/${season.season_number}`);
        const data = await res.json() as { episodes?: TvEpisode[] };
        episodes   = data.episodes ?? [];
      } catch { return; }
    }
    setWatchedEpisodes(prev => {
      const next = new Set(prev);
      episodes!.forEach(ep => {
        const key   = epKey(season.season_number, ep.episode_number);
        const lsKey = `watched-ep-${id}-${key}`;
        if (!next.has(key)) {
          next.add(key);
          try { localStorage.setItem(lsKey, 'true'); } catch { /* ignore */ }
          appendWatchLog({ id: `${id}-${key}`, type: 'episode', genre: movie?.genre ?? '', language: movie?.originalLanguage ?? '' });
        }
      });
      return next;
    });
    toast({ title: `Season ${season.season_number} marked as watched` });
  }, [id, movie]);

  const unmarkSeasonWatched = useCallback((season: TvSeason) => {
    const snPrefix = `S${season.season_number}E`;
    const lsPrefix = `watched-ep-${id}-${snPrefix}`;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(lsPrefix)) toRemove.push(k);
      }
      toRemove.forEach(k => {
        localStorage.removeItem(k);
        removeFromWatchLog(`${id}-${k.slice(`watched-ep-${id}-`.length)}`, 'episode');
      });
    } catch { /* ignore */ }
    setWatchedEpisodes(prev => {
      const next = new Set(prev);
      for (const k of [...next]) { if (k.startsWith(snPrefix)) next.delete(k); }
      return next;
    });
    toast({ title: `Season ${season.season_number} unmarked` });
  }, [id]);

  if (loading) return <DetailSkeleton />;

  if (!movie) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 pb-32">
      <div className="h-20 w-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
        <Film className="h-10 w-10 text-muted-foreground" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-headline font-bold">Title not found</h1>
        <p className="text-muted-foreground">This movie or show could not be loaded.</p>
      </div>
      <Button variant="outline" className="rounded-full border-white/10" onClick={() => router.back()}>
        <ChevronLeft className="h-4 w-4 mr-2" /> Go Back
      </Button>
    </main>
  );

  const firstTrailer = movie.trailers?.[0];
  const showTmdbId = movie.id.replace('tmdb-tv-', '').replace('tmdb-', '');

  return (
    <main className="min-h-screen pb-32 bg-background">
      {/* Backdrop */}
      <section className="relative w-full h-[50vh] bg-black">
        {movie.backdrop && <Image src={movie.backdrop} alt={movie.title} fill className="object-cover opacity-60" priority />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

        <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-20">
          <Button variant="outline" size="icon" className="rounded-full bg-white text-black border-white/80 hover:bg-white/90" onClick={() => router.back()}>
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="outline" size="icon"
            className="rounded-full bg-white text-black border-white/80 hover:bg-white/90"
            onClick={() => { navigator.clipboard.writeText(window.location.href); toast({ title: 'Link copied!' }); }}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        </header>

        {/* Play trailer overlay */}
        {firstTrailer && (
          <Dialog>
            <DialogTrigger asChild>
              <div className="absolute inset-0 flex items-center justify-center cursor-pointer group">
                <div className="flex flex-col items-center gap-4 transition-transform active:scale-95">
                  <div className="h-20 w-20 rounded-full bg-white flex items-center justify-center shadow-2xl group-hover:bg-white/90 group-hover:scale-110 transition-all">
                    <Play className="h-10 w-10 fill-black text-black ml-1" />
                  </div>
                  <span className="text-sm font-bold tracking-widest uppercase text-white/80 group-hover:text-white">Watch Trailer</span>
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-3xl rounded-3xl p-2 border-white/10 bg-black">
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${firstTrailer.key}?autoplay=1&rel=0`}
                  className="w-full h-full rounded-2xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </section>

      <div className="px-6 space-y-12">
        {/* Poster & Overview */}
        <section className="flex flex-col md:flex-row gap-8 -mt-20 relative z-10">
          <div className="shrink-0 mx-auto md:mx-0">
            <div className="relative aspect-[2/3] w-48 md:w-64 rounded-[2rem] overflow-hidden shadow-2xl border-4 border-background ring-1 ring-white/10 bg-muted">
              {movie.poster ? (
                <Image src={movie.poster} alt={movie.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="h-20 w-20 text-muted-foreground/30" />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-end gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">{movie.type === 'show' ? 'TV Show' : 'Movie'}</Badge>
              <Badge variant="outline" className="text-[10px] border-white/10">{movie.genre}</Badge>
            </div>
            <h1 className="text-4xl md:text-5xl font-headline font-bold leading-tight">{movie.title}</h1>
            {movie.tagline && <p className="text-base text-primary italic font-medium">&ldquo;{movie.tagline}&rdquo;</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm font-bold text-muted-foreground">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-primary" />{movie.year}</span>
              {movie.runtime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
              {movie.episodeRuntime && <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" />{movie.episodeRuntime} min/ep</span>}
              {movie.director && <span className="flex items-center gap-1.5"><Film className="h-4 w-4 text-primary" />Dir. {movie.director}</span>}
            </div>
            <p className="text-foreground leading-relaxed font-medium text-base">{movie.description}</p>

            {/* Write a review bar */}
            <button
              onClick={() => { if (!authUser) { setAuthGate('write reviews'); return; } setWriteReviewOpen(true); }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl border-2 border-foreground/15 bg-muted/40 hover:border-foreground/30 hover:bg-muted/60 transition-colors text-left"
            >
              <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {myReview ? `Your review: "${myReview.content.slice(0, 50)}${myReview.content.length > 50 ? '…' : ''}"` : `Share your thoughts on ${movie.title}…`}
              </span>
            </button>
          </div>
        </section>

        {/* Action Buttons */}
        <section className="flex flex-wrap gap-4">
          <Button
            variant={isInWatchlist ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold flex-1 md:flex-none text-base transition-all ${isInWatchlist ? 'bg-primary border-primary' : 'border-2 border-foreground bg-background text-foreground'}`}
            onClick={() => {
              if (!authUser) { setAuthGate('add movies to your watchlist'); return; }
              const next = !isInWatchlist;
              setIsInWatchlist(next);
              try {
                if (next) {
                  localStorage.setItem(`watchlist-${id}`, JSON.stringify({
                    id: movie!.id,
                    title: movie!.title,
                    poster: movie!.poster,
                    backdrop: movie!.backdrop,
                    year: movie!.year,
                    genre: movie!.genre,
                    description: movie!.description,
                    type: movie!.type,
                    tmdbRating: movie!.rating,
                  }));
                } else {
                  localStorage.removeItem(`watchlist-${id}`);
                }
              } catch { /* ignore */ }
              const mediaType = movie!.type === 'show' ? 'SHOW' : 'MOVIE';
              if (next) {
                syncDb('POST', '/api/watchlist', { tmdbId: id, mediaType });
              } else {
                syncDb('DELETE', `/api/watchlist/${id}?mediaType=${mediaType}`);
              }
              if (next && movie) {
                logActivity({ action: 'watchlist', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
              } else {
                removeActivity('watchlist', id);
              }
              toast({ title: next ? 'Added to watchlist' : 'Removed from watchlist' });
            }}
          >
            {isInWatchlist ? <Check className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />}
            {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
          </Button>
          <Button
            variant={isWatched ? 'default' : 'outline'}
            className={`h-14 px-8 rounded-2xl font-bold flex-1 md:flex-none text-base transition-all ${isWatched ? 'bg-accent border-accent' : 'border-2 border-foreground bg-background text-foreground'}`}
            onClick={() => {
              if (!authUser) { setAuthGate('mark movies as watched'); return; }
              const next = !isWatched;
              setIsWatched(next);
              try {
                localStorage.setItem(`watched-${id}`, String(next));
                if (next && movie?.type === 'show') {
                  localStorage.setItem(`show-status-${id}`, 'completed');
                }
              } catch { /* ignore */ }
              const watchedMediaType = movie!.type === 'show' ? 'SHOW' : 'MOVIE';
              if (next) {
                syncDb('POST', '/api/watched', { tmdbId: id, mediaType: watchedMediaType });
              } else {
                syncDb('DELETE', `/api/watched/${id}?mediaType=${watchedMediaType}`);
              }
              if (next && movie) {
                appendWatchLog({
                  id,
                  type: movie.type === 'show' ? 'movie' : 'movie',
                  genre: movie.genre ?? '',
                  language: movie.originalLanguage ?? '',
                });
                logActivity({ action: 'watched', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year });
              } else {
                removeFromWatchLog(id, 'movie');
                removeActivity('watched', id);
              }
              toast({ title: next ? 'Marked as watched' : 'Removed from watched' });
            }}
          >
            {isWatched ? <Check className="h-5 w-5 mr-2" /> : <Play className="h-5 w-5 mr-2" />}
            {isWatched ? 'Watched' : 'Mark as Watched'}
          </Button>
          <AddToListButton movie={movie} />
        </section>

        {/* Ratings */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-muted p-8 rounded-[2.5rem] border border-border">
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">TMDB Rating</h3>
            <div className="flex items-center gap-4">
              <div className="text-5xl font-black font-headline text-foreground">{movie.rating.toFixed(1)}</div>
              <div className="space-y-1">
                <div className="flex gap-0.5">
                  {Array(5).fill(0).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 fill-current ${i < Math.floor(movie.rating / 2) ? 'fill-yellow-400 text-yellow-400' : 'text-foreground/20'}`} />
                  ))}
                </div>
                <div className="text-xs text-muted-foreground font-bold">{movie.votes.toLocaleString()} ratings</div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Rate This</h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                  <button key={i} onClick={() => { if (!authUser) { setAuthGate('rate movies'); return; } setUserRating(i); saveMovieRating(id, i); syncDb('POST', '/api/ratings', { tmdbId: id, mediaType: movie?.type === 'show' ? 'SHOW' : 'MOVIE', score: i }); if (movie) logActivity({ action: 'rated', contentId: id, contentTitle: movie.title, contentPoster: movie.poster, contentYear: movie.year, rating: i }); toast({ title: `You rated it ${i}/10!` }); window.dispatchEvent(new CustomEvent('cinephilers-rating-changed', { detail: { id, rating: i } })); }} className="transition-all hover:scale-125 active:scale-90 p-0.5">
                    <Star className={`h-5 w-5 transition-colors ${userRating >= i ? 'fill-yellow-400 text-yellow-400' : 'text-foreground/25 hover:text-foreground/50'}`} />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-foreground">{userRating > 0 ? `Your score: ${userRating}/10` : 'Select a star to rate'}</p>
                {userRating > 0 && (
                  <button
                    onClick={() => {
                      setUserRating(0);
                      try { localStorage.removeItem(`movie-rating-${id}`); } catch { /* ignore */ }
                      syncDb('DELETE', `/api/ratings/${id}?mediaType=${movie?.type === 'show' ? 'SHOW' : 'MOVIE'}`);
                      removeActivity('rated', id);
                      toast({ title: 'Rating removed' });
                      window.dispatchEvent(new CustomEvent('cinephilers-rating-changed', { detail: { id, rating: null } }));
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Trailers */}
        {movie.trailers && movie.trailers.length > 0 && (
          <TrailersSection trailers={movie.trailers} />
        )}

        {/* Cast & Crew */}
        {(movie.cast.length > 0 || (movie.crew && movie.crew.length > 0)) && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-headline font-bold">Cast & Crew</h3>
              <CastCrewSeeAllDialog movie={movie} />
            </div>
            <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-6">
              {/* Key crew */}
              {movie.crew && movie.crew.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-4">
                  {movie.director && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Director</p>
                      <p className="text-sm font-bold font-headline">{movie.director}</p>
                    </div>
                  )}
                  {movie.crew.filter(c => c.job !== 'Director').slice(0, 5).map(c => (
                    <div key={`${c.name}-${c.job}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{c.job}</p>
                      <p className="text-sm font-bold font-headline">{c.name}</p>
                    </div>
                  ))}
                </div>
              )}
              {movie.director && (!movie.crew || movie.crew.length === 0) && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Director</p>
                  <p className="text-xl font-bold font-headline">{movie.director}</p>
                </div>
              )}
              <Separator className="bg-white/5" />
              {/* Cast */}
              {movie.cast.length > 0 && (
                <ScrollArea className="w-full">
                  <div className="flex gap-5 pb-4">
                    {movie.cast.map(actor => <PersonCard key={actor.id} actor={actor} />)}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              )}
            </div>
          </section>
        )}

        {/* Images */}
        {movie.images && <ImagesGallery images={movie.images} />}

        {/* Release Info */}
        <ReleaseInfo movie={movie} />

        {/* Seasons & Episodes (TV only) */}
        {movie.type === 'show' && movie.seasons && movie.seasons.length > 0 && (
          <SeasonsSection
            seasons={movie.seasons}
            showTmdbId={showTmdbId}
            watchedEpisodes={watchedEpisodes}
            onToggleEpisodeWatched={toggleEpisodeWatched}
            onMarkSeasonWatched={markSeasonWatched}
            onUnmarkSeasonWatched={unmarkSeasonWatched}
            onEpisodeClick={(ep, seasonNumber) => setEpisodeModal({ ep, seasonNumber })}
          />
        )}

        {/* Reviews */}
        <ReviewsSection movie={movie} writeOpen={writeReviewOpen} setWriteOpen={setWriteReviewOpen} myReview={myReview} setMyReview={setMyReview} />

        {/* Quotes (kept for any future data) */}
        {movie.quotes.length > 0 && (
          <section className="space-y-6">
            <h3 className="text-2xl font-headline font-bold flex items-center gap-3">
              <Quote className="h-6 w-6 text-primary" /> Iconic Quotes
            </h3>
            <div className="space-y-4">
              {movie.quotes.map((q, i) => (
                <div key={i} className="p-6 bg-white/5 rounded-3xl border-l-4 border-primary italic text-base text-gray-300 shadow-lg">{q}</div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <div className="relative max-w-5xl w-full aspect-video rounded-2xl overflow-hidden">
            <Image src={lightboxImg} alt="" fill className="object-contain" />
          </div>
        </div>
      )}

      {/* Episode detail modal */}
      {episodeModal && (
        <EpisodeModal
          showTmdbId={showTmdbId}
          seasonNumber={episodeModal.seasonNumber}
          episode={episodeModal.ep}
          showTitle={movie.title}
          isWatched={watchedEpisodes.has(epKey(episodeModal.seasonNumber, episodeModal.ep.episode_number))}
          onToggleWatched={() => toggleEpisodeWatched(episodeModal.seasonNumber, episodeModal.ep)}
          onClose={() => setEpisodeModal(null)}
        />
      )}

      <AuthGateModal
        open={authGate !== null}
        onClose={() => setAuthGate(null)}
        action={authGate ?? undefined}
      />
    </main>
  );
}
