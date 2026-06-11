"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readUserStats, computeAllBadges, ensureSignupDate, ComputedBadge } from '@/lib/badges';
import { BadgeCard, FeaturedSeasonalBadge, TierGuide } from '@/components/badge-card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

export default function BadgesPage() {
  const router = useRouter();
  const [badges, setBadges] = useState<ComputedBadge[]>([]);

  useEffect(() => {
    ensureSignupDate();
    setBadges(computeAllBadges(readUserStats()));
  }, []);

  const activeSeasonal = badges.filter(b => b.isSeasonal && b.isSeasonActive);
  const allTime = badges.filter(b => !b.isSeasonal);
  const otherSeasonal = badges.filter(b => b.isSeasonal && !b.isSeasonActive);

  return (
    <main className="max-w-2xl mx-auto px-6 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-headline font-bold">Badges &amp; Achievements</h1>
      </div>

      <TierGuide />

      {activeSeasonal.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Seasonal</p>
          {activeSeasonal.map(badge => (
            <FeaturedSeasonalBadge key={badge.id} badge={badge} />
          ))}
        </div>
      )}

      {allTime.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Time</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {allTime.map(badge => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </div>
      )}

      {otherSeasonal.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Upcoming Seasonal</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {otherSeasonal.map(badge => (
              <BadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
