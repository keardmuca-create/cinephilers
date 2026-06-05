"use client"

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { Star, Film, Eye, UserPlus, UserCheck, Loader2, Lock, User, MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { relativeTime } from '@/lib/activity';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProfileUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
  isVerified: boolean;
  ratingsCount: number;
  reviewsCount: number;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwner: boolean;
}

interface RecentItem {
  id: string;
  type: 'watched' | 'rated' | 'reviewed';
  tmdbId: string;
  mediaType: string;
  rating?: number;
  reviewBody?: string;
  createdAt: string;
  meta?: { title: string; year: string; poster: string };
}

interface FollowUser { username: string; displayName: string | null; avatarUrl: string | null }

const metaCache: Record<string, { title: string; year: string; poster: string }> = {};

async function getMeta(tmdbId: string) {
  if (metaCache[tmdbId]) return metaCache[tmdbId];
  try {
    const res = await fetch(`/api/meta/${tmdbId}`);
    if (!res.ok) return null;
    const d = await res.json();
    const m = { title: d.title ?? 'Unknown', year: d.year ?? '', poster: d.poster ?? '' };
    metaCache[tmdbId] = m;
    return m;
  } catch { return null; }
}

function Avatar({ user, size = 80 }: { user: { username: string; displayName?: string | null; avatarUrl?: string | null }; size?: number }) {
  const initials = (user.displayName ?? user.username).slice(0, 2).toUpperCase();
  return (
    <div className="rounded-3xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden" style={{ width: size, height: size }}>
      {user.avatarUrl
        ? <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
        : <span className="text-primary font-bold text-xl">{initials}</span>
      }
    </div>
  );
}

