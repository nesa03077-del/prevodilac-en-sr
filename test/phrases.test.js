import { describe, expect, it } from 'vitest';
import { extractNumbers } from '../src/core/numbers.js';
import { PHRASES, PHRASE_GROUPS, getPhrase } from '../src/core/phrases.js';
import { hasCyrillic } from '../src/core/transliterate.js';

describe('proverene fraze', () => {
  it('ID-jevi su jedinstveni i grupe postoje', () => {
    const ids = PHRASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = PHRASE_GROUPS.map((g) => g.id);
    for (const p of PHRASES) expect(groups).toContain(p.group);
    for (const g of groups) expect(PHRASES.some((p) => p.group === g)).toBe(true);
  });

  it('svaka fraza ima engleski i srpski tekst, srpski je latinica', () => {
    for (const p of PHRASES) {
      expect(p.en.trim().length).toBeGreaterThan(3);
      expect(p.sr.trim().length).toBeGreaterThan(3);
      expect(hasCyrillic(p.sr)).toBe(false);
      expect(p.sr).not.toMatch(/[<>{}]/);
    }
  });

  it('brojevi su isti u engleskom i srpskom tekstu', () => {
    for (const p of PHRASES) {
      expect(extractNumbers(p.sr).map((n) => n.digits)).toEqual(extractNumbers(p.en).map((n) => n.digits));
    }
  });

  it('fraze su kratke (lako se čuju i čitaju)', () => {
    for (const p of PHRASES) expect(p.sr.length).toBeLessThanOrEqual(80);
  });

  it('getPhrase', () => {
    expect(getPhrase('where').sr).toBe('Gde si sada?');
    expect(getPhrase('nema')).toBe(null);
  });
});
