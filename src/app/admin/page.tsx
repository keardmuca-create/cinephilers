"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Trash2, Check, X, Loader2, ShieldAlert, Users, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { relativeTime } from '@/lib/activity';

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
  content: string | null;
  authorUsername: string | null;
  reporter: { id: string; username: string; displayName: string | null };
}

interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  role: string;
  createdAt: string;
  reviewsCount: number;
  ratingsCount: number;
}

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  reviewed: 'bg-green-500/10 text-green-400',
  dismissed: 'bg-white/5 text-muted-foreground',
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'reports' | 'users'>('reports');

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'dismissed'>('all');

  // Users state
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    const isAdmin = user.id === '0e4f66de-b8f9-4d0b-b176-ad31a788fd1e' || user.role === 'ADMIN';
    if (!isAdmin) { router.replace('/home'); return; }

    fetchWithAuth('/api/admin/reports')
      .then(r => r.ok ? r.json() : null)
      .then(json => setReports(json?.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, [user, authLoading, router]);

  // Load users when tab opens, then debounce search on query change
  useEffect(() => {
    if (tab !== 'users') return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    const delay = userQuery.trim() ? 400 : 0;
    searchTimeout.current = setTimeout(async () => {
      setSearchingUsers(true);
      setUsersError(null);
      try {
        const url = userQuery.trim() ? `/api/admin/users?q=${encodeURIComponent(userQuery)}` : '/api/admin/users';
        const res = await fetchWithAuth(url);
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setUsersError(`API error ${res.status}: ${json?.message ?? 'unknown'}`);
          setUserResults([]);
        } else {
          setUserResults(json?.data ?? []);
        }
      } catch (e) {
        setUsersError(`Network error: ${String(e)}`);
      } finally {
        setSearchingUsers(false);
      }
    }, delay);
  }, [userQuery, tab]);

  const dismiss = async (id: string) => {
    await fetchWithAuth('/api/admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'dismissed' }),
    });
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' } : r));
  };

  const deleteContent = async (report: Report) => {
    await fetchWithAuth('/api/admin/reports', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, targetType: report.targetType, targetId: report.targetId }),
    });
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'reviewed', content: null } : r));
  };

  const deleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      await fetchWithAuth('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      setUserResults(prev => prev.filter(u => u.id !== userId));
      setConfirmDeleteId(null);
    } finally {
      setDeletingUserId(null);
    }
  };

  if (authLoading || !user) return null;

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);
  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <main className="max-w-3xl mx-auto px-4 pt-8 pb-20 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-headline font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">{pendingCount} pending reports</p>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('reports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'reports' ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
        >
          <Flag className="h-4 w-4" /> Reports {pendingCount > 0 && <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'users' ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
        >
          <Users className="h-4 w-4" /> Users
        </button>
      </div>

      {/* Reports tab */}
      {tab === 'reports' && (
        <>
          <div className="flex gap-2">
            {(['pending', 'all', 'reviewed', 'dismissed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${filter === f ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {loadingReports && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingReports && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Flag className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-muted-foreground text-sm">No {filter === 'all' ? '' : filter} reports</p>
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(r => (
              <div key={r.id} className="bg-card border border-white/5 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_COLOURS[r.status]}`}>
                        {r.status}
                      </span>
                      <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full capitalize">{r.targetType}</span>
                      <span className="text-xs text-muted-foreground">{relativeTime(r.createdAt)}</span>
                    </div>
                    <p className="text-sm font-semibold">{r.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Reported by <strong className="text-foreground">@{r.reporter.username}</strong>
                      {r.authorUsername && <> · Content by <strong className="text-foreground">@{r.authorUsername}</strong></>}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => dismiss(r.id)}
                        title="Dismiss"
                        className="h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteContent(r)}
                        title="Delete content"
                        className="h-8 w-8 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  )}
                  {r.status !== 'pending' && (
                    <Check className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </div>

                {r.content && (
                  <div className="bg-muted/30 rounded-xl px-4 py-3">
                    <p className="text-sm text-foreground/80 italic leading-relaxed line-clamp-4">&ldquo;{r.content}&rdquo;</p>
                  </div>
                )}
                {!r.content && r.status !== 'pending' && (
                  <p className="text-xs text-muted-foreground italic">Content was deleted</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              placeholder="Search by username, name or email…"
              className="w-full bg-white/5 border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary placeholder:text-muted-foreground/60 transition-colors"
            />
            {searchingUsers && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {usersError && (
            <p className="text-center text-red-400 text-sm py-4 bg-red-500/10 rounded-2xl px-4">{usersError}</p>
          )}

          {!searchingUsers && !usersError && userResults.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Users className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-muted-foreground text-sm">{userQuery ? 'No users found' : 'No users yet'}</p>
            </div>
          )}

          <div className="space-y-3">
            {userResults.map(u => (
              <div key={u.id} className="bg-card border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-2xl bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt={u.username} className="w-full h-full object-cover" />
                        : <span className="text-primary font-bold text-sm">{(u.displayName ?? u.username).slice(0, 2).toUpperCase()}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{u.displayName ?? u.username}</p>
                      <p className="text-xs text-muted-foreground">@{u.username} · {u.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'}`}>
                          {u.role}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{u.ratingsCount} ratings · {u.reviewsCount} reviews</span>
                        <span className="text-[10px] text-muted-foreground">Joined {relativeTime(u.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {u.id !== user.id && (
                    confirmDeleteId === u.id ? (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-xs font-bold text-muted-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={deletingUserId === u.id}
                          className="px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-xs font-bold text-white transition-colors disabled:opacity-60"
                        >
                          {deletingUserId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm delete'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(u.id)}
                        className="shrink-0 h-8 w-8 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                        title="Delete account"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
