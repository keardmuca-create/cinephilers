import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Play, Star, ListPlus, Users, Upload, Award } from 'lucide-react';
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
  { icon: Award, title: 'Earn badges', text: 'Unlock badges for milestones, genres, world cinema, and seasonal challenges as you watch.' },
];

export default async function RootPage() {
  const jar = await cookies();
  if (jar.get('access_token')?.value || jar.get('refresh_token')?.value) redirect('/home');

  const pool = await buildHomePool();
  const posters = pool
    .filter(m => m.poster && !m.poster.includes('picsum'))
    .slice(0, 18);

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
            Track movies and shows, rate and review them, build your watchlist, and see what your friends are watching — all free.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button asChild size="lg" className="rounded-2xl h-14 px-8 font-bold text-base">
              <Link href="/signup">Sign Up Free</Link>
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
