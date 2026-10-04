import { describe, expect, it } from 'vitest';
import { MAX_METRICS, METRICS_KEY, createMetricsStore, describeMetrics, percentile } from '../src/core/metrics.js';

function memoryStorage() {
  const data = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = String(v)),
    removeItem: (k) => void delete data[k],
  };
}

describe('percentile', () => {
  it('medijana i 90. percentil po najbližem rangu', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBe(null);
  });
});

describe('createMetricsStore', () => {
  it('beleži i računa zbir', () => {
    const store = createMetricsStore(memoryStorage());
    for (const [first, total] of [[500, 900], [700, 1200], [900, 1500], [1100, 3000]]) {
      store.add({ firstTokenMs: first, totalMs: total, model: 'claude-opus-5-5' });
    }
    store.add({ totalMs: 0, firstTokenMs: 0, reused: true });
    const s = store.summary();
    expect(s.count).toBe(5);
    expect(s.fresh).toBe(4);
    expect(s.reusedShare).toBeCloseTo(0.2);
    expect(s.first).toEqual({ median: 700, p90: 1100 });
    expect(s.total).toEqual({ median: 1200, p90: 3000 });
  });

  it('odbacuje neispravne unose', () => {
    const store = createMetricsStore(memoryStorage());
    expect(store.add(null)).toBe(false);
    expect(store.add({ totalMs: -5 })).toBe(false);
    expect(store.add({ totalMs: 'brzo' })).toBe(false);
    expect(store.add({ totalMs: NaN })).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('čuva samo poslednjih max unosa', () => {
    const store = createMetricsStore(memoryStorage(), { max: 3 });
    for (let i = 1; i <= 5; i++) store.add({ totalMs: i * 100, firstTokenMs: i * 50 });
    expect(store.list().map((m) => m.totalMs)).toEqual([300, 400, 500]);
    expect(MAX_METRICS).toBeGreaterThanOrEqual(100);
  });

  it('oštećeni podaci i blokiran storage ne ruše', () => {
    const bad = memoryStorage();
    bad.data[METRICS_KEY] = '{nije json';
    expect(createMetricsStore(bad).list()).toEqual([]);
    const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    const store = createMetricsStore(broken);
    expect(store.add({ totalMs: 100 })).toBe(false);
    expect(store.clear()).toBe(false);
    expect(store.summary().count).toBe(0);
    expect(createMetricsStore(null).list()).toEqual([]);
  });

  it('clear briše sve', () => {
    const storage = memoryStorage();
    const store = createMetricsStore(storage);
    store.add({ totalMs: 100 });
    expect(store.clear()).toBe(true);
    expect(store.list()).toEqual([]);
  });
});

describe('describeMetrics', () => {
  it('prazno, samo preuzeto, i običan zbir', () => {
    expect(describeMetrics({ count: 0 })).toContain('Još nema');
    expect(describeMetrics({ count: 3, fresh: 0, reusedShare: 1 })).toContain('svi preuzeti');
    const text = describeMetrics({
      count: 10, fresh: 8, reusedShare: 0.2,
      first: { median: 800, p90: 1400 }, total: { median: 1200, p90: 2100 },
    });
    expect(text).toContain('10 prevoda');
    expect(text).toContain('medijana 800 ms');
    expect(text).toContain('90% ispod 1400 ms');
    expect(text).toContain('20%');
  });
});
