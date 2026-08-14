import { describe, it, expect } from 'vitest';
import { isSelfAppearance, appearanceSection } from './tmdb';

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

  // TMDB writes an appearance as the person's own name about as often as it
  // writes "Self". Every string below is real: the Jack and Jill cameo, the
  // Jordi Molla' documentary, and Life's Too Short.
  describe('their own name', () => {
    const DOC = [99];
    const TALK = [10767];
    const COMEDY = [35];

    it('counts as an appearance where nobody plays a part', () => {
      expect(isSelfAppearance('Johnny Depp', DOC, 'Johnny Depp')).toBe(true);
      expect(isSelfAppearance('Johnny Depp (uncredited)', TALK, 'Johnny Depp')).toBe(true);
      expect(isSelfAppearance('johnny depp', DOC, 'Johnny Depp')).toBe(true);
    });

    // Untagged on this endpoint is nearly always a documentary TMDB never
    // classified — the Jordi Molla' one comes back with no genres at all.
    it('counts when TMDB recorded no genre', () => {
      expect(isSelfAppearance('Johnny Depp', [], 'Johnny Depp')).toBe(true);
      expect(isSelfAppearance('Johnny Depp', undefined, 'Johnny Depp')).toBe(true);
    });

    // The Cannes case: playing yourself with a script and a director is acting,
    // however the character field is spelled. Jack and Jill and Life's Too Short.
    it('does not in scripted fiction', () => {
      expect(isSelfAppearance('Johnny Depp (uncredited)', [35, 10751], 'Johnny Depp')).toBe(false);
      expect(isSelfAppearance('Johnny Depp', COMEDY, 'Johnny Depp')).toBe(false);
      expect(isSelfAppearance('Johnny Depp', [18], 'Johnny Depp')).toBe(false);
    });

    // Only the own-name half is gated. "Self" is never a part, anywhere.
    it('does not gate the literal word Self', () => {
      expect(isSelfAppearance('Self (uncredited)', [27, 35], 'Johnny Depp')).toBe(true);
    });

    it('still yields to an actual character alongside it', () => {
      expect(isSelfAppearance('Johnny Depp / Jack Sparrow', DOC, 'Johnny Depp')).toBe(false);
    });

    it('matches the whole part, not a prefix of it', () => {
      expect(isSelfAppearance('Johnny Depp\'s Father', DOC, 'Johnny Depp')).toBe(false);
      expect(isSelfAppearance('Young Johnny Depp', DOC, 'Johnny Depp')).toBe(false);
    });

    it('is inert when the name is not passed', () => {
      expect(isSelfAppearance('Johnny Depp', DOC)).toBe(false);
    });

    it('does not fire on somebody else played by name', () => {
      expect(isSelfAppearance('Johnny Depp', DOC, 'Jamie Foxx')).toBe(false);
    });
  });
});

// Once a credit is an appearance, it splits again: a documentary is a film you
// can watch and rate, a talk show is not a work at all.
describe('appearanceSection', () => {
  it('sends documentaries to Documentary', () => {
    expect(appearanceSection([99])).toBe('Documentary');
    expect(appearanceSection([99, 18])).toBe('Documentary');
  });

  it('sends talk, news and reality to Appearances', () => {
    expect(appearanceSection([35, 10767])).toBe('Appearances'); // Graham Norton
    expect(appearanceSection([10767, 35])).toBe('Appearances'); // Jimmy Kimmel Live!
    expect(appearanceSection([10763])).toBe('Appearances');     // Entertainment Tonight
    expect(appearanceSection([10764])).toBe('Appearances');
  });

  // The award shows are the reason this reads the documentary tag rather than
  // matching titles: TMDB returns no genres at all for either of them, so they
  // reach Appearances by falling through rather than by being on a list.
  it('sends an untagged award show to Appearances without naming it', () => {
    expect(appearanceSection([])).toBe('Appearances');
    expect(appearanceSection(undefined)).toBe('Appearances');
  });
});