function FollowListModal({ username, type, count }: { username: string; type: 'following' | 'followers'; count: number }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${username}/${type}?limit=50`);
      if (res.ok) { const json = await res.json(); setUsers(json.data ?? []); }
    } finally { setLoading(false); }
  }, [username, type]);

  useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button onClick={() => setOpen(true)} className="flex flex-col items-center hover:opacity-70 transition-opacity">
        <span className="text-xl font-bold font-headline">{count}</span>
        <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">{type === 'following' ? 'Following' : 'Followers'}</span>
      </button>
      <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
          <DialogTitle className="font-headline">{type === 'following' ? 'Following' : 'Followers'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-6 text-center">
              <User className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{type === 'following' ? 'Not following anyone yet' : 'No followers yet'}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map(u => (
                <Link key={u.username} href={`/profile/${u.username}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-6 py-4 hover:bg-white/5 transition-colors">
                  <div className="h-10 w-10 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                    {u.avatarUrl ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" /> : <span className="text-primary font-bold text-sm">{(u.displayName ?? u.username).slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{u.displayName ?? u.username}</p>
                    <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function RecentCard({ item }: { item: RecentItem }) {
  const [meta, setMeta] = useState(item.meta ?? null);
  useEffect(() => { if (!meta) getMeta(item.tmdbId).then(m => { if (m) setMeta(m); }); }, [item.tmdbId, meta]);
  const href = item.mediaType === 'MOVIE' ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`;

  return (
    <Link href={href} className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 group">
      <div className="relative w-12 shrink-0 rounded-lg overflow-hidden bg-muted shadow-sm" style={{ aspectRatio: '2/3' }}>
        {meta?.poster ? <Image src={meta.poster} alt={meta.title ?? ''} fill className="object-cover" sizes="48px" /> : <div className="w-full h-full flex items-center justify-center"><Film className="h-4 w-4 text-muted-foreground/40" /></div>}
      </div>
      <div className="flex-1 min-w-0">
        {meta ? <p className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-1">{meta.title}</p> : <div className="h-3 bg-muted rounded-full w-3/4 animate-pulse" />}
        <div className="flex items-center gap-2 mt-1">
          {item.type === 'watched' && <span className="flex items-center gap-1 text-xs text-blue-400"><Eye className="h-3 w-3" />Watched</span>}
          {item.type === 'rated' && <span className="flex items-center gap-1 text-xs text-yellow-400"><Star className="h-3 w-3 fill-current" />{item.rating}/10</span>}
          {item.type === 'reviewed' && <span className="flex items-center gap-1 text-xs text-green-400"><MessageSquare className="h-3 w-3" />Reviewed</span>}
          <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { user: me } = useAuth();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentItem[]>([]);
  const [followLoading, setFollowLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    const res = await fetchWithAuth(`/api/users/${username}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    if (!res.ok) { setLoading(false); return; }
    const json = await res.json();
    const p: ProfileUser = json.data;

    // Redirect to own profile page
    if (p.isOwner) { router.replace('/profile'); return; }

    setProfile(p);
    setLoading(false);

    // Load recent activity if profile is visible
    if (!p.isPrivate || p.isFollowing) {
      loadActivity(p.id, p.username);
    }
  }, [username, router]);

  const loadActivity = async (userId: string, uname: string) => {
    try {
      const [watchedRes, ratingsRes] = await Promise.all([
        fetch(`/api/users/${uname}/watched?limit=5`),
        fetch(`/api/users/${uname}/ratings?limit=5`),
      ]);
      const items: RecentItem[] = [];
      if (watchedRes.ok) {
        const d = await watchedRes.json();
        for (const w of (d.data ?? [])) {
          items.push({ id: `w-${w.id ?? w.tmdbId}`, type: 'watched', tmdbId: w.tmdbId, mediaType: w.mediaType, createdAt: w.watchedAt ?? w.addedAt ?? new Date().toISOString() });
        }
      }
      if (ratingsRes.ok) {
        const d = await ratingsRes.json();
        for (const r of (d.data ?? [])) {
          items.push({ id: `r-${r.id ?? r.tmdbId}`, type: 'rated', tmdbId: r.tmdbId, mediaType: r.mediaType, rating: r.score, createdAt: r.updatedAt ?? r.createdAt ?? new Date().toISOString() });
        }
      }
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRecentActivity(items.slice(0, 6));
    } catch { /* ignore */ }
  };

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const toggleFollow = async () => {
    if (!profile) return;
    setFollowLoading(true);
    const method = profile.isFollowing ? 'DELETE' : 'POST';
    const res = await fetch(`/api/users/${profile.username}/follow`, { method, credentials: 'include' });
    if (res.ok) {
      const nowFollowing = !profile.isFollowing;
      setProfile(p => p ? ({
        ...p,
        isFollowing: nowFollowing,
        followersCount: p.followersCount + (nowFollowing ? 1 : -1),
      }) : p);
    }
    setFollowLoading(false);
  };

  if (loading) return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-6">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 rounded-3xl bg-muted animate-pulse shrink-0" />
        <div className="flex-1 space-y-3 pt-2">
          <div className="h-5 bg-muted rounded-full w-1/2 animate-pulse" />
          <div className="h-4 bg-muted rounded-full w-1/3 animate-pulse" />
          <div className="h-8 bg-muted rounded-xl w-24 animate-pulse" />
        </div>
      </div>
    </main>
  );

  if (notFound || !profile) return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 flex flex-col items-center justify-center gap-4 text-center py-32">
      <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
        <User className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-bold font-headline text-lg">User not found</p>
        <p className="text-sm text-muted-foreground mt-1">@{username} doesn&apos;t exist</p>
      </div>
      <Button asChild variant="outline" className="rounded-xl"><Link href="/friends">Find People</Link></Button>
    </main>
  );

  const isVisible = !profile.isPrivate || profile.isFollowing;

  return (
    <main className="max-w-xl mx-auto px-4 pt-10 pb-32 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Avatar user={profile} size={80} />
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-headline truncate">{profile.displayName ?? profile.username}</h1>
              {profile.isVerified && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold shrink-0">✓</span>}
              {profile.isPrivate && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            </div>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          </div>
          {profile.bio && isVisible && <p className="text-sm text-foreground/80 leading-relaxed">{profile.bio}</p>}
          {me && (
            <Button
              size="sm"
              variant={profile.isFollowing ? 'outline' : 'default'}
              className="rounded-xl font-bold gap-1.5"
              onClick={toggleFollow}
              disabled={followLoading}
            >
              {followLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : profile.isFollowing
                  ? <><UserCheck className="h-3.5 w-3.5" />Following</>
                  : <><UserPlus className="h-3.5 w-3.5" />Follow</>
              }
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {isVisible && (
        <div className="flex gap-8">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold font-headline">{profile.ratingsCount}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Ratings</span>
          </div>
          <FollowListModal username={profile.username} type="following" count={profile.followingCount} />
          <FollowListModal username={profile.username} type="followers" count={profile.followersCount} />
        </div>
      )}

      {/* Private lock */}
      {profile.isPrivate && !profile.isFollowing && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center border border-white/10 rounded-3xl bg-white/5">
          <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-bold font-headline text-lg">This account is private</p>
            <p className="text-sm text-muted-foreground mt-1">Follow to see their ratings and activity</p>
          </div>
        </div>
      )}

      {/* Recent activity */}
      {isVisible && recentActivity.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-headline font-bold flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />Recent Activity
          </h2>
          <div className="bg-card rounded-3xl border border-white/5 px-5 py-2">
            {recentActivity.map(item => <RecentCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {/* Empty activity */}
      {isVisible && recentActivity.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Film className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No activity yet</p>
        </div>
      )}
    </main>
  );
}
