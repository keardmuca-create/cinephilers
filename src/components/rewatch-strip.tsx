"use client"

import { useCallback, useEffect, useState } from 'react';
import { Repeat, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import { toast } from '@/hooks/use-toast';

/** One viewing. An episode watched once and never logged has a stand-in first
 *  watch with no id — there is no entry behind it to delete. */
interface WatchDate { id: string | null; isRewatch: boolean; watchedAt: string }

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "Seen 2× · last Sep 11" with Log rewatch, a backdate and undo — and, tapping
// the count, every date it stands for. Shared by the film and episode pages so the
// two cannot drift apart. The parent renders it only for a signed-in viewer with
// the title marked watched; unmounting is what resets it.
//
// Server-only data, like the diary everywhere else: never mirrored to localStorage.
export function RewatchStrip({ tmdbId, mediaType }: { tmdbId: string; mediaType: 'MOVIE' | 'SHOW' }) {
  const [seenCount, setSeenCount] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [date, setDate] = useState('');
  const [lastLoggedEventId, setLastLoggedEventId] = useState<string | null>(null);
  const [datesOpen, setDatesOpen] = useState(false);
  /** Null until fetched — the list is only asked for once it is opened. */
  const [dates, setDates] = useState<WatchDate[] | null>(null);

  const query = `tmdbId=${encodeURIComponent(tmdbId)}&mediaType=${mediaType}`;

  const loadSummary = useCallback(() => {
    fetchWithAuth(`/api/diary?${query}&limit=1`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json?.data) return;
        setSeenCount(json.data.total ?? null);
        setLastSeenAt(json.data.items?.[0]?.watchedAt ?? null);
      })
      .catch(() => { /* ignore */ });
  }, [query]);

  const loadDates = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/diary?${query}&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDates(json.data?.items ?? []);
    } catch {
      setDatesOpen(false);
      toast({ title: "Couldn't load the dates. Check your connection.", variant: 'destructive' });
    }
  }, [query]);

  useEffect(() => {
    setSeenCount(null);
    setLastSeenAt(null);
    setDates(null);
    setDatesOpen(false);
    setLastLoggedEventId(null);
    loadSummary();
  }, [loadSummary]);

  // Any change to the entries: the count and last date come back from the server,
  // and an open list is fetched again rather than patched — deleting a first watch
  // turns the next one into the first watch, which only the server knows.
  const refresh = () => {
    loadSummary();
    setDates(null);
    if (datesOpen) void loadDates();
  };

  const toggleDates = () => {
    const next = !datesOpen;
    setDatesOpen(next);
    if (next && dates === null) void loadDates();
  };

  // Every tap is a new viewing — an event, not a toggle.
  const logRewatch = async (dateStr?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId,
          mediaType,
          ...(dateStr ? { watchedAt: new Date(`${dateStr}T12:00:00`).toISOString() } : {}),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLastLoggedEventId(json.data?.event?.id ?? null);
      setDateOpen(false);
      setDate('');
      refresh();
      toast({ title: 'Rewatch logged' });
    } catch {
      toast({ title: "Couldn't log the rewatch. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async (id: string, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetchWithAuth(`/api/diary/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (id === lastLoggedEventId) setLastLoggedEventId(null);
      refresh();
      toast({ title: message });
    } catch {
      toast({ title: "Couldn't remove it. Check your connection and try again.", variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  // A date can be deleted only while at least two remain. A film's last entry is
  // its watched record — deleting it un-marks the film — and that belongs to the
  // Watched button, which also tidies this device.
  const canDelete = (dates?.length ?? 0) >= 2;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-semibold">
          <Repeat className="h-4 w-4 text-primary" />
          {seenCount !== null && seenCount > 0 ? (
            <button
              type="button"
              onClick={toggleDates}
              aria-expanded={datesOpen}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <span>
                Seen {seenCount}&times;
                {lastSeenAt && <> &middot; last {fmtDate(lastSeenAt)}</>}
              </span>
              {datesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span>Watched it again?</span>
          )}
        </div>
        {!dateOpen ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              className="rounded-full font-bold border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => logRewatch()}
            >
              <Repeat className="h-3.5 w-3.5 mr-1.5" />
              Log rewatch
            </Button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => { setDate(new Date().toISOString().slice(0, 10)); setDateOpen(true); }}
            >
              another date?
            </button>
            {lastLoggedEventId && (
              <button
                className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
                disabled={busy}
                onClick={() => removeEntry(lastLoggedEventId, 'Rewatch removed')}
              >
                undo
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              className="h-8 rounded-full border border-border bg-background px-3 text-xs font-semibold"
            />
            <Button
              size="sm"
              disabled={busy || !date}
              className="rounded-full font-bold"
              onClick={() => logRewatch(date)}
            >
              Log
            </Button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setDateOpen(false)}
            >
              cancel
            </button>
          </div>
        )}
      </div>

      {/* Every date the count stands for, newest first — the Rewatched page's list. */}
      {datesOpen && (
        <div className="ml-2 border-l-2 border-primary/20 pl-4 space-y-1">
          {dates === null ? (
            <p className="text-xs text-muted-foreground">Loading dates…</p>
          ) : (
            dates.map((d, i) => (
              <div key={d.id ?? `first-${i}`} className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-foreground">{fmtDate(d.watchedAt)}</span>
                {d.isRewatch ? (
                  <span className="text-primary font-bold flex items-center gap-1"><Repeat className="h-3 w-3" /> Rewatch</span>
                ) : (
                  <span className="text-muted-foreground">First watch</span>
                )}
                {d.id && canDelete && (
                  <button
                    onClick={() => removeEntry(d.id!, 'Entry removed')}
                    disabled={busy}
                    aria-label={`Remove the ${fmtDate(d.watchedAt)} entry`}
                    className="p-1 rounded-full text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
