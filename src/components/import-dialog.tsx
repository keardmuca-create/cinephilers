"use client"

import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { X, Upload, Loader2, CheckCircle, AlertCircle, ChevronRight, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/fetch-with-auth';
import type { WatchEntry } from '@/lib/badges';

type Platform = 'letterboxd' | 'imdb';
type Step = 'pick' | 'upload' | 'matching' | 'confirm' | 'importing' | 'done';

interface ParsedItem {
  title: string;
  year: string;
  rating?: number;      // 1-10
  review?: string;
  watchedAt?: string;
  inWatchlist?: boolean;
}

interface MatchedItem extends ParsedItem {
  tmdbId: string;
  mediaType: 'MOVIE' | 'SHOW';
  matchedTitle: string;
  poster: string | null;
  language: string;
  tmdbRating?: number;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function parseLetterboxd(file: File): Promise<ParsedItem[]> {
  const zip = await JSZip.loadAsync(file);
  const items = new Map<string, ParsedItem>();

  const getCSV = async (name: string) => {
    const f = zip.file(name) ?? zip.file(name.replace('.csv', '').concat('.csv'));
    if (!f) return [];
    const text = await f.async('string');
    return parseCSV(text);
  };

  // Watched
  const watched = await getCSV('watched.csv');
  for (const row of watched) {
    const key = `${row['Name']}|${row['Year']}`;
    items.set(key, {
      title: row['Name'] ?? '',
      year: row['Year'] ?? '',
      watchedAt: row['Date'] ? new Date(row['Date']).toISOString() : new Date().toISOString(),
      ...(items.get(key) ?? {}),
    });
  }

  // Ratings (0.5–5 → ×2 = 1–10)
  const ratings = await getCSV('ratings.csv');
  for (const row of ratings) {
    const key = `${row['Name']}|${row['Year']}`;
    const stars = parseFloat(row['Rating'] ?? '0');
    const score = stars > 0 ? Math.round(stars * 2) : undefined;
    const existing = items.get(key) ?? { title: row['Name'] ?? '', year: row['Year'] ?? '' };
    items.set(key, { ...existing, rating: score, watchedAt: existing.watchedAt ?? new Date(row['Date'] ?? Date.now()).toISOString() });
  }

  // Watchlist
  const watchlist = await getCSV('watchlist.csv');
  for (const row of watchlist) {
    const key = `${row['Name']}|${row['Year']}`;
    const existing = items.get(key) ?? { title: row['Name'] ?? '', year: row['Year'] ?? '' };
    items.set(key, { ...existing, inWatchlist: true });
  }

  // Reviews
  const reviews = await getCSV('reviews.csv');
  for (const row of reviews) {
    const key = `${row['Name']}|${row['Year']}`;
    const stars = parseFloat(row['Rating'] ?? '0');
    const score = stars > 0 ? Math.round(stars * 2) : undefined;
    const existing = items.get(key) ?? { title: row['Name'] ?? '', year: row['Year'] ?? '' };
    items.set(key, {
      ...existing,
      review: row['Review'] || existing.review,
      rating: score ?? existing.rating,
      watchedAt: existing.watchedAt ?? (row['Watched Date'] ? new Date(row['Watched Date']).toISOString() : new Date().toISOString()),
    });
  }

  return Array.from(items.values()).filter(i => i.title);
}

async function parseIMDb(file: File): Promise<ParsedItem[]> {
  const text = await file.text();
  const rows = parseCSV(text);
  const items: ParsedItem[] = [];

  for (const row of rows) {
    const title = row['Title'] ?? row['title'] ?? '';
    const year = row['Year'] ?? row['year'] ?? '';
    const yourRating = parseInt(row['Your Rating'] ?? row['your_rating'] ?? '0', 10);
    const titleType = (row['Title Type'] ?? row['title_type'] ?? '').toLowerCase();
    if (!title) continue;

    // Skip TV episodes
    if (titleType === 'tvepisode') continue;

    items.push({
      title,
      year,
      rating: yourRating >= 1 && yourRating <= 10 ? yourRating : undefined,
      watchedAt: yourRating >= 1 ? (row['Created'] ? new Date(row['Created']).toISOString() : new Date().toISOString()) : undefined,
      inWatchlist: !yourRating,
    });
  }

  return items;
}

async function matchToTMDB(item: ParsedItem, typeHint?: 'movie' | 'tv'): Promise<MatchedItem | null> {
  try {
    const params = new URLSearchParams({ q: item.title });
    if (item.year) params.set('year', item.year);
    if (typeHint) params.set('type', typeHint);
    const res = await fetch(`/api/tmdb/search?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    return { ...item, tmdbId: json.data.tmdbId, mediaType: json.data.mediaType, matchedTitle: json.data.title, poster: json.data.poster, language: json.data.language ?? '', tmdbRating: json.data.rating };
  } catch {
    return null;
  }
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [matched, setMatched] = useState<MatchedItem[]>([]);
  const [unmatched, setUnmatched] = useState<ParsedItem[]>([]);
  const [matchProgress, setMatchProgress] = useState(0);
  const [result, setResult] = useState<{ watchedAdded: number; ratingsAdded: number; watchlistAdded: number; reviewsAdded: number; failed?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareActivity, setShareActivity] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const items = platform === 'letterboxd' ? await parseLetterboxd(file) : await parseIMDb(file);
      if (items.length === 0) { setError('No films found in this file. Make sure you uploaded the right file.'); return; }
      setParsed(items);
      setStep('matching');
      // Refresh token before the slow TMDB matching phase
      await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});

      // Match to TMDB — 5 concurrent
      // Letterboxd is movies-only; force movie search to prevent wrong TV matches
      const typeHint: 'movie' | undefined = platform === 'letterboxd' ? 'movie' : undefined;
      const matchedList: MatchedItem[] = [];
      const unmatchedList: ParsedItem[] = [];
      const CONCURRENCY = 5;

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const batch = items.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(item => matchToTMDB(item, typeHint)));
        results.forEach((r, idx) => {
          if (r) matchedList.push(r);
          else unmatchedList.push(batch[idx]);
        });
        setMatchProgress(Math.min(i + CONCURRENCY, items.length));
      }

      setMatched(matchedList);
      setUnmatched(unmatchedList);
      setStep('confirm');
    } catch (e) {
      setError(`Failed to read file: ${String(e)}`);
    }
  };

  const runImport = async () => {
    setStep('importing');
    // Refresh token first so a long matching step can't cause a mid-import logout
    await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});
    try {
      const res = await fetchWithAuth('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: matched }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json?.message ?? 'Import failed'); setStep('confirm'); return; }

      // Write metadata to localStorage so pages can render imported items immediately
      try {
        for (const item of matched) {
          const meta = { id: item.tmdbId, title: item.matchedTitle, poster: item.poster ?? '', year: item.year, type: item.mediaType === 'SHOW' ? 'show' : 'movie', language: item.language, tmdbRating: item.tmdbRating };
          localStorage.setItem(`meta-${item.tmdbId}`, JSON.stringify(meta));
          if (item.watchedAt) localStorage.setItem(`watched-${item.tmdbId}`, 'true');
          if (item.inWatchlist) localStorage.setItem(`watchlist-${item.tmdbId}`, JSON.stringify({ id: item.tmdbId, title: item.matchedTitle, poster: item.poster ?? '', year: item.year, type: meta.type }));
          if (item.rating) localStorage.setItem(`movie-rating-${item.tmdbId}`, String(item.rating));
        }

        // Append watched movies to the badge watch-log so badges like World Cinema count them.
        // Entries may already exist without a language (login sync rebuilds the log from the
        // DB, which doesn't store languages) — backfill those instead of skipping them.
        // hour is fixed to 12 so a late-night import doesn't falsely earn the Night Owl badge.
        const log: WatchEntry[] = JSON.parse(localStorage.getItem('watch-log') ?? '[]');
        const byId = new Map(log.filter(e => e.type === 'movie').map(e => [e.id, e]));
        for (const item of matched) {
          if (item.mediaType !== 'MOVIE' || !item.language) continue;
          const existing = byId.get(item.tmdbId);
          if (existing) {
            if (!existing.language) existing.language = item.language;
          } else if (item.watchedAt) {
            const entry: WatchEntry = { id: item.tmdbId, type: 'movie', loggedAt: item.watchedAt, hour: 12, genre: '', language: item.language, source: 'import' };
            log.push(entry);
            byId.set(item.tmdbId, entry);
          }
        }
        localStorage.setItem('watch-log', JSON.stringify(log));
      } catch { /* ignore */ }

      setResult(json.data);

      if (shareActivity && matched.length > 0) {
        fetchWithAuth('/api/import-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, count: matched.length }),
        }).catch(() => {});
      }

      setStep('done');
    } catch {
      setError('Import failed. Please try again.');
      setStep('confirm');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <h2 className="text-lg font-headline font-bold">Import Data</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6">

          {/* Step: Pick platform */}
          {step === 'pick' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Choose where you want to import from:</p>
              <button
                onClick={() => { setPlatform('letterboxd'); setStep('upload'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-muted hover:bg-muted/80 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                  <span className="text-orange-400 font-black text-lg">L</span>
                </div>
                <div>
                  <p className="font-bold text-sm">Letterboxd</p>
                  <p className="text-xs text-muted-foreground">Watched, ratings, watchlist & reviews</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </button>
              <button
                onClick={() => { setPlatform('imdb'); setStep('upload'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-muted hover:bg-muted/80 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-xl bg-yellow-500/20 flex items-center justify-center shrink-0">
                  <span className="text-yellow-400 font-black text-lg">i</span>
                </div>
                <div>
                  <p className="font-bold text-sm">IMDb</p>
                  <p className="text-xs text-muted-foreground">Ratings & watchlist</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </button>
            </div>
          )}

          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <button onClick={() => setStep('pick')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>

              {platform === 'letterboxd' ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="font-bold text-foreground">How to export from Letterboxd:</p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    <li>Go to letterboxd.com and log in</li>
                    <li>Click your profile → Settings</li>
                    <li>Scroll to <strong className="text-foreground">Data</strong> → click <strong className="text-foreground">Export Your Data</strong></li>
                    <li>Download the ZIP file and upload it here</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="font-bold text-foreground">How to export from IMDb:</p>
                  <ol className="space-y-1.5 list-decimal list-inside">
                    <li>Go to imdb.com and log in</li>
                    <li>Open your <strong className="text-foreground">Ratings</strong> list (or Watchlist)</li>
                    <li>Click the <strong className="text-foreground">…</strong> menu → <strong className="text-foreground">Export</strong></li>
                    <li>Download the CSV and upload it here</li>
                  </ol>
                </div>
              )}

              {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}

              <input
                ref={fileRef}
                type="file"
                accept={platform === 'letterboxd' ? '.zip' : '.csv'}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-border hover:border-primary/60 rounded-2xl p-8 flex flex-col items-center gap-3 transition-colors"
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-bold">Click to upload</p>
                  <p className="text-xs text-muted-foreground">{platform === 'letterboxd' ? 'ZIP file from Letterboxd' : 'CSV file from IMDb'}</p>
                </div>
              </button>
            </div>
          )}

          {/* Step: Matching */}
          {step === 'matching' && (
            <div className="space-y-5 py-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div>
                <p className="font-bold">Matching films…</p>
                <p className="text-sm text-muted-foreground mt-1">{matchProgress} / {parsed.length} processed</p>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${parsed.length > 0 ? (matchProgress / parsed.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">This may take a minute for large libraries</p>
            </div>
          )}

          {/* Step: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Watched', value: matched.filter(m => m.watchedAt).length },
                  { label: 'Ratings', value: matched.filter(m => m.rating).length },
                  { label: 'Watchlist', value: matched.filter(m => m.inWatchlist).length },
                  { label: 'Reviews', value: matched.filter(m => m.review).length },
                ].map(s => (
                  <div key={s.label} className="bg-muted rounded-2xl p-4 text-center">
                    <p className="text-2xl font-black text-primary">{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {unmatched.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-yellow-400 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {unmatched.length} film{unmatched.length !== 1 ? 's' : ''} couldn&apos;t be matched
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {unmatched.map((u, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        {u.title}{u.year ? ` (${u.year})` : ''}
                      </p>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">You can add these manually by searching for them.</p>
                </div>
              )}

              {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}

              {matched.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No films could be matched. Try a different file.</p>
              ) : (
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shareActivity}
                      onChange={e => setShareActivity(e.target.checked)}
                      className="h-4 w-4 rounded accent-primary"
                    />
                    <span className="text-sm text-muted-foreground">Share this import in my activity feed</span>
                  </label>
                  <Button className="w-full rounded-2xl h-12 font-bold" onClick={runImport}>
                    Import {matched.length} film{matched.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="space-y-4 py-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="font-bold">Importing your data…</p>
              <p className="text-sm text-muted-foreground">Please don&apos;t close this window</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="space-y-5">
              <div className="text-center py-2">
                <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                <p className="font-headline font-bold text-xl">Import complete!</p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Films marked as watched', value: result.watchedAdded },
                  { label: 'Ratings imported', value: result.ratingsAdded },
                  { label: 'Added to watchlist', value: result.watchlistAdded },
                  { label: 'Reviews imported', value: result.reviewsAdded },
                ].filter(s => s.value > 0).map(s => (
                  <div key={s.label} className="flex items-center justify-between px-4 py-3 bg-muted rounded-2xl">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-bold text-primary">+{s.value}</p>
                  </div>
                ))}
                {result.watchedAdded === 0 && result.ratingsAdded === 0 && result.watchlistAdded === 0 && result.reviewsAdded === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">Everything was already in your library — nothing new to add.</p>
                )}
              </div>
              {(result.failed ?? 0) > 0 && (
                <div className="bg-red-500/10 rounded-2xl px-4 py-3">
                  <p className="text-xs text-red-400 font-bold">{result.failed} item{result.failed !== 1 ? 's' : ''} could not be saved</p>
                  <p className="text-xs text-muted-foreground mt-1">Something went wrong saving these to your account. Try importing again — items already saved will be skipped automatically.</p>
                </div>
              )}
              {unmatched.length > 0 && (
                <div className="bg-yellow-500/10 rounded-2xl px-4 py-3">
                  <p className="text-xs text-yellow-400 font-bold">{unmatched.length} unmatched film{unmatched.length !== 1 ? 's' : ''}</p>
                  <div className="mt-1 max-h-24 overflow-y-auto">
                    {unmatched.map((u, i) => (
                      <p key={i} className="text-xs text-muted-foreground">{u.title}{u.year ? ` (${u.year})` : ''}</p>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full rounded-2xl h-12 font-bold" onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
