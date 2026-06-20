import { NextRequest, NextResponse } from 'next/server';
import { fetchOneMeta } from './_fetch';
import type { ItemMeta } from './[id]/route';

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  const key = process.env.TMDB_API_KEY ?? '';
  if (!key) return NextResponse.json({ error: 'No API key' }, { status: 500 });

  const idsParam = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({});

  const results = await Promise.allSettled(ids.map(id => fetchOneMeta(id, key)));
  const out: Record<string, ItemMeta | null> = {};
  ids.forEach((id, i) => {
    const r = results[i];
    out[id] = r.status === 'fulfilled' ? r.value : null;
  });
  return NextResponse.json(out);
}
