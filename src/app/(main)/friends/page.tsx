"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Users, UserPlus, UserCheck, UserX, Loader2, User, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';

interface UserResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isRequested: boolean;
}

// What the caller's relationship to this user currently is.
type FollowState = 'none' | 'following' | 'requested';

function Avatar({ user, size = 40 }: { user: Pick<UserResult, 'avatarUrl' | 'displayName' | 'username'>; size?: number }) {
  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      {user.avatarUrl
        ? <Image src={user.avatarUrl} alt={user.username} width={size} height={size} className="object-cover w-full h-full" />
        : <span className="text-primary font-bold text-sm">{initials}</span>
      }
    </div>
  );
}

function FollowButton({ username, initialState, onChange }: { username: string; initialState: FollowState; onChange: (username: string, state: FollowState) => void }) {
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<FollowState>(initialState);

  useEffect(() => { setState(initialState); }, [initialState]);

  const toggle = async () => {
    setLoading(true);
    // Following -> unfollow; Requested -> cancel the request; None -> follow.
    const method = state === 'none' ? 'POST' : 'DELETE';
    try {
      const res = await fetch(`/api/users/${username}/follow`, { method, credentials: 'include' });
      if (res.ok) {
        let next: FollowState = 'none';
        if (method === 'POST') {
          // Private accounts answer { requested: true } — that's a pending
          // request, NOT a follow. Show "Requested" until they accept.
          const json = await res.json().catch(() => null);
          next = json?.data?.requested === true ? 'requested' : 'following';
        }
        setState(next);
        onChange(username, next);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="sm"
      variant={state === 'none' ? 'default' : 'outline'}
      className="rounded-xl font-bold text-xs min-w-[90px] gap-1.5"
      onClick={toggle}
      disabled={loading}
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : state === 'following'
          ? <><UserCheck className="h-3.5 w-3.5" />Following</>
          : state === 'requested'
            ? <><Clock className="h-3.5 w-3.5" />Requested</>
            : <><UserPlus className="h-3.5 w-3.5" />Follow</>
      }
    </Button>
  );
}

function UserCard({ user, onChange }: { user: UserResult; onChange: (username: string, state: FollowState) => void }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
      <Link href={`/profile/${user.username}`} className="flex-1 flex items-center gap-3 min-w-0">
        <Avatar user={user} size={44} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-sm truncate">{user.displayName ?? user.username}</p>
            {user.isVerified && (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0">✓</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user.followersCount} follower{user.followersCount !== 1 ? 's' : ''}
          </p>
        </div>
      </Link>
      <FollowButton
        username={user.username}
        initialState={user.isFollowing ? 'following' : user.isRequested ? 'requested' : 'none'}
        onChange={onChange}
      />
    </div>
  );
}

export default function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [following, setFollowing] = useState<UserResult[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFollowing = useCallback(async () => {
    if (!user) return;
    setFollowingLoading(true);
    try {
      const res = await fetch(`/api/users/${user.username}/following?limit=50`, { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        const raw: { username: string; displayName: string | null; avatarUrl: string | null; isVerified?: boolean; followersCount?: number }[] = json.data ?? [];
        setFollowing(raw.map(u => ({
          id: '',
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          isVerified: u.isVerified ?? false,
          followersCount: u.followersCount ?? 0,
          followingCount: 0,
          isFollowing: true,
          isRequested: false,
        })));
      }
    } finally {
      setFollowingLoading(false);
    }
  }, [user]);

  useEffect(() => { loadFollowing(); }, [loadFollowing]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.data ?? []);
        } else if (res.status === 401) {
          window.location.href = '/login';
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleChange = (username: string, state: FollowState) => {
    // Update search results in-place
    setSearchResults(prev => prev.map(u => u.username === username
      ? { ...u, isFollowing: state === 'following', isRequested: state === 'requested' }
      : u));
    // Refresh following list — a pending request is NOT a follow
    if (state === 'following') {
      loadFollowing();
    } else {
      setFollowing(prev => prev.filter(u => u.username !== username));
    }
  };

  if (!authLoading && !user) {
    return (
      <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-6">
        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col gap-3">
          <div className="space-y-1">
            <p className="font-bold text-base">Join Cinephilers</p>
            <p className="text-sm text-muted-foreground">Sign up to find and follow other film lovers.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="rounded-xl font-bold"><Link href="/signup">Sign Up</Link></Button>
            <Button asChild size="sm" variant="outline" className="rounded-xl font-bold"><Link href="/login">Log In</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const showSearch = query.trim().length > 0;

  return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-6">
      <h1 className="text-3xl font-headline font-bold px-1">Find People</h1>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        {searching && (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        <Input
          placeholder="Search by username or name…"
          className="pl-10 pr-10 bg-muted border-2 border-primary/80 focus-visible:border-primary focus-visible:ring-0 h-12 rounded-2xl"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* Search results */}
      {showSearch && (
        <section className="space-y-3">
          {searchResults.length === 0 && !searching && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <div className="h-12 w-12 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No users found for &ldquo;{query}&rdquo;</p>
            </div>
          )}
          {searchResults.map(u => (
            <UserCard key={u.username} user={u} onChange={handleChange} />
          ))}
        </section>
      )}

      {/* Following list */}
      {!showSearch && (
        <section className="space-y-4">
          <h2 className="text-lg font-headline font-bold flex items-center gap-2 px-1">
            <Users className="h-5 w-5 text-primary" />
            Following
            {following.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">({following.length})</span>
            )}
          </h2>

          {followingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
                  <div className="h-11 w-11 rounded-2xl bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded-full w-1/2 animate-pulse" />
                    <div className="h-3 bg-muted rounded-full w-1/3 animate-pulse" />
                  </div>
                  <div className="h-8 w-24 rounded-xl bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          ) : following.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted border border-border flex items-center justify-center">
                <UserPlus className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold font-headline text-lg">Not following anyone yet</p>
                <p className="text-sm text-muted-foreground mt-1">Search above to find fellow film lovers</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {following.map(u => (
                <UserCard key={u.username} user={u} onChange={handleChange} />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
