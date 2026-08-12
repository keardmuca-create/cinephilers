import { describe, it, expect } from 'vitest';
import { isSelfAppearance } from './tmdb';

// Every string below is a real character value from TMDB's combined_credits for
// Johnny Depp (person 85) — the page that started this.
describe('isSelfAppearance', () => {
  it('catches a plain appearance', () => {
    expect(isSelfAppearance('Self')).toBe(true);
  });

  it('ignores parentheticals, which describe rather than name a part', () => {
    expect(isSelfAppearance('Self (uncredited)')).toBe(true);
    expect(isSelfAppearance('Self (archive footage)')).toBe(true);
    expect(isSelfAppearance('Self (Archive Footage)')).toBe(true);
  });

  it('treats presenting, hosting and narrating as appearances too', () => {
    expect(isSelfAppearance('Self / Presenter')).toBe(true);
    expect(isSelfAppearance('Self - Narrator (voice)')).toBe(true);
    expect(isSelfAppearance('Self - Guest')).toBe(true);
  });

  // The one that stops this being a blunt "drop anything containing Self":
  // he appears as himself AND plays a part, so it is an acting credit.
  it('keeps a credit where they also played someone', () => {
    expect(isSelfAppearance('Self / William Blake (uncredited)')).toBe(false);
    expect(isSelfAppearance('Self / Rango / Lars')).toBe(false);
  });

  it('leaves ordinary roles alone', () => {
    expect(isSelfAppearance('Jack Sparrow')).toBe(false);
    expect(isSelfAppearance('Edward Scissorhands')).toBe(false);
    expect(isSelfAppearance('Glen Lantz')).toBe(false);
  });

  // A role can legitimately begin with the letters "self".
  it('matches whole words, not prefixes', () => {
    expect(isSelfAppearance('Selfish Giant')).toBe(false);
  });

  it('says no when there is no character at all — crew credits', () => {
    expect(isSelfAppearance(undefined)).toBe(false);
    expect(isSelfAppearance('')).toBe(false);
  });

  // TMDB leaves the character blank on several of Depp's documentaries — Deep
  // Sea 3D, which he narrated, and the Chaplin one he's interviewed in. On a
  // documentary, no character means an appearance far more often than a part.
  describe('a blank character on a documentary', () => {
    const DOC = [99];
    const DRAMA = [18];

    it('counts as an appearance', () => {
      expect(isSelfAppearance('', DOC)).toBe(true);
      expect(isSelfAppearance(undefined, DOC)).toBe(true);
      expect(isSelfAppearance('   ', DOC)).toBe(true);
    });

    it('does not on anything else', () => {
      expect(isSelfAppearance('', DRAMA)).toBe(false);
      expect(isSelfAppearance('', [])).toBe(false);
      expect(isSelfAppearance('', undefined)).toBe(false);
    });

    // A named part on a documentary is still a part — Depp plays Jack Kerouac
    // in The Source, and Captain Jack Sparrow in the Disneyland one.
    it('never overrides a character that is actually named', () => {
      expect(isSelfAppearance('Jack Kerouac', DOC)).toBe(false);
      expect(isSelfAppearance('Captain Jack Sparrow (voice)', DOC)).toBe(false);
    });
  });
});
