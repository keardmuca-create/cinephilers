"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Film, Star, MessageSquare, Eye, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip as ChartTooltip } from 'recharts';

interface Stats {
  totalWatched: number;
  totalMovies: number;
  totalShows: number;
  watchedThisYear: number;
  totalRatings: number;
  avgScore: number | null;
  reviewsCount: number;
  monthlyActivity: { month: string; count: number }[];
  watchMinutes?: { films: number; shows: number; total: number };
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
 * Worth knowing when reading the minutes: for films they are exact, since every
 * film carries its own runtime. For series they come from one average episode
 * length per show, so the last digit of a Shows or All figure is approximate.
 */
function humanTime(mins: number): { value: string; sub: string } {
  if (mins <= 0) return { value: '0 minutes', sub: 'Nothing marked watched yet' };

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

  const value = parts.length > 1
    ? `${parts.slice(0, -1).join(' ')} and ${parts[parts.length - 1]}`
    : parts[0];

  const totalDays = Math.floor(total / DAY);
  const totalHours = Math.floor(total / 60);

  return {
    value,
    sub: totalDays > 0
      ? `${totalDays.toLocaleString()} days · ${totalHours.toLocaleString()} hours watched`
      : 'Time in front of a screen',
  };
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card rounded-3xl border border-border p-5 flex flex-col gap-3">
      <div className={`h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-3xl font-black font-headline">{value}</p>
        <p className="text-sm font-bold text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-card rounded-3xl border border-border p-5 space-y-3">
            <div className="h-10 w-10 rounded-2xl bg-muted animate-pulse" />
            <div className="h-8 bg-muted rounded-full w-1/2 animate-pulse" />
            <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />
          </div>
        ))}
      </div>
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
  const maxMonth = stats ? Math.max(...stats.monthlyActivity.map(m => m.count), 1) : 1;

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
          {/* Time watched — full width and above the grid, because it is the one
              figure here anybody repeats out loud. The split is not decoration:
              a lone total invites "from what?", and films and series are two
              different kinds of viewing life. */}
          {stats.watchMinutes && stats.watchMinutes.total > 0 && (() => {
            const mins = stats.watchMinutes[span];
            const { value, sub } = humanTime(mins);
            return (
              <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <h2 className="font-headline font-bold text-lg">Time Watched</h2>
                </div>
                <div>
                  <p className="text-3xl font-black font-headline leading-tight">{value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{sub}</p>
                </div>
                <div className="flex gap-2">
                  {([
                    ['total', 'All'],
                    ['films', 'Films'],
                    ['shows', 'Shows'],
                  ] as [SpanKey, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSpan(key)}
                      aria-pressed={span === key}
                      className={`rounded-full px-4 py-1.5 text-xs font-bold border transition-colors ${
                        span === key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Said once, plainly. Episode length is one average per series,
                    and a title with no runtime stored counts as nothing — so the
                    figure leans low rather than flattering. */}
                <p className="text-[11px] text-muted-foreground/70">
                  Estimated from runtimes — episodes use each show&apos;s average length.
                </p>
              </div>
            );
          })()}

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={Calendar}
              label={`Watched in ${year}`}
              value={stats.watchedThisYear}
              sub={`${stats.totalWatched} all time`}
            />
            <StatCard
              icon={Eye}
              label="Total watched"
              value={stats.totalWatched}
              sub="movies & shows"
              color="text-primary"
            />
            <StatCard
              icon={Star}
              label="Ratings given"
              value={stats.totalRatings}
              sub={stats.avgScore !== null ? `avg ${stats.avgScore}/10` : 'No ratings yet'}
              color="text-yellow-400"
            />
            <StatCard
              icon={MessageSquare}
              label="Reviews written"
              value={stats.reviewsCount}
              color="text-green-400"
            />
          </div>

          {/* Monthly activity chart */}
          <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="font-headline font-bold text-lg">Monthly Activity</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Titles watched per month — last 12 months</p>
            {stats.monthlyActivity.every(m => m.count === 0) ? (
              <div className="h-40 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No activity in the last 12 months</p>
              </div>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.monthlyActivity} barCategoryGap="25%">
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
                      formatter={(value: number) => [`${value} title${value !== 1 ? 's' : ''}`, '']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {stats.monthlyActivity.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.count === Math.max(...stats.monthlyActivity.map(m => m.count))
                            ? 'hsl(var(--primary))'
                            : 'hsl(var(--accent))'}
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
