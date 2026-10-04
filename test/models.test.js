import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID, MODELS, getModelInfo } from '../src/core/models.js';

describe('modeli', () => {
  it('podrazumevani model je prvi i postoji u listi', () => {
    expect(MODELS[0].id).toBe(DEFAULT_MODEL_ID);
    expect(DEFAULT_MODEL_ID).toBe('claude-opus-5-5');
  });

  it('ID-jevi su jedinstveni i bez datuma na kraju', () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/-\d{8}$/);
  });

  it('svaki model ima naziv i opis na srpskom', () => {
    for (const m of MODELS) {
      expect(m.label).toBeTruthy();
      expect(m.hint).toBeTruthy();
    }
  });

  it('nepoznat model se tretira kao pun model', () => {
    expect(getModelInfo('nešto-drugo')).toMatchObject({ id: 'nešto-drugo', effort: true, fallback: true });
    expect(getModelInfo('claude-haiku-4-5').effort).toBe(false);
  });
});
