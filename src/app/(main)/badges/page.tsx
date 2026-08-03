"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { BadgeList, type EarnedBadge } from '@/components/badge-row';

// Badges come from the server now, not from this browser's localStorage. That's
// what lets them appear on other people's profiles — and it means they read the
// same on a fresh phone as they do here.
export default function BadgesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);
  const [memberSince, setMemberSince] = useState<string | undefined>();

  useEffect(() => {
    if (!user?.username) { setBadges([]); return; }
    let cancelled = false;
    fetchWithAuth(`/api/users/${user.username}/badges`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (cancelled) return; setBadges(json?.data?.earned ?? []); setMemberSince(json?.data?.memberSince); })
      .catch(() => { if (!cancelled) setBadges([]); });
    return () => { cancelled = true; };
  }, [user]);

  const earnedCount = badges?.filter(b => b.tier).length ?? 0;

  return (
    <main className="max-w-2xl mx-auto px-6 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-headline font-bold">Badges</h1>
          {badges && (
            <p className="text-sm text-muted-foreground">
              {earnedCount} of {badges.length} earned
            </p>
          )}
        </div>
      </div>

      {!user ? (
        <p className="text-sm text-muted-foreground">Sign in to earn badges.</p>
      ) : badges === null ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3.5">
              <div className="h-14 w-14 rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <BadgeList badges={badges} memberSince={memberSince} />
      )}
    </main>
  );
}
