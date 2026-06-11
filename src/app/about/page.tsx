import Link from 'next/link';
import { ChevronLeft, Film, Star, Users, BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About — Cinephilers',
  description: 'Cinephilers is a social movie and TV tracking app. Track what you watch, rate titles, write reviews, and share with friends.',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 pt-8 pb-20">
        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <Link href="/" className="p-2 rounded-full hover:bg-muted/50 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <svg width="160" viewBox="0 0 520 110" xmlns="http://www.w3.org/2000/svg" aria-label="Cinephilers">
            <text x="260" y="95" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700">
              <tspan fill="hsl(348,83%,47%)" fontSize="130">C</tspan>
              <tspan fill="white" fontSize="68" dy="-18" stroke="#222222" strokeWidth="5" paintOrder="stroke">inephilers</tspan>
            </text>
          </svg>
        </div>

        {/* Hero */}
        <section className="mb-12">
          <h1 className="text-4xl font-headline font-bold mb-4">Your Cinematic Universe</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Cinephilers is a social movie and TV tracking app built for people who take their watch history seriously.
            Log everything you watch, rate it, write a review, and see what the people you follow are into.
          </p>
        </section>

        {/* What you can do */}
        <section className="mb-12 space-y-6">
          <h2 className="text-2xl font-headline font-bold">What you can do</h2>
          <div className="grid gap-4">
            {[
              { icon: Film, title: 'Track', body: 'Mark movies and shows as watched. Build a history of everything you\'ve seen and keep a watchlist of what\'s next.' },
              { icon: Star, title: 'Rate & Review', body: 'Give ratings out of 10 and write full reviews. Mark spoilers so others can read safely.' },
              { icon: Users, title: 'Follow Friends', body: 'Follow people you know and see their ratings, reviews, and activity. Private accounts require a follow request.' },
              { icon: BookOpen, title: 'Build Lists', body: 'Organise films into custom lists — public or private. Share your favourites, your comfort watches, your all-time bests.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4 p-5 bg-card border border-border rounded-2xl">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Who made it */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-bold mb-4">Who made it</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cinephilers is an independent project built from scratch. It uses the{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              TMDB API
            </a>{' '}
            for movie and TV data. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-2xl font-headline font-bold mb-4">Get in touch</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions, feedback, or bug reports — reach us at{' '}
            <a href="mailto:support@cinephilers.app" className="text-primary hover:underline">
              support@cinephilers.app
            </a>{' '}
            or use the{' '}
            <Link href="/support" className="text-primary hover:underline">Support page</Link>.
          </p>
        </section>

        {/* Footer links */}
        <footer className="pt-8 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        </footer>
      </div>
    </main>
  );
}
