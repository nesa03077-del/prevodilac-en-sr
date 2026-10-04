import { describe, expect, it } from 'vitest';
import {
  REPORTS_KEY,
  REPORT_KINDS,
  createReportStore,
  normalizeReport,
  reportsToSmokeCaseSource,
} from '../src/core/reports.js';

function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = String(v)),
    removeItem: (k) => void delete data[k],
  };
}

const base = { source: 'Load 48213 at 14:30', translation: 'Tovar 48231 u 14:30', from: 'en', to: 'sr', domain: 'trucking', model: 'claude-opus-5-5' };

describe('normalizeReport', () => {
  it('traži izvor i prevod', () => {
    expect(normalizeReport(null)).toBe(null);
    expect(normalizeReport({ source: 'x' })).toBe(null);
    expect(normalizeReport({ translation: 'x' })).toBe(null);
    expect(normalizeReport({ source: '  ', translation: 'x' })).toBe(null);
  });

  it('popunjava podrazumevano i čisti vrednosti', () => {
    const r = normalizeReport({ ...base, kind: 'nepoznato', from: 'de', to: 'fr', correction: '  Tovar 48213 u 14:30 ' });
    expect(r.kind).toBe('other');
    expect(r.from).toBe('en');
    expect(r.to).toBe('sr');
    expect(r.correction).toBe('Tovar 48213 u 14:30');
    expect(r.id).toBeTruthy();
    expect(new Date(r.at).toString()).not.toBe('Invalid Date');
  });

  it('seče preduge tekstove', () => {
    const r = normalizeReport({ ...base, source: 'a'.repeat(5000), note: 'b'.repeat(5000) });
    expect(r.source.length).toBe(2000);
    expect(r.note.length).toBe(1000);
  });
});

describe('createReportStore', () => {
  it('dodaje, broji, čita i briše', () => {
    const store = createReportStore(memoryStorage());
    expect(store.count).toBe(0);
    const saved = store.add({ ...base, kind: 'number', correction: 'Tovar 48213 u 14:30' });
    expect(saved.kind).toBe('number');
    expect(store.count).toBe(1);
    expect(store.list()[0].source).toBe(base.source);
    expect(store.clear()).toBe(true);
    expect(store.count).toBe(0);
  });

  it('odbija neispravnu prijavu i ne čuva je', () => {
    const store = createReportStore(memoryStorage());
    expect(store.add({ source: '' })).toBe(null);
    expect(store.count).toBe(0);
  });

  it('čuva samo poslednjih max prijava', () => {
    const store = createReportStore(memoryStorage(), { max: 2 });
    for (const n of ['1', '2', '3']) store.add({ ...base, source: `s${n}` });
    expect(store.list().map((r) => r.source)).toEqual(['s2', 's3']);
  });

  it('upis koji ne uspe se prijavljuje (null), a blokiran storage ne ruši', () => {
    const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    const store = createReportStore(broken);
    expect(store.add(base)).toBe(null);
    expect(store.count).toBe(0);
    expect(store.clear()).toBe(false);
    expect(createReportStore(null).list()).toEqual([]);
  });

  it('oštećeni podaci se preskaču', () => {
    const s = memoryStorage();
    s.data[REPORTS_KEY] = JSON.stringify([{ nešto: 1 }, { ...base }, 5]);
    expect(createReportStore(s).list()).toHaveLength(1);
    s.data[REPORTS_KEY] = '{pokvareno';
    expect(createReportStore(s).list()).toEqual([]);
  });

  it('izvoz je ispravan JSON sa prijavama', () => {
    const store = createReportStore(memoryStorage());
    store.add({ ...base, correction: 'ispravno' });
    const parsed = JSON.parse(store.exportJson());
    expect(parsed.app).toBe('prevodilac-en-sr');
    expect(parsed.reports).toHaveLength(1);
    expect(parsed.reports[0].correction).toBe('ispravno');
  });
});

describe('reportsToSmokeCaseSource', () => {
  it('pravi kostur slučaja sa ispravkom u komentaru i praznim expect', () => {
    const src = reportsToSmokeCaseSource([{ ...base, kind: 'number', correction: 'Tovar 48213 u 14:30', note: 'broj' }]);
    expect(src).toContain('text: "Load 48213 at 14:30"');
    expect(src).toContain('domain: "trucking"');
    expect(src).toContain('from: "en"');
    expect(src).toContain('to: "sr"');
    expect(src).toContain('ispravno prema dispečeru: "Tovar 48213 u 14:30"');
    expect(src).toContain('prevod koji je dat: "Tovar 48231 u 14:30"');
    expect(src).toContain('expect: [],');
    expect(src).toContain(REPORT_KINDS.find((k) => k.id === 'number').label);
  });

  it('navodnici u tekstu ne kvare izvorni kod', () => {
    const src = reportsToSmokeCaseSource([{ ...base, source: 'He said "stop" now' }]);
    expect(src).toContain('text: "He said \\"stop\\" now"');
    expect(() => new Function(`return [${src}]`)).not.toThrow();
  });

  it('bez prijava', () => {
    expect(reportsToSmokeCaseSource([])).toContain('nema prijava');
  });
});
