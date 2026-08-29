"use client"

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { relativeTime } from '@/lib/activity';

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  actorId: string | null;
  actorUsername: string | null;
  targetId: string | null;
  targetLabel: string | null;
  ip: string | null;
  details: Record<string, unknown> | null;
}

// How each action reads, and which colour it carries. Permanent and destructive
// in red, reversible moderation in yellow, account security in blue — so the two
// rows that actually matter (a deletion, a lockout) are findable without reading
// the whole page.
const AUDIT_ACTIONS: Record<string, { label: string; tone: string }> = {
  USER_DELETED: { label: 'deleted account', tone: 'bg-red-500/10 text-red-400' },
  USER_SELF_DELETED: { label: 'deleted their own account', tone: 'bg-red-500/10 text-red-400' },
  COMMENT_DELETED: { label: 'deleted comment', tone: 'bg-red-500/10 text-red-400' },
  USER_BANNED: { label: 'banned', tone: 'bg-orange-500/10 text-orange-400' },
  USER_UNBANNED: { label: 'unbanned', tone: 'bg-green-500/10 text-green-400' },
  USER_ROLE_CHANGED: { label: 'changed role', tone: 'bg-yellow-500/10 text-yellow-400' },
  REVIEW_HIDDEN: { label: 'hid review', tone: 'bg-yellow-500/10 text-yellow-400' },
  REVIEW_RESTORED: { label: 'restored review', tone: 'bg-green-500/10 text-green-400' },
  PASSWORD_RESET_COMPLETED: { label: 'reset password', tone: 'bg-blue-500/10 text-blue-400' },
  LOGIN_LOCKED: { label: 'login locked', tone: 'bg-blue-500/10 text-blue-400' },
};

const ADMIN_ACTIONS = [
  'USER_DELETED', 'USER_BANNED', 'USER_UNBANNED', 'USER_ROLE_CHANGED',
  'REVIEW_HIDDEN', 'REVIEW_RESTORED', 'COMMENT_DELETED',
];
const SECURITY_ACTIONS = ['USER_SELF_DELETED', 'PASSWORD_RESET_COMPLETED', 'LOGIN_LOCKED'];

// Audit rows date themselves differently from the rest of the app.
//
// relativeTime is right for the activity feed — a social feed is about what just
// happened, and "Jun 12" is friendlier than a timestamp. But it drops the year
// and the time entirely after a week, and those are exactly what an audit row is
// consulted for: a year from now "Jun 12" cannot tell 2026 from 2027, and "was
// that reset at 3am or 3pm" is the question being asked.
//
// So: relative for the first day, when it genuinely reads better, and the full
// stamp from then on. 24-hour clock, because AM/PM is one more thing to get
// wrong in a security record.
const FULL_STAMP: Intl.DateTimeFormatOptions = {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
};

function auditTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const age = Date.now() - t.getTime();
  if (age < 24 * 60 * 60 * 1000) return relativeTime(iso);
  return t.toLocaleString('en-GB', FULL_STAMP);
}

// The exact moment, for every row including today's — hovering a fresh "1m ago"
// should still answer "at what time, exactly?" without waiting a day for it.
function exactTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleString('en-GB', FULL_STAMP);
}

/**
 * The audit log, read-only.
 *
 * There is no delete and no edit in here, and there should never be one — a log
 * the app can rewrite proves nothing. Filtering is by GROUP rather than by each
 * action separately, because the real question is almost always "what have
 * admins been doing" or "what happened to accounts", never "show me only unbans".
 */
export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<'all' | 'admin' | 'security'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWithAuth(`/api/admin/audit?page=${page}`)
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        const data: AuditRow[] = json?.data ?? [];
        // Appends from page 2 on, so "Load older" grows the list instead of
        // replacing it — reading a log means keeping the newer rows in view.
        setRows(prev => (page === 1 ? data : [...prev, ...data]));
        setTotalPages(json?.pagination?.totalPages ?? 1);
      })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  // Filtered in the browser rather than refetched: a page is 50 rows and the
  // whole table is a few hundred a year, so a round trip per chip would cost
  // more than the filter saves.
  const visible = rows.filter(r => {
    if (group === 'admin') return ADMIN_ACTIONS.includes(r.action);
    if (group === 'security') return SECURITY_ACTIONS.includes(r.action);
    return true;
  });

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['all', 'All'], ['admin', 'Admin actions'], ['security', 'Account security']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setGroup(key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${group === key ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center max-w-md mx-auto">
          Nothing logged yet. Rows appear when an account is deleted, banned or unbanned, a role
          changes, a review is hidden or restored, a comment is deleted, a password is reset, or a
          login locks out.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => {
            const meta = AUDIT_ACTIONS[r.action] ?? { label: r.action, tone: 'bg-muted text-muted-foreground' };
            const roleChange = r.action === 'USER_ROLE_CHANGED' && r.details
              ? ` (${r.details.from} → ${r.details.to})`
              : '';
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      {/* Usernames are stored on the row, not joined from User —
                          which is what makes this still read after the account it
                          names has been deleted. */}
                      <span className="font-semibold">{r.actorUsername ?? 'someone'}</span>
                      <span className={`mx-2 px-2 py-0.5 rounded-full text-xs font-semibold ${meta.tone}`}>
                        {meta.label}
                      </span>
                      {r.targetLabel && r.targetLabel !== r.actorUsername && (
                        <span className="font-semibold break-all">{r.targetLabel}</span>
                      )}
                      <span className="text-muted-foreground">{roleChange}</span>
                    </p>
                    {r.ip && <p className="text-xs text-muted-foreground mt-1">from {r.ip}</p>}
                  </div>
                  <span
                    className="text-xs text-muted-foreground whitespace-nowrap"
                    title={exactTime(r.createdAt)}
                  >
                    {auditTime(r.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {page < totalPages && (
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={loading}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load older'}
        </button>
      )}
    </div>
  );
}
