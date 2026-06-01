export const DAY_MS  = 86_400_000;
export const WEEK_MS = DAY_MS * 7;

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed | 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dedup<T extends { id: string }>(arr: T[]): T[] {
  return Array.from(new Map(arr.map(m => [m.id, m])).values());
}
