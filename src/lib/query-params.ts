// Parses a numeric query param and clamps it to [min, max]. Non-numeric input
// (parseInt → NaN) falls back to `def` instead of leaking NaN into Prisma's
// take/skip, which throws a 500.
export function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
