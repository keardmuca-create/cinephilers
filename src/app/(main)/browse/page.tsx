
"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, X, Loader2 } from 'lucide-react';
import { useSearch } from '@/hooks/use-movies';

interface RecentItem {
  id: string;
  title: string;
  poster: string;
  year: string;
  type: string;
}

function ResultRow({ id, poster, title, year, sub }: {
  id: string;
  poster: string;
  title: string;
  year: string;
  sub?: string;
}) {
  return (
    <Link href={`/movie/${id}`} className="flex items-center gap-4 py-3 hover:bg-black/5 transition-colors -mx-6 px-6">
      <div className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0 shadow-sm">
        <img src={poster} alt={title} className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub ?? year}</p>
      </div>
    </Link>
  );
}

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'advanced'>('recent');
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const { results: searchResults, loading: searchLoading } = useSearch(searchTerm, []);
  const isSearching = searchTerm.trim().length > 0;

  useEffect(() => {
    try {
      const stored = localStorage.getItem('recently-viewed');
      if (stored) setRecentItems((JSON.parse(stored) as RecentItem[]).slice(0, 30));
    } catch { /* ignore */ }
  }, []);

  return (
    <main className="pt-10 pb-28 max-w-2xl mx-auto">
      {/* Search bar */}
      <div className="px-6 mb-4">
        <div className="relative flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search movies, shows, people..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-11 py-3.5 rounded-2xl border-2 border-foreground/80 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-sm font-medium text-foreground shrink-0"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {isSearching ? (
        /* ── Search results ── */
        <div className="px-6">
          {searchLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : searchResults.length > 0 ? (
            <div className="divide-y divide-border">
              {searchResults.map(m => (
                <ResultRow
                  key={m.id}
                  id={m.id}
                  poster={m.poster}
                  title={m.title}
                  year={m.year}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No results for &ldquo;{searchTerm}&rdquo;
            </p>
          )}
        </div>
      ) : (
        /* ── Default: Recent / Advanced ── */
        <div>
          {/* Tabs */}
          <div className="flex border-b border-border px-6 mb-2">
            <button
              onClick={() => setActiveTab('recent')}
              className={`pb-2.5 text-sm font-semibold mr-6 border-b-2 transition-colors ${
                activeTab === 'recent'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setActiveTab('advanced')}
              className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'advanced'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              Advanced Search
            </button>
          </div>

          {activeTab === 'recent' ? (
            <div className="px-6">
              {recentItems.length > 0 ? (
                <div className="divide-y divide-border">
                  {recentItems.map(item => (
                    <ResultRow
                      key={item.id}
                      id={item.id}
                      poster={item.poster}
                      title={item.title}
                      year={item.year}
                      sub={item.type === 'show' ? `${item.year} · TV Series` : item.year}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  No recently viewed titles yet
                </p>
              )}
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">Advanced search coming soon</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
