"use client"

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Eye, Star, Film, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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

interface PersonData {
  name: string;
  profileImage: string;
  sections: PersonCreditSection[];
  upcoming: PersonCreditSection[];
}

function CreditSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-3.5 border-b border-border">
      <Skeleton className="w-12 shrink-0 rounded-lg" style={{ aspectRatio: '2/3' }} />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function CreditRow({ credit, watched, userRating }: {
  credit: PersonCreditItem;
  watched: boolean;
  userRating?: number;
}) {
  return (
    <Link
      href={`/movie/${credit.id}`}
      className="group flex items-center gap-4 px-6 py-3.5 border-b border-border hover:bg-muted/40 transition-colors"
    >
      <div className="relative w-12 shrink-0 rounded-lg overflow-hidden shadow-sm bg-muted/60 border border-border" style={{ aspectRatio: '2/3' }}>
        {credit.poster ? (
          <Image src={credit.poster} alt={credit.title} fill className="object-cover transition-transform group-hover:scale-105" sizes="48px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-5 w-5 text-primary/60" />
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
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-bold">{credit.rating.toFixed(1)}</span>
            </div>
          )}
          {userRating !== undefined && (
            <div className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-blue-400 text-blue-400" />
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
          <p className="text-[11px] text-muted-foreground mt-0.5">{credit.character || credit.job}</p>
        )}
      </div>
    </Link>
  );
}

function SectionBlock({ section, upcomingSection, watchedMap, ratingsMap, tab, headerTop }: {
  section: PersonCreditSection;
  upcomingSection?: PersonCreditSection;
  watchedMap: Record<string, boolean>;
  ratingsMap: Record<string, number>;
  tab: 'released' | 'upcoming';
  headerTop: string;
}) {
  const hasReleased = section.credits.length > 0;
  const hasUpcoming = !!(upcomingSection && upcomingSection.credits.length > 0);

  const showUpcoming = tab === 'upcoming' && hasUpcoming;
  const activeCredits = showUpcoming ? upcomingSection!.credits : section.credits;

  // In the Upcoming view, hide sections that have no upcoming credits entirely.
  if (tab === 'upcoming' && !hasUpcoming) return null;
  if (tab === 'released' && !hasReleased) return null;

  const isUpcomingView = showUpcoming;

  const watchedCount = section.credits.filter(c => watchedMap[c.id]).length;
  const pct = section.credits.length > 0 ? Math.round((watchedCount / section.credits.length) * 100) : 0;

  return (
    <div>
      <div className="sticky z-[5] bg-background/95 backdrop-blur-sm px-6 py-2.5 border-b border-border flex items-center justify-between" style={{ top: headerTop }}>
        <div className="flex items-center gap-2">
          <div className={`w-1 h-4 rounded-full ${isUpcomingView ? 'bg-orange-400' : 'bg-primary'}`} />
          <span className="text-sm font-bold font-headline">{section.label}</span>
          <span className="text-xs text-muted-foreground">({activeCredits.length})</span>
        </div>
        {!isUpcomingView && section.credits.length > 0 && (
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-blue-400" />
            <span className="text-xs font-bold text-blue-400">{pct}%</span>
          </div>
        )}
      </div>
      {activeCredits.map(credit => (
        <CreditRow
          key={`${section.label}-${tab}-${credit.id}`}
          credit={credit}
          watched={!!watchedMap[credit.id]}
          userRating={ratingsMap[credit.id]}
        />
      ))}
    </div>
  );
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<PersonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchedMap, setWatchedMap] = useState<Record<string, boolean>>({});
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<'released' | 'upcoming'>('released');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/person/${id}`)
      .then(r => r.json())
      .then((json: PersonData & { error?: string }) => {
        if (!json.error) {
          setData(json);
          try {
            const stored = localStorage.getItem('recently-viewed');
            const viewed: { id: string }[] = stored ? JSON.parse(stored) : [];
            const entry = { id: String(id), title: json.name, poster: json.profileImage, year: '', type: 'person' };
            localStorage.setItem('recently-viewed', JSON.stringify([entry, ...viewed.filter(v => v.id !== String(id))].slice(0, 100)));
          } catch { /* ignore */ }
          const watched: Record<string, boolean> = {};
          const ratings: Record<string, number> = {};
          try {
            const all = [...json.sections, ...(json.upcoming ?? [])].flatMap(s => s.credits);
            for (const c of all) {
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
  }, [id]);

  const totalUnique = new Set(data?.sections.flatMap(s => s.credits.map(c => c.id)) ?? []).size;

  return (
    <main className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {data && (
            <div className="relative h-9 w-9 rounded-xl overflow-hidden shrink-0 bg-muted flex items-center justify-center">
              {data.profileImage ? (
                <Image src={data.profileImage} alt={data.name} fill className="object-cover" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>
          )}
          <h1 className="text-base font-headline font-bold truncate">{data?.name ?? '…'}</h1>
        </div>
        {!loading && data && (
          <span className="text-sm text-muted-foreground shrink-0">{totalUnique} titles</span>
        )}
      </header>

      {loading ? (
        <div>{Array(12).fill(0).map((_, i) => <CreditSkeleton key={i} />)}</div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-muted-foreground font-bold">Person not found.</p>
          <Button variant="outline" className="rounded-full border-border" onClick={() => router.back()}>Go Back</Button>
        </div>
      ) : (
        <div>
          {(() => {
            const upcomingByLabel = new Map((data.upcoming ?? []).map(s => [s.label, s]));
            const upcomingOnlySections = (data.upcoming ?? []).filter(us => !data.sections.find(s => s.label === us.label));
            const hasAnyUpcoming = (data.upcoming ?? []).some(s => s.credits.length > 0);
            const headerTop = hasAnyUpcoming
              ? 'calc(env(safe-area-inset-top) + 73px + 49px)'
              : 'calc(env(safe-area-inset-top) + 73px)';
            return (
              <>
                {hasAnyUpcoming && (
                  <div className="sticky top-[calc(env(safe-area-inset-top)+73px)] z-[6] bg-background/95 backdrop-blur-sm px-6 py-2.5 border-b border-border flex justify-center">
                    <div className="flex rounded-full overflow-hidden border border-border text-xs font-bold">
                      <button
                        onClick={() => setTab('released')}
                        className={`px-4 py-1.5 transition-colors ${tab === 'released' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Released
                      </button>
                      <button
                        onClick={() => setTab('upcoming')}
                        className={`px-4 py-1.5 transition-colors ${tab === 'upcoming' ? 'bg-orange-400 text-white' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        Upcoming
                      </button>
                    </div>
                  </div>
                )}
                {data.sections.map(section => (
                  <SectionBlock
                    key={section.label}
                    section={section}
                    upcomingSection={upcomingByLabel.get(section.label)}
                    watchedMap={watchedMap}
                    ratingsMap={ratingsMap}
                    tab={tab}
                    headerTop={headerTop}
                  />
                ))}
                {upcomingOnlySections.map(upSection => (
                  <SectionBlock
                    key={`only-${upSection.label}`}
                    section={{ label: upSection.label, credits: [] }}
                    upcomingSection={upSection}
                    watchedMap={watchedMap}
                    ratingsMap={ratingsMap}
                    tab={tab}
                    headerTop={headerTop}
                  />
                ))}
              </>
            );
          })()}
        </div>
      )}
    </main>
  );
}
