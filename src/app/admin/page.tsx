"use client"

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Trash2, Check, X, Loader2, ShieldAlert } from 'lucide-react';
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

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  reviewed: 'bg-green-500/10 text-green-400',
  dismissed: 'bg-white/5 text-muted-foreground',
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed' | 'dismissed'>('pending');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.role !== 'ADMIN') { router.replace('/home'); return; }

    fetchWithAuth('/api/admin/reports')
      .then(r => r.ok ? r.json() : null)
      .then(json => setReports(json?.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

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
          <h1 className="text-2xl font-headline font-bold">Admin — Reports</h1>
          <p className="text-sm text-muted-foreground">{pendingCount} pending</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['pending', 'all', 'reviewed', 'dismissed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
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
    </main>
  );
}
