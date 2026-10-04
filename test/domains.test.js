import { describe, expect, it } from 'vitest';
import { DEFAULT_DOMAIN_ID, DOMAINS, isDomain } from '../src/core/domains.js';

describe('oblasti', () => {
  it('podrazumevana oblast postoji, ID-jevi su jedinstveni, opisi na srpskom', () => {
    expect(isDomain(DEFAULT_DOMAIN_ID)).toBe(true);
    expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
    for (const d of DOMAINS) {
      expect(d.label).toBeTruthy();
      expect(d.hint).toBeTruthy();
    }
  });

  it('nepoznata oblast nije oblast', () => {
    expect(isDomain('kuvanje')).toBe(false);
    expect(isDomain(undefined)).toBe(false);
  });
});
