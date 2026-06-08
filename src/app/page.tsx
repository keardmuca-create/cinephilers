"use client"

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Film, Star, Users, BookOpen, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/home');
  }, [user, loading, router]);

  if (loading || user) return null;

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto w-full">
        <svg width="140" viewBox="0 0 520 110" xmlns="http://www.w3.org/2000/svg" aria-label="Cinephilers">
          <text x="260" y="95" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700">
            <tspan fill="hsl(348,83%,47%)" fontSize="130">C</tspan>
            <tspan fill="white" fontSize="68" dy="-18" stroke="#222222" strokeWidth="5" paintOrder="stroke">inephilers</tspan>
          </text>
        </svg>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-bold bg-primary text-white px-4 py-2 rounded-full hover:bg-primary/90 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 max-w-2xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full mb-6">
          <Film className="h-3.5 w-3.5" />
          Track · Rate · Discuss
        </div>
        <h1 className="text-5xl sm:text-6xl font-headline font-black leading-tight mb-6">
          Your Cinematic<br />
          <span className="text-primary">Universe</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">
          Log every movie and show you watch. Rate them, write reviews, build lists, and see what your friends are watching.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link
            href="/signup"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-white font-bold px-8 py-3.5 rounded-full hover:bg-primary/90 transition-colors text-base"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto flex items-center justify-center gap-2 border border-white/20 text-foreground font-bold px-8 py-3.5 rounded-full hover:bg-white/5 transition-colors text-base"
          >
            Log in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-4xl mx-auto w-full">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Film,
              title: 'Track',
              body: 'Log everything you watch and keep a watchlist of what\'s next.',
            },
            {
              icon: Star,
              title: 'Rate & Review',
              body: 'Give ratings out of 10 and write reviews with spoiler warnings.',
            },
            {
              icon: Users,
              title: 'Follow Friends',
              body: 'See what the people you follow are rating and watching right now.',
            },
            {
              icon: BookOpen,
              title: 'Build Lists',
              body: 'Organise your favourites into public or private custom lists.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card border border-white/5 rounded-2xl p-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-headline font-bold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-6 py-16 max-w-2xl mx-auto w-full text-center">
        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-10">
          <h2 className="text-3xl font-headline font-black mb-4">Start tracking today</h2>
          <p className="text-muted-foreground mb-8">Free to use. No credit card required.</p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold px-8 py-3.5 rounded-full hover:bg-primary/90 transition-colors"
          >
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Cinephilers. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
