"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Film, Tv, Clapperboard, Star, MessageSquare, TrendingUp, Clock, Eye, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as ChartTooltip } from 'recharts';
import type { MediaSide } from '@/lib/media-type';

interface Stats {
  totalWatched: number;
  totalMovies: number;
  totalShows: number;
  watchedThisYear: number;
  moviesThisYear: number;
  showsThisYear: number;
  totalEpisodes: number;
  episodesThisYear: number;
  totalRatings: number;
  avgScore: number | null;
  reviewsCount: number;
  monthlyActivity: { month: string; movies: number; episodes: number }[];
  watchMinutes?: { films: number; shows: number; total: number };
  // Split three ways. Optional so a response from before the split still renders.
  ratingsBySide?: Record<MediaSide, { count: number; avg: number | null }>;
  reviewsBySide?: Record<MediaSide, number>;
  rewatchedBySide?: Record<MediaSide, number>;
  rewatchedThisYearBySide?: Record<MediaSide, number>;
}

type SpanKey = 'total' | 'films' | 'shows';

// A month here is 30 days and a year is 365. Calendar months run 28 to 31 days,
// and "how much of my life was this" has no calendar behind it — nobody watched
// their films in February.
const DAY = 24 * 60;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The whole figure in words: "1 month 26 days 10 hours and 23 minutes".
 *
 * Every unit that has anything in it is named, largest first, with "and" before
 * the last — Keard asked for the full breakdown rather than a rounded headline,
 * and it reads like something a person would say.
 *
 * Empty units are skipped, so 47 days and 10 minutes says exactly that instead
 * of padding itself out with "0 hours".
 *
 * Every minute in it is real: films carry their own runtime and so does each
 * episode, so there is nothing to caveat and no second line restating the same
 * figure in another unit.
 */
function humanTime(mins: number): string {
  if (mins <= 0) return '0 minutes';

  const total = Math.round(mins);
  const parts: string[] = [];

  // Each unit takes its bite and passes the rest on. Reading every unit off the
  // total independently looks tidier and is wrong: a 365-day year is not twelve
  // 30-day months, so `total % MONTH` is not what is left after the years are
  // taken out. It reported 1 year 3 months and 7 days for a figure that is 1
  // year 3 months and 2 days.
  let rest = total;
  const years = Math.floor(rest / YEAR); rest -= years * YEAR;
  const months = Math.floor(rest / MONTH); rest -= months * MONTH;
  const days = Math.floor(rest / DAY); rest -= days * DAY;
  const hours = Math.floor(rest / 60); rest -= hours * 60;
  const minutes = rest;

  if (years) parts.push(plural(years, 'year'));
  if (months) parts.push(plural(months, 'month'));
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (minutes) parts.push(plural(minutes, 'minute'));

  return parts.length > 1
    ? `${parts.slice(0, -1).join(' ')} and ${parts[parts.length - 1]}`
    : parts[0];
}

const SIDE_META: Record<MediaSide, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  movies: { label: 'Movies', icon: Film },
  shows: { label: 'Shows', icon: Tv },
  episodes: { label: 'Episodes', icon: Clapperboard },
};
const SIDES: MediaSide[] = ['movies', 'shows', 'episodes'];

