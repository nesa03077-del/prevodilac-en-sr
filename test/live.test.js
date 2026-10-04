import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLiveSession } from '../src/core/live.js';
import { TranslationError } from '../src/core/translator.js';

/** Prevodilac koji odgovara tek kad test to dozvoli (resolve). */
function createControlledTranslator() {
  const pending = [];
  return {
    pending,
    translate(req) {
      return new Promise((resolve, reject) => {
        const entry = { req, resolve, reject };
        req.signal?.addEventListener('abort', () =>
          reject(new TranslationError('aborted', 'prekinuto')),
        );
        pending.push(entry);
      });
    },
  };
}

describe('createLiveSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('čeka pauzu u kucanju pre slanja (debounce)', async () => {
    const translator = createControlledTranslator();
    const session = createLiveSession({ translator, debounceMs: 300, onUpdate: () => {} });
    session.update('H');
    session.update('He');
    session.update('Hello');
    await vi.advanceTimersByTimeAsync(299);
    expect(translator.pending).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(translator.pending).toHaveLength(1);
    expect(translator.pending[0].req.text).toBe('Hello');
    expect(translator.pending[0].req).toMatchObject({ from: 'en', to: 'sr' });
  });

  it('nov tekst prekida stari zahtev i odbacuje njegov odgovor', async () => {
    const translator = createControlledTranslator();
    const updates = [];
    const errors = [];
    const session = createLiveSession({
      translator,
      debounceMs: 10,
      onUpdate: (u) => updates.push(u),
      onError: (e) => errors.push(e),
    });
    session.update('Hello');
    await vi.advanceTimersByTimeAsync(10);
    const first = translator.pending[0];
    session.update('Hello friend');
    await vi.advanceTimersByTimeAsync(10);
    expect(first.req.signal.aborted).toBe(true);
    // Zakasneli delimični prevod starog zahteva se ignoriše.
    first.req.onText('Zdravo');
    translator.pending[1].req.onText('Zdravo prijatelju');
    translator.pending[1].resolve({ text: 'Zdravo prijatelju' });
    await vi.runAllTimersAsync();
    expect(updates.map((u) => u.translation)).toEqual(['Zdravo prijatelju', 'Zdravo prijatelju']);
    expect(updates.at(-1)).toMatchObject({ done: true, source: 'Hello friend' });
    expect(errors).toEqual([]);
  });

  it('isti tekst ne prevodi dva puta', async () => {
    const translator = createControlledTranslator();
    const session = createLiveSession({ translator, debounceMs: 10, onUpdate: () => {} });
    const p = session.flush('Hello');
    translator.pending[0].resolve({ text: 'Zdravo' });
    await p;
    await session.flush('Hello ');
    expect(translator.pending).toHaveLength(1);
    session.reset();
    session.flush('Hello');
    expect(translator.pending).toHaveLength(2);
  });

  it('automatski menja smer po jeziku teksta', async () => {
    const translator = createControlledTranslator();
    const session = createLiveSession({ translator, onUpdate: () => {} });
    session.flush('Zdravo, kako si?');
    expect(translator.pending[0].req).toMatchObject({ from: 'sr', to: 'en' });
    session.flush('Hello, how are you?');
    expect(translator.pending[1].req).toMatchObject({ from: 'en', to: 'sr' });
    // Ime bez signala zadržava poslednji smer.
    session.flush('Marko');
    expect(translator.pending[2].req).toMatchObject({ from: 'en', to: 'sr' });
  });

  it('poštuje ručno izabran smer i kontekst', () => {
    const translator = createControlledTranslator();
    const session = createLiveSession({
      translator,
      getMode: () => 'sr-en',
      getContext: () => ['Prethodna rečenica'],
      onUpdate: () => {},
    });
    session.flush('Hello');
    expect(translator.pending[0].req).toMatchObject({
      from: 'sr',
      to: 'en',
      context: ['Prethodna rečenica'],
    });
  });

  it('prazan tekst briše prevod bez zahteva', async () => {
    const translator = createControlledTranslator();
    const updates = [];
    const session = createLiveSession({ translator, onUpdate: (u) => updates.push(u) });
    await session.flush('   ');
    expect(translator.pending).toHaveLength(0);
    expect(updates).toEqual([{ source: '', translation: '', from: 'en', to: 'sr', done: true }]);
  });

  it('prijavljuje prave greške, a prekide ne', async () => {
    const translator = createControlledTranslator();
    const errors = [];
    const busy = [];
    const session = createLiveSession({
      translator,
      onUpdate: () => {},
      onError: (e) => errors.push(e.code),
      onBusy: (b) => busy.push(b),
    });
    const p = session.flush('Hello');
    translator.pending[0].reject(new TranslationError('network', 'nema veze'));
    await p;
    expect(errors).toEqual(['network']);
    expect(busy).toEqual([true, false]);
  });

  it('dispose prekida sve', async () => {
    const translator = createControlledTranslator();
    const updates = [];
    const session = createLiveSession({ translator, debounceMs: 10, onUpdate: (u) => updates.push(u) });
    session.flush('Hello');
    session.update('Hello again');
    session.dispose();
    await vi.advanceTimersByTimeAsync(50);
    expect(translator.pending).toHaveLength(1);
    expect(translator.pending[0].req.signal.aborted).toBe(true);
    expect(updates).toEqual([]);
  });
});

describe('lastResult', () => {
  it('pamti poslednji završen prevod i briše se sa resetom i praznim tekstom', async () => {
    const translator = {
      translate: vi.fn(async ({ text }) => ({ text: `[${text}]` })),
    };
    const session = createLiveSession({ translator, onUpdate: () => {} });
    expect(session.lastResult).toBe(null);
    await session.flush('Hello');
    expect(session.lastResult).toEqual({ source: 'Hello', translation: '[Hello]', from: 'en', to: 'sr' });
    await session.flush('');
    expect(session.lastResult).toBe(null);
    await session.flush('Hello again');
    expect(session.lastResult.source).toBe('Hello again');
    session.reset();
    expect(session.lastResult).toBe(null);
  });
});
