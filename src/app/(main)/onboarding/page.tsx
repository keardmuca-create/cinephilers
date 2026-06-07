"use client"

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Film, Users, Star, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STEPS = [
  {
    icon: Film,
    title: 'Mark what you\'ve watched',
    description: 'Search for movies and shows you\'ve already seen and add them to your watched history.',
    action: 'Search titles',
    href: '/browse',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  {
    icon: Users,
    title: 'Find friends to follow',
    description: 'Follow people you know to see what they\'re watching and share your taste in films.',
    action: 'Find people',
    href: '/friends',
    color: 'text-primary',
    bg: 'bg-primary/10',
  },
  {
    icon: Star,
    title: 'Rate titles you\'ve seen',
    description: 'Give scores out of 10 to titles in your history. Your ratings build your stats and help friends discover great films.',
    action: 'See your history',
    href: '/history',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [done, setDone] = useState<Set<number>>(new Set());

  const finish = () => {
    try { localStorage.setItem('onboarding_complete', 'true'); } catch { /* ignore */ }
    router.push('/home');
  };

  const markDone = (i: number, href: string) => {
    setDone(prev => new Set([...prev, i]));
    router.push(href);
  };

  return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <p className="text-sm font-bold text-primary uppercase tracking-widest">Welcome to Cinephilers</p>
        <h1 className="text-3xl font-headline font-bold leading-tight">Get started in 3 steps</h1>
        <p className="text-sm text-muted-foreground">You can skip any of these and do them later.</p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = done.has(i);
          return (
            <div key={i} className={`bg-card rounded-3xl border p-5 flex items-start gap-4 transition-colors ${isDone ? 'border-primary/30 bg-primary/5' : 'border-white/5'}`}>
              <div className={`h-12 w-12 rounded-2xl ${step.bg} flex items-center justify-center shrink-0`}>
                {isDone
                  ? <Check className="h-6 w-6 text-primary" />
                  : <Icon className={`h-6 w-6 ${step.color}`} />
                }
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-bold font-headline">{step.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                <button
                  onClick={() => markDone(i, step.href)}
                  className={`text-sm font-bold mt-2 flex items-center gap-1 ${step.color} hover:opacity-70 transition-opacity`}
                >
                  {step.action} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Done button */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <Button className="w-full rounded-2xl font-bold h-12" onClick={finish}>
          Take me to the app <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <button onClick={finish} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Skip for now
        </button>
      </div>
    </main>
  );
}
