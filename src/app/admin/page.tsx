"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Trash2, Check, X, Loader2, ShieldAlert, Users, Search, Ban, ShieldCheck, ChevronUp, ChevronDown, Database, RotateCcw, Mail } from 'lucide-react';
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
  hidden?: boolean; // review soft-removed (restorable)
  reporter: { id: string; username: string; displayName: string | null };
}

interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
  reviewsCount: number;
  ratingsCount: number;
}

interface AdminStats {
  totalUsers: number;
  bannedUsers: number;
}

interface DbSize {
  total: string;
  totalBytes: number;
  used: string;
  usedBytes: number;
  tables: { name: string; size: string; bytes: number }[];
}

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  reviewed: 'bg-green-500/10 text-green-400',
  dismissed: 'bg-muted text-muted-foreground',
};

// Answering a support request as Cinephilers.
//
// Gmail sends as whoever owns the mailbox, so replying there gave users a
// personal name and address back from an app they'd written to. Its "send mail
// as" feature is the usual fix and it rejected every SMTP relay we tried. This
// sends through the same Resend API the app already uses for every other email —
// no relay, no third-party signup.
//
// Paste-in rather than an inbox on purpose: the notification email already has
// the sender's address in it, and a stored-and-threaded support system is a day's
// work for something that might see three messages a month. If it ever gets busy,
// that's the moment to build the inbox.
function SupportReply() {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async () => {
    if (sending || !to.trim() || !subject.trim() || !message.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetchWithAuth('/api/admin/support-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), message: message.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setResult({ ok: false, text: json?.error ?? "Couldn't send the reply." });
      } else {
        setResult({ ok: true, text: `Sent to ${to.trim()}` });
        setSubject('');
        setMessage('');
        setTo('');
      }
    } catch {
      setResult({ ok: false, text: 'Network error. Check your connection.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Goes out as <span className="font-semibold text-foreground">Cinephilers &lt;support@cinephilers.app&gt;</span>.
        Replies come back to that address and forward to your inbox.
      </p>

      <div className="space-y-3">
        <input
          type="email"
          value={to}
          onChange={e => setTo(e.target.value)}
          placeholder="Their email address"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject — e.g. Re: actors profiles"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Your reply"
          rows={8}
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={send}
          disabled={sending || !to.trim() || !subject.trim() || !message.trim()}
          className="flex items-center gap-2 rounded-full bg-primary text-white px-5 py-2.5 text-sm font-bold disabled:opacity-40 transition-opacity"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {sending ? 'Sending…' : 'Send reply'}
        </button>
        {result && (
          <span className={`text-sm font-semibold ${result.ok ? 'text-green-500' : 'text-destructive'}`}>
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'reports' | 'users' | 'support'>('reports');

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'dismissed'>('all');

  // Users state
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [dbSize, setDbSize] = useState<DbSize | null>(null);

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

    fetchWithAuth('/api/admin/stats')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setStats(json.data); })
      .catch(() => {});

    fetchWithAuth('/api/admin/db-size')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.data) setDbSize(json.data); })
      .catch(() => {});
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
    // Reviews are soft-removed (kept, hidden → restorable); comments are gone.
    setReports(prev => prev.map(r => r.id === report.id
      ? report.targetType === 'review'
        ? { ...r, status: 'reviewed', hidden: true }
        : { ...r, status: 'reviewed', content: null }
      : r));
  };

  const restoreContent = async (report: Report) => {
    await fetchWithAuth('/api/admin/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.id, targetType: report.targetType, targetId: report.targetId }),
    });
    setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'dismissed', hidden: false } : r));
  };


  const userAction = async (userId: string, action: 'ban' | 'unban' | 'promote' | 'demote') => {
    setActionLoadingId(userId);
    try {
      await fetchWithAuth('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      setUserResults(prev => prev.map(u => {
        if (u.id !== userId) return u;
        if (action === 'ban') return { ...u, isBanned: true };
        if (action === 'unban') return { ...u, isBanned: false };
        if (action === 'promote') return { ...u, role: 'ADMIN' };
        if (action === 'demote') return { ...u, role: 'USER' };
        return u;
      }));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Permanent, irreversible: hard-deletes the account and cascades all their
  // data (ratings, reviews, watchlist, etc.). Double-confirm by username so a
  // mis-click can't wipe a real account.
  //
  // The native confirm/prompt/alert are DELIBERATE and the only ones left in the
  // app — everywhere else now uses <ConfirmProvider>. This is the single action
  // nothing can undo, it lives behind a door only an admin opens, and a dialog
  // that stops the world and can't be dismissed by tapping past it is the right
  // shape for it. Converting only part of the flow would be worse than either
  // end of the choice, so the whole flow stays native or none of it does.
  const deleteUser = async (u: AdminUser) => {
    const name = u.username;
    if (!window.confirm(`Permanently delete @${name} and ALL their data? This cannot be undone.`)) return;
    const typed = window.prompt(`Type the username "${name}" to confirm deletion:`);
    if (typed?.trim() !== name) {
      if (typed !== null) window.alert('Username did not match — deletion cancelled.');
      return;
    }
    setActionLoadingId(u.id);
    try {
      const res = await fetchWithAuth('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id }),
      });
      if (res.ok) {
        setUserResults(prev => prev.filter(x => x.id !== u.id));
      } else {
        window.alert('Could not delete this account.');
      }
    } finally {
      setActionLoadingId(null);
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

      {/* Stats overview */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Total Users', value: stats.totalUsers, icon: <Users className="h-4 w-4" /> },
            { label: 'Banned', value: stats.bannedUsers, icon: <Ban className="h-4 w-4" /> },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">{s.icon}</div>
              <div>
                <p className="text-lg font-bold leading-tight">{s.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Database storage */}
      {dbSize && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-bold leading-tight">{dbSize.used} <span className="text-muted-foreground font-normal">/ {dbSize.total}</span></p>
              <p className="text-xs text-muted-foreground">App data (all users) / total database size</p>
            </div>
          </div>
          {dbSize.tables.length > 0 && (
            <div className="space-y-1.5">
              {dbSize.tables.map(t => {
                const pct = dbSize.totalBytes > 0 ? (t.bytes / dbSize.totalBytes) * 100 : 0;
                return (
                  <div key={t.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-muted-foreground shrink-0">{t.size}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('reports')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'reports' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          <Flag className="h-4 w-4" /> Reports {pendingCount > 0 && <span className="bg-foreground/10 text-xs px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'users' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          <Users className="h-4 w-4" /> Users
        </button>
        <button
          onClick={() => setTab('support')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'support' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
        >
          <Mail className="h-4 w-4" /> Support
        </button>
      </div>

      {tab === 'support' && <SupportReply />}

      {/* Reports tab */}
      {tab === 'reports' && (
        <>
          <div className="flex gap-2">
            {(['pending', 'all', 'reviewed', 'dismissed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${filter === f ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
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
              <div key={r.id} className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_COLOURS[r.status]}`}>
                        {r.status}
                      </span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full capitalize">{r.targetType}</span>
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
                        className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => deleteContent(r)}
                        title="Remove content"
                        className="h-8 w-8 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  )}
                  {/* Restore a soft-removed review (undo a removal) */}
                  {r.status !== 'pending' && r.targetType === 'review' && r.hidden && (
                    <button
                      onClick={() => restoreContent(r)}
                      title="Restore review"
                      className="h-8 px-3 rounded-full bg-green-500/10 hover:bg-green-500/20 flex items-center gap-1.5 shrink-0 transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-green-400" />
                      <span className="text-xs font-semibold text-green-400">Restore</span>
                    </button>
                  )}
                  {r.status !== 'pending' && !(r.targetType === 'review' && r.hidden) && (
                    <Check className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </div>

                {r.content && (
                  <div className="bg-muted/30 rounded-xl px-4 py-3">
                    {r.hidden && (
                      <p className="text-[11px] font-bold uppercase tracking-wider text-red-400/80 mb-1.5">Removed — hidden from users</p>
                    )}
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
              className="w-full bg-muted border-2 border-primary/80 rounded-2xl pl-10 pr-4 py-3 text-sm outline-none focus:border-primary placeholder:text-muted-foreground/60 transition-colors"
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
              <div key={u.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
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
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${u.role === 'ADMIN' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {u.role}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{u.ratingsCount} ratings · {u.reviewsCount} reviews</span>
                        <span className="text-[10px] text-muted-foreground">Joined {relativeTime(u.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {u.id !== user.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Ban / Unban */}
                      <button
                        onClick={() => userAction(u.id, u.isBanned ? 'unban' : 'ban')}
                        disabled={actionLoadingId === u.id}
                        title={u.isBanned ? 'Unban user' : 'Ban user'}
                        className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${u.isBanned ? 'bg-green-500/10 hover:bg-green-500/20' : 'bg-orange-500/10 hover:bg-orange-500/20'}`}
                      >
                        {actionLoadingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.isBanned ? <ShieldCheck className="h-4 w-4 text-green-400" /> : <Ban className="h-4 w-4 text-orange-400" />}
                      </button>

                      {/* Promote / Demote */}
                      <button
                        onClick={() => userAction(u.id, u.role === 'ADMIN' ? 'demote' : 'promote')}
                        disabled={actionLoadingId === u.id}
                        title={u.role === 'ADMIN' ? 'Demote to user' : 'Promote to admin'}
                        className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 ${u.role === 'ADMIN' ? 'bg-yellow-500/10 hover:bg-yellow-500/20' : 'bg-primary/10 hover:bg-primary/20'}`}
                      >
                        {u.role === 'ADMIN' ? <ChevronDown className="h-4 w-4 text-yellow-400" /> : <ChevronUp className="h-4 w-4 text-primary" />}
                      </button>

                      {/* Delete account (permanent, cascades all their data) */}
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={actionLoadingId === u.id}
                        title="Delete account permanently"
                        className="h-8 w-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-60 bg-red-500/10 hover:bg-red-500/20"
                      >
                        {actionLoadingId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-400" /> : <Trash2 className="h-4 w-4 text-red-400" />}
                      </button>
                    </div>
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
