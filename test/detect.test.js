import { describe, expect, it } from 'vitest';
import { detectLanguage, resolveDirection } from '../src/core/detect.js';

describe('detectLanguage', () => {
  it.each([
    'Hello, how are you?',
    'Where is the train station?',
    'I think we should go now',
    'Thank you very much',
    'What time is it',
  ])('engleski: %s', (text) => expect(detectLanguage(text)).toBe('en'));

  it.each([
    'Zdravo, kako si?',
    'Gde je železnička stanica?',
    'Mislim da treba da idemo sada',
    'Hvala ti puno',
    'Koliko je sati',
    'gde je stanica',
    'Ја сам из Пирота',
    'Ćao',
    'sta radis danas',
  ])('srpski: %s', (text) => expect(detectLanguage(text)).toBe('sr'));

  it('vraća null kad nema signala', () => {
    expect(detectLanguage('')).toBe(null);
    expect(detectLanguage('   ')).toBe(null);
    expect(detectLanguage('123 456')).toBe(null);
    expect(detectLanguage('Marko')).toBe(null);
  });
});

describe('resolveDirection', () => {
  it('poštuje ručno izabran smer', () => {
    expect(resolveDirection('en-sr', 'Zdravo')).toEqual({ from: 'en', to: 'sr' });
    expect(resolveDirection('sr-en', 'Hello')).toEqual({ from: 'sr', to: 'en' });
  });

  it('u automatskom režimu bira smer po jeziku', () => {
    expect(resolveDirection('auto', 'Hello, how are you?')).toEqual({ from: 'en', to: 'sr' });
    expect(resolveDirection('auto', 'Zdravo, kako si?')).toEqual({ from: 'sr', to: 'en' });
  });

  it('zadržava prethodni smer kad jezik nije prepoznat', () => {
    const prev = { from: 'sr', to: 'en' };
    expect(resolveDirection('auto', 'Marko', prev)).toEqual(prev);
  });
});
