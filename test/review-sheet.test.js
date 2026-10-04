import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHRASES } from '../src/core/phrases.js';
import { TRUCKING_TERMS } from '../src/core/prompt.js';
import { buildReviewSheet } from '../src/core/review-sheet.js';

describe('spisak za pregled', () => {
  const sheet = buildReviewSheet();

  it('sadrži sve fraze i sve izraze iz koda', () => {
    for (const p of PHRASES) {
      expect(sheet).toContain(p.en);
      expect(sheet).toContain(p.sr);
    }
    for (const t of TRUCKING_TERMS) expect(sheet).toContain(`| ${t} |`);
  });

  it('ima uputstvo i tabele sa kolonama za odgovor', () => {
    expect(sheet).toContain('Zadatak');
    expect(sheet).toContain('| Engleski (dispečer) | Srpski (sada) | U redu? | Ispravka |');
    expect(sheet).toContain('## Izrazi koji nedostaju');
  });

  it('sačuvani fajl odgovara kodu (pokrenuti: npm run review-sheet)', () => {
    const file = fs.readFileSync(path.resolve(import.meta.dirname, '../docs/pregled-za-govornika.md'), 'utf8');
    expect(file).toBe(sheet);
  });
});
