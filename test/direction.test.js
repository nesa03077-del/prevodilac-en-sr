import { describe, expect, it } from 'vitest';
import { LANG_LABELS, MODE_LABELS, describeDirection, oppositeMode } from '../src/core/direction.js';
import { MODES } from '../src/core/settings.js';

const EN_SR = { from: 'en', to: 'sr' };
const SR_EN = { from: 'sr', to: 'en' };

describe('describeDirection', () => {
  it('automatski bez teksta: jezik još nije poznat', () => {
    expect(describeDirection('auto', EN_SR, false)).toEqual({
      source: 'Engleski ili srpski', target: 'Prevod', auto: true,
    });
  });

  it('automatski sa tekstom: pokazuje prepoznat smer', () => {
    expect(describeDirection('auto', SR_EN, true)).toEqual({ source: 'Srpski', target: 'Engleski', auto: true });
  });

  it('ručni režim ne zavisi od teksta', () => {
    expect(describeDirection('en-sr', EN_SR, false)).toEqual({ source: 'Engleski', target: 'Srpski', auto: false });
    expect(describeDirection('sr-en', SR_EN, true)).toEqual({ source: 'Srpski', target: 'Engleski', auto: false });
  });
});

describe('oppositeMode', () => {
  it('menja smer', () => {
    expect(oppositeMode(EN_SR)).toBe('sr-en');
    expect(oppositeMode(SR_EN)).toBe('en-sr');
  });
});

describe('natpisi', () => {
  it('imaju natpis za svaki režim i jezik', () => {
    for (const m of MODES) expect(MODE_LABELS[m]).toBeTruthy();
    expect(LANG_LABELS).toEqual({ en: 'Engleski', sr: 'Srpski' });
  });
});
