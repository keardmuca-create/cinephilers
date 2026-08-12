"use client"

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, Star, Film, User, X } from 'lucide-react';
import { WatchedEye } from '@/components/watched-eye';
import { readWatchedState, readEpisodeProgress, loadEpisodeProgress, type WatchedState } from '@/lib/watched-state';
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
  biography?: string;
  birthday?: string;
  deathday?: string;
  placeOfBirth?: string;
  knownFor?: string;
  sections: PersonCreditSection[];
  upcoming: PersonCreditSection[];
}

// TMDB names departments, not people: "Directing", "Acting", "Sound". The line
// under someone's name should say what they ARE.
const KNOWN_FOR_NOUN: Record<string, string> = {
  Acting: 'Actor',
  Directing: 'Director',
  Production: 'Producer',
  Writing: 'Writer',
  Sound: 'Composer',
  Camera: 'Cinematographer',
  Editing: 'Editor',
  'Visual Effects': 'Visual effects',
  Art: 'Art department',
  Crew: 'Crew',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "9 June 1963" from TMDB's "1963-06-09". */
function longDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function yearsBetween(from: string, to: string): number | null {
  const a = new Date(from), b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  let age = b.getFullYear() - a.getFullYear();
  const md = b.getMonth() - a.getMonth() || b.getDate() - a.getDate();
  if (md < 0) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * The one line under the name. For someone who has died it leads with the
 * lifespan, because that is the fact people are looking for — the birthday alone
 * quietly implies they're still alive.
 */
function factsLine(d: PersonData): string {
  const parts: string[] = [];
  // No "Director" here. What someone is known for is already said twice below —
  // the sections lead with it, and so does the first chip — and a third copy on
  // the line where the dates live is the one that reads as filler.

  if (d.birthday && d.deathday) {
    const age = yearsBetween(d.birthday, d.deathday);
    parts.push(`${d.birthday.slice(0, 4)}–${d.deathday.slice(0, 4)}${age !== null ? ` (aged ${age})` : ''}`);
  } else if (d.birthday) {
    const age = yearsBetween(d.birthday, new Date().toISOString().slice(0, 10));
    parts.push(`Born ${longDate(d.birthday)}${age !== null ? ` (${age})` : ''}`);
  }

  // Place of birth deliberately not here — the biography's opening sentence
  // almost always carries it, and two copies six words apart read as a glitch.
  return parts.join(' · ');
}

function CreditSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-3.5 border-b border-border">
      <Skeleton className="w-[4.5rem] shrink-0 rounded-lg" style={{ aspectRatio: '2/3' }} />
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
  watched: WatchedState;
  userRating?: number;
}) {
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (watched !== 'partial') { setProgress(null); return; }
    const known = readEpisodeProgress(credit.id);
    if (known) { setProgress(known); return; }
    let alive = true;
    loadEpisodeProgress(credit.id).then(p => { if (alive) setProgress(p); }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [credit.id, watched]);

  return (
    <Link
      href={`/movie/${credit.id}`}
      className="group flex items-center gap-4 px-6 py-3.5 border-b border-border hover:bg-muted/40 transition-colors"
    >
      {/* 72px. Up from 48, which was the smallest poster in the app — small
          enough that you read the titles and never looked at the artwork.
          Deliberately short of History's 80px, which Keard found too big here:
          this page is a long scroll of dozens of credits, and at that size it
          becomes a wall. */}
      <div className="relative w-[4.5rem] shrink-0 rounded-lg overflow-hidden shadow-sm bg-muted/60 border border-border" style={{ aspectRatio: "2/3" }}>
        {credit.poster ? (
          <Image src={credit.poster} alt={credit.title} fill className="object-cover" sizes="72px" />
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
          {watched !== 'none' && (
            <div className="flex items-center gap-1 text-blue-400">
              <WatchedEye state={watched} className="h-3 w-3" />
              {(watched === 'complete' || progress) && (
                <span className="text-xs font-semibold">
                  {watched === 'partial' ? progress : 'Watched'}
                </span>
              )}
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

/**
 * Photo, facts, biography — and the chips that filter the credits.
 *
 * The page had no header at all: it opened straight into credit rows, with the
 * photo as a 36px thumbnail beside the back button. So there was nowhere for a
 * birthday to live, and no way to reach the three films someone directed without
 * scrolling past forty they acted in.
 *
 * The chips FILTER rather than scroll. Scrolling still makes you travel past
 * everything you didn't ask for; picking "Director" and being shown eighteen
 * films is the thing that was actually wanted. The selected chip carries an ✕ so
 * the way back out is on the control you just used.
 */
function PersonHeader({
  data, facts, bio, sections, active, onSelect, tab, onTab, hasUpcoming,
}: {
  data: PersonData;
  facts: string;
  bio: string;
  sections: PersonCreditSection[];
  active: string | null;
  onSelect: (label: string | null) => void;
  tab: 'released' | 'upcoming';
  onTab: (t: 'released' | 'upcoming') => void;
  hasUpcoming: boolean;
}) {
  const [bioOpen, setBioOpen] = useState(false);

  return (
    <div className="px-6 pt-5 pb-4 border-b border-border space-y-4">
      {/* Portrait on the left, name and biography beside it — so the photo has
          something to sit against instead of a column of white. */}
      <div className="flex gap-4">
        <div className="relative h-40 w-28 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center">
          {data.profileImage ? (
            <Image src={data.profileImage} alt={data.name} fill className="object-cover" sizes="112px" />
          ) : (
            <User className="h-10 w-10 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-headline font-bold leading-tight mb-1.5">{data.name}</h2>
          {bio && (
            <>
              {/* Clamped, not hidden. TMDB biographies run to several paragraphs
                  and the credits are what people came for — an open bio pushes
                  the first poster off the screen on a phone. */}
              <p className={`text-sm text-muted-foreground leading-relaxed whitespace-pre-line ${bioOpen ? '' : 'line-clamp-4'}`}>
                {bio}
              </p>
              <button
                onClick={() => setBioOpen(o => !o)}
                className="mt-1 text-xs font-bold text-primary hover:underline"
              >
                {bioOpen ? 'Less' : 'More'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dates only, a size up from the biography — a birth date is a fact you
          look for, not prose you read past. Place of birth lived here and has
          gone: the biography's first sentence almost always says where someone
          is from, so it was the same fact twice, six words apart. */}
      {facts && <p className="text-sm text-foreground/80 leading-relaxed">{facts}</p>}

      {sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {sections.map(s => {
            const on = active === s.label;
            return (
              <button
                key={s.label}
                onClick={() => onSelect(on ? null : s.label)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors flex items-center gap-1.5 ${
                  on
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted/60'
                }`}
              >
                <span>{s.label}</span>
                <span className={on ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                  {s.credits.length}
                </span>
                {on && <X className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Released / Upcoming only appears once a role is chosen. Before that the
          question has no clear subject — "upcoming what?" — and offering it over
          everything at once is the sticky bar this replaced. Pick Actor, then
          choose which of their acting work you want. */}
      {active && hasUpcoming && (
        <div className="flex rounded-full overflow-hidden border border-border text-xs font-bold w-fit">
          <button
            onClick={() => onTab('released')}
            className={`px-4 py-1.5 transition-colors ${tab === 'released' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Released
          </button>
          <button
            onClick={() => onTab('upcoming')}
            className={`px-4 py-1.5 transition-colors ${tab === 'upcoming' ? 'bg-orange-400 text-white' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Upcoming
          </button>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ section, upcomingSection, watchedMap, ratingsMap, tab, headerTop, filtered }: {
  section: PersonCreditSection;
  upcomingSection?: PersonCreditSection;
  watchedMap: Record<string, WatchedState>;
  ratingsMap: Record<string, number>;
  tab: 'released' | 'upcoming';
  headerTop: string;
  /** True when this is the only section shown, because a chip selected it. */
  filtered: boolean;
}) {
  const hasReleased = section.credits.length > 0;
  const hasUpcoming = !!(upcomingSection && upcomingSection.credits.length > 0);

  const showUpcoming = tab === 'upcoming' && hasUpcoming;
  const activeCredits = showUpcoming ? upcomingSection!.credits : section.credits;

  // In the Upcoming view, hide sections that have no upcoming credits entirely.
  if (tab === 'upcoming' && !hasUpcoming) return null;
  if (tab === 'released' && !hasReleased) return null;

  const isUpcomingView = showUpcoming;

  // Only finished credits count toward the percentage. One episode of a show
  // for a guest spot isn't "seen it", and shouldn't move a completion figure.
  const watchedCount = section.credits.filter(c => watchedMap[c.id] === 'complete').length;
  const pct = section.credits.length > 0 ? Math.round((watchedCount / section.credits.length) * 100) : 0;

  return (
    <div>
      <div className="sticky z-[5] bg-background/95 backdrop-blur-sm px-6 py-2.5 border-b border-border flex items-center justify-between" style={{ top: headerTop }}>
        {/* The label goes when a chip already carries it — "Director 18" in the
            filter and "Director (18)" six pixels below it is the same words
            twice. The watched percentage stays: nothing else says that. */}
        {filtered ? <span /> : (
          <div className="flex items-center gap-2">
            <div className={`w-1 h-4 rounded-full ${isUpcomingView ? 'bg-orange-400' : 'bg-primary'}`} />
            <span className="text-sm font-bold font-headline">{section.label}</span>
            <span className="text-xs text-muted-foreground">({activeCredits.length})</span>
          </div>
        )}
        {!isUpcomingView && section.credits.length > 0 && (
          <div className="flex items-center gap-1">
            <WatchedEye state="complete" className="h-3 w-3" />
            <span className="text-xs font-bold text-blue-400">{pct}%</span>
          </div>
        )}
      </div>
      {activeCredits.map(credit => (
        <CreditRow
          key={`${section.label}-${tab}-${credit.id}`}
          credit={credit}
          watched={watchedMap[credit.id] ?? 'none'}
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
  const [watchedMap, setWatchedMap] = useState<Record<string, WatchedState>>({});
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<'released' | 'upcoming'>('released');
  // Which role the credits are narrowed to. null = everything, as before.
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/person/${id}`)
      .then(r => r.json())
      .then((json: PersonData & { error?: string }) => {
        if (!json.error) {
          setData(json);
          // Open on what they're known for, rather than on every role at once.
          // The sections already arrive with that one first, and Letterboxd lands
          // you the same way — its actor page for a director-and-actor is a
          // separate page you have to ask for.
          setActive(json.sections?.[0]?.label ?? json.upcoming?.[0]?.label ?? null);
          try {
            const stored = localStorage.getItem('recently-viewed');
            const viewed: { id: string }[] = stored ? JSON.parse(stored) : [];
            const entry = { id: String(id), title: json.name, poster: json.profileImage, year: '', type: 'person' };
            localStorage.setItem('recently-viewed', JSON.stringify([entry, ...viewed.filter(v => v.id !== String(id))].slice(0, 100)));
          } catch { /* ignore */ }
          const watched: Record<string, WatchedState> = {};
          const ratings: Record<string, number> = {};
          try {
            const all = [...json.sections, ...(json.upcoming ?? [])].flatMap(s => s.credits);
            for (const c of all) {
              const state = readWatchedState(c.id);
              if (state !== 'none') watched[c.id] = state;
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


  return (
    <main className="min-h-screen pb-24 bg-background">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {/* Name only. The thumbnail here duplicated the portrait sitting a few
            pixels below it, which made the same face appear twice on first paint. */}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-headline font-bold truncate">{data?.name ?? '…'}</h1>
        </div>
        {/* The count moved into the header block below, where it sits under the
            name. Two copies of the same number on one screen read as a mistake. */}
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
            const upcomingOnly = (data.upcoming ?? []).filter(us => !data.sections.find(s => s.label === us.label));

            // Every section that exists at all, released or not, so a filter chip
            // appears for work that hasn't come out yet.
            const all: PersonCreditSection[] = [
              ...data.sections,
              ...upcomingOnly.map(s => ({ label: s.label, credits: [] as PersonCreditItem[] })),
            ];
            const chipSections = all.map(s => ({
              label: s.label,
              credits: [...s.credits, ...(upcomingByLabel.get(s.label)?.credits ?? [])],
            }));

            const shown = active ? all.filter(s => s.label === active) : all;
            const hasUpcoming = shown.some(s => (upcomingByLabel.get(s.label)?.credits.length ?? 0) > 0);
            const headerTop = 'calc(env(safe-area-inset-top) + 73px)';

            return (
              <>
                <PersonHeader
                  data={data}
                  facts={factsLine(data)}
                  bio={(data.biography ?? '').trim()}
                  sections={chipSections}
                  active={active}
                  // Clearing the filter takes the Released/Upcoming choice with
                  // it, so the unfiltered list can't be left showing only the
                  // upcoming half of everything with no control in sight.
                  onSelect={label => { setActive(label); if (!label) setTab('released'); }}
                  tab={tab}
                  onTab={setTab}
                  hasUpcoming={hasUpcoming}
                />
                {shown.map(section => (
                  <SectionBlock
                    key={section.label}
                    section={section}
                    upcomingSection={upcomingByLabel.get(section.label)}
                    watchedMap={watchedMap}
                    ratingsMap={ratingsMap}
                    tab={tab}
                    headerTop={headerTop}
                    filtered={!!active}
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
