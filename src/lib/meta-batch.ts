import type { ItemMeta } from '@/app/api/meta/[id]/route';

const CHUNK = 100;

export async function batchFetchMeta(ids: string[]): Promise<Record<string, ItemMeta>> {
  const result: Record<string, ItemMeta> = {};
  const toFetch: string[] = [];

  for (const id of ids) {
    try {
      const raw = localStorage.getItem(`meta-${id}`);
      if (raw) {
        const cached = JSON.parse(raw) as ItemMeta;
        // Refetch movies cached before runtime tracking so shorts can be detected.
        const needsRuntime = cached.type === 'movie' && !cached.isEpisode && cached.runtime === undefined;
        if (!needsRuntime) { result[id] = cached; continue; }
      }
    } catch { /* ignore */ }
    toFetch.push(id);
  }

  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const chunk = toFetch.slice(i, i + CHUNK);
    try {
      const res = await fetch(`/api/meta?ids=${chunk.join(',')}`);
      if (!res.ok) continue;
      const data: Record<string, ItemMeta | null> = await res.json();
      for (const [id, meta] of Object.entries(data)) {
        if (meta) {
          result[id] = meta;
          try { localStorage.setItem(`meta-${id}`, JSON.stringify(meta)); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  return result;
}
