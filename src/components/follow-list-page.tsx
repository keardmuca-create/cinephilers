"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2, User, MoreHorizontal, UserX, Share2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { toast } from '@/hooks/use-toast';

interface FollowUser { username: string; displayName: string | null; avatarUrl: string | null }

// One follower/following row. Owns its own three-dots menu (open state +
// click-outside), so the menu only appears for the account owner's followers.
function FollowRow({ u, canRemove, onRemove }: {
  u: FollowUser;
  canRemove: boolean;
  onRemove: (u: FollowUser) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const share = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    const url = `${window.location.origin}/profile/${u.username}`;
    try {
      if (navigator.share) await navigator.share({ title: u.displayName ?? u.username, url });
      else { await navigator.clipboard.writeText(url); toast({ title: 'Profile link copied' }); }
    } catch { /* user cancelled the share sheet */ }
  };

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuOpen(false);
    setBusy(true);
    try { await onRemove(u); } finally { setBusy(false); }
  };

  return (
    <Link
      href={`/profile/${u.username}`}
      className="flex items-center gap-3 px-2 py-4 hover:bg-muted/50 transition-colors rounded-xl"
    >
      <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
        {u.avatarUrl
          ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
          : <span className="text-primary font-bold text-sm">{(u.displayName ?? u.username).slice(0, 2).toUpperCase()}</span>
        }
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm truncate">{u.displayName ?? u.username}</p>
        <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
      </div>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); setMenuOpen(v => !v); }}
          disabled={busy}
          aria-label="Options"
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted/60 text-muted-foreground transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-50 min-w-[150px] bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <button onClick={share} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors">
              <Share2 className="h-4 w-4 text-muted-foreground" />Share profile
            </button>
            {canRemove && (
              <button onClick={remove} className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-muted/50 transition-colors text-destructive">
                <UserX className="h-4 w-4" />Remove follower
              </button>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export function FollowListPage({ type }: { type: 'followers' | 'following' }) {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { user: authUser } = useAuth();

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Only the account owner can remove people from their own followers list.
  const canRemove = type === 'followers' && !!authUser && authUser.username.toLowerCase() === username?.toLowerCase();

  const removeFollower = async (u: FollowUser) => {
    try {
      // Server first — a silently failed delete would resurrect on refresh.
      const res = await fetchWithAuth(`/api/users/${u.username}/follower`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUsers(prev => prev.filter(x => x.username !== u.username));
      toast({ title: 'Follower removed' });
    } catch {
      toast({ title: "Couldn't remove this follower — check your connection and try again.", variant: 'destructive' });
    }
  };

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
            <FollowRow key={u.username} u={u} canRemove={canRemove} onRemove={removeFollower} />
          ))}
        </div>
      )}
    </main>
  );
}
