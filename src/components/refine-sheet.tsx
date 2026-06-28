"use client"

import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check, ArrowUp, ArrowDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';

export interface RefineValue {
  sortField: string;
  sortDir: SortDir;
  type: string;   // 'any' or a type value
  genre: string;  // 'any' or a genre name
}

export interface SortOption { value: string; label: string }
export interface CountOption { value: string; label: string; count: number }

interface RefineSheetProps {
  open: boolean;
  onClose: () => void;
  total: number;
  sortOptions: SortOption[];
  typeOptions: CountOption[];   // first entry is the 'any' option
  genreOptions: CountOption[];  // first entry is the 'any' option
  value: RefineValue;
  onApply: (v: RefineValue) => void;
}

type Section = 'sort' | 'type' | 'genre' | null;

// One reusable accordion refine sheet for every list (Watch History, Watchlist,
// Ratings). Each list passes its own sort options and the per-type / per-genre
// counts; the sheet only handles the UI + pending state and reports the chosen
// filters back through onApply.
export function RefineSheet({ open, onClose, total, sortOptions, typeOptions, genreOptions, value, onApply }: RefineSheetProps) {
  const defaults: RefineValue = {
    sortField: sortOptions[0]?.value ?? '',
    sortDir: 'desc',
    type: 'any',
    genre: 'any',
  };

  const [pending, setPending] = useState<RefineValue>(value);
  const [expanded, setExpanded] = useState<Section>('sort');

  // Re-seed the pending state from the applied value each time the sheet opens.
  useEffect(() => {
    if (open) { setPending(value); setExpanded('sort'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const sortLabel  = sortOptions.find(s => s.value === pending.sortField)?.label ?? '';
  const typeLabel  = typeOptions.find(t => t.value === pending.type)?.label ?? 'Any';
  const genreLabel = genreOptions.find(g => g.value === pending.genre)?.label ?? 'Any';
  const toggle = (s: Section) => setExpanded(prev => (prev === s ? null : s));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-3xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl border border-gray-200">

        {/* Header: Cancel · Clear · Refine */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Cancel</button>
          <button onClick={() => setPending(defaults)} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">Clear</button>
          <button onClick={() => { onApply(pending); onClose(); }} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity">Refine</button>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-bold text-gray-900">
            {total} title{total !== 1 ? 's' : ''}
          </div>

          {/* Sort by */}
          <SectionHeader label="Sort by" value={sortLabel} open={expanded === 'sort'} onClick={() => toggle('sort')} />
          {expanded === 'sort' && (
            <div className="bg-gray-50 border-b border-gray-100">
              {sortOptions.map(o => {
                const sel = pending.sortField === o.value;
                return (
                  <div key={o.value} className="flex items-center justify-between px-5 py-3 border-t border-gray-100 first:border-t-0">
                    <button onClick={() => setPending(p => ({ ...p, sortField: o.value }))} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className="w-4 shrink-0">{sel && <Check className="h-4 w-4 text-primary" />}</span>
                      <span className={`text-sm truncate ${sel ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{o.label}</span>
                    </button>
                    {sel && (
                      <div className="flex items-center gap-4 shrink-0 pl-3">
                        <button onClick={() => setPending(p => ({ ...p, sortDir: 'desc' }))} aria-label="Newest / highest first">
                          <ArrowDown className={`h-[18px] w-[18px] ${pending.sortDir === 'desc' ? 'text-gray-900' : 'text-gray-300'}`} />
                        </button>
                        <button onClick={() => setPending(p => ({ ...p, sortDir: 'asc' }))} aria-label="Oldest / lowest first">
                          <ArrowUp className={`h-[18px] w-[18px] ${pending.sortDir === 'asc' ? 'text-gray-900' : 'text-gray-300'}`} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Type — only when the list actually has more than just "Any" */}
          {typeOptions.length > 1 && (
            <>
              <SectionHeader label="Type" value={typeLabel} open={expanded === 'type'} onClick={() => toggle('type')} />
              {expanded === 'type' && (
                <CountList options={typeOptions} selected={pending.type} onPick={v => setPending(p => ({ ...p, type: v }))} />
              )}
            </>
          )}

          {/* Genre */}
          {genreOptions.length > 1 && (
            <>
              <SectionHeader label="Genre" value={genreLabel} open={expanded === 'genre'} onClick={() => toggle('genre')} />
              {expanded === 'genre' && (
                <CountList options={genreOptions} selected={pending.genre} onPick={v => setPending(p => ({ ...p, genre: v }))} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, value, open, onClick }: { label: string; value: string; open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-5 py-4 text-left border-b border-gray-100">
      <span className="text-[15px] font-semibold text-gray-900">{label}</span>
      <span className="flex items-center gap-1.5 text-gray-400 min-w-0">
        <span className="text-sm truncate max-w-[160px]">{value}</span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </span>
    </button>
  );
}

function CountList({ options, selected, onPick }: { options: CountOption[]; selected: string; onPick: (v: string) => void }) {
  return (
    <div className="bg-gray-50 border-b border-gray-100 max-h-72 overflow-y-auto overscroll-contain">
      {options.map(o => {
        const sel = selected === o.value;
        return (
          <button key={o.value} onClick={() => onPick(o.value)} className="w-full flex items-center justify-between px-5 py-3 border-t border-gray-100 first:border-t-0 text-left">
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-4 shrink-0">{sel && <Check className="h-4 w-4 text-primary" />}</span>
              <span className={`text-sm truncate ${sel ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{o.label}</span>
            </span>
            <span className="text-sm text-gray-400 shrink-0 pl-3">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