// The pill every list in the app uses — same shape, same weight — so the choices
// on this page read as the same control. A plain row of chips looked like a
// different kind of thing.
function Pill<K extends string>({ value, onChange, options }: {
  value: K;
  onChange: (key: K) => void;
  options: { key: K; label: string; icon?: React.ComponentType<{ className?: string }> }[];
}) {
  return (
    <div className="flex items-center bg-muted rounded-full p-1 border border-border w-full">
      {options.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`flex flex-1 items-center justify-center gap-1 px-1 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              active ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {Icon && <Icon className="h-3 w-3 shrink-0" />} {label}
          </button>
        );
      })}
    </div>
  );
}

// One figure — watched, rewatched, rated, reviewed — as a row of three small cards,
// Movies · Shows · Episodes, under a heading. Films, series and episodes are never
// summed here: 300 films and 300 episodes are wildly different amounts of watching,
// and a blended total hid which one somebody actually does.
function SplitRow({ title, icon: Icon, iconColor = 'text-primary', cells }: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  cells: Record<MediaSide, { value: number; sub?: string }>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-headline font-bold text-base flex items-center gap-2 px-1">
        <Icon className={`h-4 w-4 ${iconColor}`} /> {title}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {SIDES.map(side => {
          const { label, icon: SideIcon } = SIDE_META[side];
          const cell = cells[side];
          return (
            <div key={side} className="bg-card rounded-2xl border border-border p-3 flex flex-col gap-2 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <SideIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-black font-headline leading-none">{cell.value.toLocaleString()}</p>
                <p className="text-xs font-bold text-muted-foreground mt-1">{label}</p>
                {cell.sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{cell.sub}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map(row => (
        <div key={row} className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-2xl border border-border p-3 space-y-2">
              <div className="h-8 w-8 rounded-xl bg-muted animate-pulse" />
              <div className="h-6 bg-muted rounded-full w-1/2 animate-pulse" />
              <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
      <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
        <div className="h-5 bg-muted rounded-full w-1/3 animate-pulse" />
        <div className="h-40 bg-muted/40 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  // Which slice of the time figure is on screen. Total first: the whole is what
  // somebody came to see, and the parts explain it.
  const [span, setSpan] = useState<SpanKey>('total');
  const [loading, setLoading] = useState(true);
  // Which series the Monthly Activity chart is plotting. Films and episodes are
  // never summed: one film and one episode are not two of the same thing, and
  // that sum was what the old single series showed.
  //
  // Declared up here with the other state, above the logged-out redirect below.
  // It used to sit after that early return, so a visitor whose session was still
  // loading rendered four hooks and then, once it settled logged-out, three — and
  // React crashes the page on a hook count that changes between renders.
  const [activityKind, setActivityKind] = useState<'movies' | 'episodes'>('movies');

  useEffect(() => {
    if (!user) return;
    fetchWithAuth('/api/stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setStats(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!authLoading && !user) {
    router.replace('/login');
    return null;
  }

  const year = new Date().getFullYear();
  const activity = stats
    ? stats.monthlyActivity.map(m => ({ month: m.month, count: m[activityKind] }))
    : [];
  // Scaled to the series on screen, or a films-height axis would flatten a month
  // of episodes into nothing.
  const maxMonth = Math.max(...activity.map(m => m.count), 1);

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-headline font-bold">Your Stats</h1>
          <p className="text-sm text-muted-foreground">All data synced from your account</p>
        </div>
      </div>

      {loading && <Skeleton />}

      {!loading && stats && (
        <div className="space-y-6">
          {/* Time watched — full width and above the rest, because it is the one
              figure here anybody repeats out loud. The split is not decoration:
              a lone total invites "from what?", and films and series are two
              different kinds of viewing life. No Episodes side: a show's time IS
              its episodes' time, so it would repeat Shows exactly. */}
          {stats.watchMinutes && stats.watchMinutes.total > 0 && (
            <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="font-headline font-bold text-lg">Time Watched</h2>
              </div>
              <p className="text-3xl font-black font-headline leading-tight">
                {humanTime(stats.watchMinutes[span])}
              </p>
              <Pill
                value={span}
                onChange={setSpan}
                options={[
                  { key: 'total', label: 'All' },
                  { key: 'films', label: 'Movies', icon: Film },
                  { key: 'shows', label: 'Shows', icon: Tv },
                ]}
              />
            </div>
          )}

          {/* A show counts from its first episode, so seven series barely started
              and seven watched to the end give the same Shows figure — the
              Episodes card beside it is what separates them. The year sits under
              each all-time figure. */}
          <SplitRow
            title="Watched"
            icon={Eye}
            cells={{
              movies: { value: stats.totalMovies, sub: `${stats.moviesThisYear} in ${year}` },
              shows: { value: stats.totalShows, sub: `${stats.showsThisYear} in ${year}` },
              episodes: { value: stats.totalEpisodes, sub: `${stats.episodesThisYear} in ${year}` },
            }}
          />

          {stats.rewatchedBySide && (
            <SplitRow
              title="Rewatched"
              icon={Repeat}
              cells={{
                movies: { value: stats.rewatchedBySide.movies, sub: `${stats.rewatchedThisYearBySide?.movies ?? 0} in ${year}` },
                shows: { value: stats.rewatchedBySide.shows, sub: `${stats.rewatchedThisYearBySide?.shows ?? 0} in ${year}` },
                episodes: { value: stats.rewatchedBySide.episodes, sub: `${stats.rewatchedThisYearBySide?.episodes ?? 0} in ${year}` },
              }}
            />
          )}

          {/* Each side keeps its own average: a film score, a series score and an
              episode score are three different verdicts. */}
          {stats.ratingsBySide && (
            <SplitRow
              title="Ratings"
              icon={Star}
              iconColor="text-yellow-400"
              cells={{
                movies: { value: stats.ratingsBySide.movies.count, sub: stats.ratingsBySide.movies.avg !== null ? `avg ${stats.ratingsBySide.movies.avg}` : undefined },
                shows: { value: stats.ratingsBySide.shows.count, sub: stats.ratingsBySide.shows.avg !== null ? `avg ${stats.ratingsBySide.shows.avg}` : undefined },
                episodes: { value: stats.ratingsBySide.episodes.count, sub: stats.ratingsBySide.episodes.avg !== null ? `avg ${stats.ratingsBySide.episodes.avg}` : undefined },
              }}
            />
          )}

          {stats.reviewsBySide && (
            <SplitRow
              title="Reviews"
              icon={MessageSquare}
              iconColor="text-green-400"
              cells={{
                movies: { value: stats.reviewsBySide.movies },
                shows: { value: stats.reviewsBySide.shows },
                episodes: { value: stats.reviewsBySide.episodes },
              }}
            />
          )}

          {/* Monthly activity chart */}
          <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-headline font-bold text-lg">Monthly Activity</h2>
            </div>
            {/* The subtitle changes with the toggle. It names the unit being
                counted, and the two units are not interchangeable — leaving it
                at "titles" would have the axis quietly lying on one of them. */}
            <p className="text-xs text-muted-foreground -mt-2">
              {activityKind === 'movies' ? 'Movies' : 'Episodes'} watched per month — last 12 months
            </p>

            {/* No Shows side: a month of "shows" has no clear count — started, or
                finished, or merely continued — where films and episodes each do. */}
            <Pill
              value={activityKind}
              onChange={setActivityKind}
              options={[
                { key: 'movies', label: 'Movies', icon: Film },
                { key: 'episodes', label: 'Episodes', icon: Clapperboard },
              ]}
            />

            {activity.every(m => m.count === 0) ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  No {activityKind === 'movies' ? 'movies' : 'episodes'} watched in the last 12 months
                </p>
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity} barCategoryGap="25%">
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#888', fontSize: 10, fontWeight: 'bold' }}
                    />
                    <YAxis hide domain={[0, Math.ceil(maxMonth / 0.7)]} />
                    <ChartTooltip
                      cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', color: '#111', fontSize: 12 }}
                      formatter={(value: number) => [
                        activityKind === 'movies'
                          ? `${value} movie${value !== 1 ? 's' : ''}`
                          : `${value} episode${value !== 1 ? 's' : ''}`,
                        '',
                      ]}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {activity.map((entry, i) => (
                        <Cell
                          key={i}
                          // The busiest month of the series on screen, not of the
                          // other one — maxMonth already follows the toggle.
                          fill={entry.count === maxMonth ? 'hsl(var(--primary))' : 'hsl(var(--accent))'}
                          opacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && !stats && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">No stats yet</p>
            <p className="text-sm text-muted-foreground mt-1">Start watching and rating to build your stats</p>
          </div>
          <Button asChild size="sm" className="rounded-xl font-bold mt-1">
            <Link href="/browse">Browse titles</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
