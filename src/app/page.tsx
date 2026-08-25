import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Play, Star, ListPlus, Users, Upload, Award, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildHomePool } from '@/lib/home-pool';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const FEATURES = [
  { icon: Play, title: 'Track everything', text: 'Mark movies, shows, and individual episodes as watched. Your full viewing history, in one place.' },
  { icon: Star, title: 'Rate & review', text: 'Score everything out of 10 and write reviews. See your taste mapped out in stats and charts.' },
  { icon: ListPlus, title: 'Watchlist & lists', text: 'Save what you want to watch next and build custom lists for any mood, genre, or marathon.' },
  { icon: Users, title: 'Follow friends', text: 'See what your friends watch, rate, and review in a live activity feed. Compare ratings on every title.' },
  { icon: Upload, title: 'Import your history', text: 'Bring your Letterboxd or IMDb data with you in one click. No starting from zero.' },
  // Named badges that actually exist in badge-defs.ts. This said "seasonal
  // challenges" for months — seasonal badges were considered and deliberately not
  // built, so the page was sending new members looking for something that was
  // never there.
  { icon: Award, title: 'Earn badges', text: 'Unlock badges for milestones, world cinema, episodes, reviews, and your daily pick streak.' },
];

// The landing page's Today's Pick band is a still life of the real thing: the
// same poster wall, the same card, the same 2:3 window — but rendered on the
// server with nothing behind it, because the live component needs an account and
// a watchlist before it has anything to say.
//
// It shows the state BEFORE Generate on purpose. Showing a revealed film would
// mean naming a pick nobody made, and the reveal is the part worth signing up
// for; giving it away on the way in spends it.
const WALL_COLS = 8;
const WALL_TILES = 32;

export default async function RootPage() {
  const jar = await cookies();
  if (jar.get('access_token')?.value || jar.get('refresh_token')?.value) redirect('/home');

  const pool = await buildHomePool();
  const usable = pool.filter(m => m.poster && !m.poster.includes('picsum'));
  const posters = usable.slice(0, 18);
  // Different films from the hero's, so the two walls don't read as the same
  // eighteen posters twice. Falls back to the top of the pool if it is short.
  const wall = (usable.length >= 18 + WALL_TILES ? usable.slice(18) : usable)
    .slice(0, WALL_TILES)
    .map(m => m.poster!.replace(/\/w\d+\//, '/w92/'));

  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Poster wall */}
        {posters.length > 0 && (
          <div className="absolute inset-0 grid grid-cols-3 sm:grid-cols-6 gap-2 p-2 opacity-30 scale-105 -rotate-1">
            {posters.filter(m => m.poster).map(m => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={m.id} src={m.poster} alt="" className="w-full aspect-[2/3] object-cover rounded-xl" />
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/85 to-background" />

        <div className="relative z-10 max-w-3xl mx-auto px-6 pt-28 pb-24 text-center space-y-6">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-primary">Cinephilers</p>
          <h1 className="text-4xl sm:text-6xl font-headline font-black leading-tight">
            Every film you watch,<br className="hidden sm:block" /> remembered.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
            Track movies and shows, rate and review them, build your watchlist, and see what your friends are watching.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg" className="rounded-2xl h-14 px-8 font-bold text-base">
              <Link href="/signup">Sign Up</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-2xl h-14 px-8 font-bold text-base border-2 border-foreground">
              <Link href="/home">Explore First</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Already a member?{' '}
            <Link href="/login" className="text-primary hover:underline font-semibold">Log in</Link>
          </p>
        </div>
      </section>

      {/* Today's Pick */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Today&apos;s Pick</p>
            <h2 className="text-3xl sm:text-4xl font-headline font-black leading-tight">
              One film a day,<br className="hidden sm:block" /> out of your own watchlist.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Not a film of the day everybody gets. Yours — drawn from the list you built,
              one film, once a day. Press it and the reel spins through your watchlist until
              it lands on tonight.
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Locked until midnight, so there is no rerolling until you like the answer.
              </li>
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Mark it watched and it counts — towards your history, your stats, and a streak badge.
              </li>
              <li className="flex gap-2.5">
                <span className="text-primary font-bold">·</span>
                Tells you why it picked that one, and what your friends made of it.
              </li>
            </ul>
          </div>

          {/* The still life. Same shell, wall and card as the real component. */}
          <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-accent/5 px-8 py-9 sm:px-10 sm:py-10">
            {wall.length > 0 && (
              <div aria-hidden className="absolute inset-0 pointer-events-none select-none">
                <div
                  className="absolute inset-x-0 top-0 grid"
                  style={{ gridTemplateColumns: `repeat(${WALL_COLS}, 1fr)` }}
                >
                  {wall.map((p, i) => (
                    <div key={`${p}-${i}`} className="relative aspect-[2/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                {/* Barely tinted, same as the app: enough to stop twenty-four
                    unrelated palettes clashing, not enough to hide the posters. */}
                <div className="absolute inset-0 bg-primary/20 mix-blend-color" />
              </div>
            )}

            <div className="relative mx-auto max-w-xs rounded-[1.6rem] bg-card border border-border/60 shadow-2xl p-5 flex flex-col items-center justify-center text-center gap-3">
              <div className="relative w-20 shrink-0 aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="w-full h-[7.5rem] flex flex-col items-center justify-center gap-1 overflow-hidden">
                <h3 className="text-xl font-headline font-bold leading-tight">Today&apos;s Pick</h3>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  Choosing is the hard part. We&apos;ll handle that bit.
                </p>
              </div>
              {/* Same pill, same height as the real Generate button, but it says
                  what it does. Labelling it "Generate" would look right and then
                  hand a stranger a signup form instead of a film. */}
              <Button asChild className="w-full rounded-full h-12 font-bold text-base">
                <Link href="/signup"><Sparkles className="h-5 w-5 mr-2" /> Create free account</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-card border border-border rounded-3xl p-6 space-y-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h2 className="font-headline font-bold text-lg">{f.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-3xl mx-auto px-6 pb-20 text-center space-y-5">
        <h2 className="text-2xl sm:text-3xl font-headline font-bold">Start your watch history today</h2>
        <Button asChild size="lg" className="rounded-2xl h-14 px-10 font-bold text-base">
          <Link href="/signup">Create Free Account</Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-5">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
          <p>
            Data from{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">TMDB</a>
            {' '}— not endorsed or certified by TMDB.
          </p>
        </div>
      </footer>
    </main>
  );
}
