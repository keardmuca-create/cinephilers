"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, User } from 'lucide-react';

interface FollowUser { username: string; displayName: string | null; avatarUrl: string | null }

export function FollowListPage({ type }: { type: 'followers' | 'following' }) {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${username}/${type}?limit=50`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(json => setUsers(json?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username, type]);

  const label = type === 'following' ? 'Following' : 'Followers';

  return (
    <main className="max-w-xl mx-auto px-4 pt-6 pb-32 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full shrink-0" onClick={() => router.back()}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-headline font-bold">{label}</h1>
          <p className="text-sm text-muted-foreground truncate">@{username}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
          <User className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {type === 'following' ? 'Not following anyone yet' : 'No followers yet'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {users.map(u => (
            <Link
              key={u.username}
              href={`/profile/${u.username}`}
              className="flex items-center gap-3 px-2 py-4 hover:bg-muted/50 transition-colors rounded-xl"
            >
              <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                  : <span className="text-primary font-bold text-sm">{(u.displayName ?? u.username).slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{u.displayName ?? u.username}</p>
                <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
