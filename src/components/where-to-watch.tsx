"use client"

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { Tv, ExternalLink } from 'lucide-react';
import type { WatchProviders, WatchProvider } from '@/lib/tmdb';

// The region TMDB is asked about. There is no country on the account, so this
// reads the browser's own locale — a phone set to en-GB is telling us where its
// owner is far more reliably than anything we could infer server-side, and it
// works signed out. US is the fallback because it is TMDB's best-populated region,
// so an unknown locale still sees something rather than an empty section.
function browserRegion(): string {
  try {
    const loc = navigator.languages?.[0] ?? navigator.language ?? '';
    const region = new Intl.Locale(loc).region;
    if (region && /^[A-Z]{2}$/.test(region)) return region;
  } catch { /* older browsers, odd locales */ }
  return 'US';
}

function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code;
  } catch { return code; }
}

function ProviderRow({ label, providers }: { label: string; providers: WatchProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-muted-foreground w-12 shrink-0">{label}</span>
      <div className="flex gap-2 flex-wrap">
        {providers.map(p => (
          <div key={p.id} className="relative h-9 w-9 rounded-lg overflow-hidden bg-muted shrink-0" title={p.name}>
            {p.logo
              ? <Image src={p.logo} alt={p.name} fill className="object-cover" sizes="36px" />
              : <span className="flex h-full w-full items-center justify-center text-[9px] font-bold px-0.5 text-center">{p.name.slice(0, 4)}</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhereToWatch({ tmdbId, title }: { tmdbId: string; title: string }) {
  const [data, setData] = useState<WatchProviders | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/movies/${encodeURIComponent(tmdbId)}/providers?region=${browserRegion()}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled) { setData(j ?? null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [tmdbId]);

  // No data at all means the lookup itself failed. Saying "nothing found" then
  // would be reporting a result we never got, so the section stays away.
  if (!loaded || !data) return null;

  const count = data.streaming.length + data.rent.length + data.buy.length + data.free.length;
  const where = regionName(data.region);

  // The logos cannot be individual links: TMDB gives a name, a logo and a sort
  // order per provider and no URL at all. There is exactly one link in the whole
  // response and it belongs to the region, not to any service — Letterboxd can
  // link each row because they use JustWatch's own API, which returns a deeplink
  // per offer. So the whole block is one link rather than pretending each logo
  // goes somewhere different.
  //
  // That link is TMDB's page for this exact title, which beats a JustWatch search
  // on precision — searching "Dune" finds three films, this finds the one you are
  // looking at. The search URL is only the fallback for a title with no link.
  const href = data.link ?? `https://www.justwatch.com/${data.region.toLowerCase()}/search?q=${encodeURIComponent(title)}`;

  return (
    <section className="space-y-3">
      <h3 className="text-xl font-headline font-bold flex items-center gap-2">
        <Tv className="h-5 w-5 text-primary" /> Where to watch
      </h3>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block space-y-2.5 bg-muted/40 hover:bg-muted/70 transition-colors border border-border rounded-2xl p-4"
      >
        {count > 0 ? (
          <>
            <ProviderRow label="Free" providers={data.free} />
            <ProviderRow label="Stream" providers={data.streaming} />
            <ProviderRow label="Rent" providers={data.rent} />
            <ProviderRow label="Buy" providers={data.buy} />
          </>
        ) : (
          // Deliberately "found nothing", not "is not streaming". Letterboxd does
          // say "Not streaming." and on spot checks our data agrees with theirs —
          // but availability is per-country and moves weekly, this answer is a
          // day-old cache, and the region is inferred from the browser's locale
          // rather than known. Three ways to be confidently wrong about someone
          // else's country is enough to describe the lookup instead of the world.
          <p className="text-sm text-muted-foreground">No streaming options found for {where}.</p>
        )}

        {/* JustWatch supply this data through TMDB and their terms require the
            credit, so it is not optional decoration. */}
        <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1.5">
          <ExternalLink className="h-3 w-3 shrink-0" />
          {count > 0 ? `See all ways to watch in ${where}` : `Check ${where} on JustWatch`}
          <span className="opacity-70">· Powered by JustWatch</span>
        </p>
      </a>
    </section>
  );
}
