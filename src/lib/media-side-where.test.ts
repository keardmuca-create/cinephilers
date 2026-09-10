import { describe, it, expect } from 'vitest';
import { parseSide, sideWhere } from './media-side-where';

describe('parseSide', () => {
  it('accepts the three sides and nothing else', () => {
    expect(parseSide('movies')).toBe('movies');
    expect(parseSide('shows')).toBe('shows');
    expect(parseSide('episodes')).toBe('episodes');
    expect(parseSide(null)).toBeNull();
    expect(parseSide('films')).toBeNull();
  });
});

describe('sideWhere', () => {
  it('keeps saved episodes off the Shows side', () => {
    expect(sideWhere('shows')).toEqual({ mediaType: 'SHOW', NOT: { tmdbId: { contains: '-S' } } });
    expect(sideWhere('episodes')).toEqual({ mediaType: 'SHOW', tmdbId: { contains: '-S' } });
    expect(sideWhere('movies')).toEqual({ mediaType: 'MOVIE' });
  });
});
