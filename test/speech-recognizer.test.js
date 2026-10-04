import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RECOGNITION_LANGS,
  SPEECH_ERROR_MESSAGES,
  createRecognizer,
  getSpeechRecognitionCtor,
  mapRecognitionError,
} from '../src/core/speech-recognizer.js';
import { createFakeRecognitionCtor, results } from './fake-speech.js';

function setup(extra = {}) {
  const Ctor = createFakeRecognitionCtor();
  const log = { interim: [], final: [], state: [], error: [] };
  const rec = createRecognizer({
    Ctor,
    onInterim: (t) => log.interim.push(t),
    onFinal: (t) => log.final.push(t),
    onState: (s) => log.state.push(s),
    onError: (c) => log.error.push(c),
    ...extra,
  });
  return { Ctor, rec, log };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('pomoćne funkcije', () => {
  it('nalazi konstruktor u prozoru', () => {
    const A = class {};
    const B = class {};
    expect(getSpeechRecognitionCtor({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
    expect(getSpeechRecognitionCtor({ webkitSpeechRecognition: B })).toBe(B);
    expect(getSpeechRecognitionCtor({})).toBe(null);
    expect(getSpeechRecognitionCtor(undefined)).toBe(null);
  });

  it('mapira greške pregledača', () => {
    expect(mapRecognitionError('no-speech')).toBe(null);
    expect(mapRecognitionError('aborted')).toBe(null);
    expect(mapRecognitionError('not-allowed')).toBe('mic-denied');
    expect(mapRecognitionError('service-not-allowed')).toBe('mic-denied');
    expect(mapRecognitionError('audio-capture')).toBe('no-mic');
    expect(mapRecognitionError('network')).toBe('network');
    expect(mapRecognitionError('language-not-supported')).toBe('language');
    expect(mapRecognitionError('nešto')).toBe('unknown');
  });

  it('svaki kod greške ima poruku na srpskom', () => {
    for (const code of ['mic-denied', 'no-mic', 'network', 'language', 'unavailable', 'unknown']) {
      expect(SPEECH_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});

describe('createRecognizer', () => {
  it('pokreće slušanje sa pravim jezikom i podešavanjima', () => {
    const { Ctor, rec, log } = setup();
    rec.start('sr');
    const r = Ctor.last();
    expect(r.started).toBe(true);
    expect(r.lang).toBe(RECOGNITION_LANGS.sr);
    expect(r.continuous).toBe(true);
    expect(r.interimResults).toBe(true);
    expect(log.state).toEqual(['listening']);
    rec.start('en'); // promena jezika
    expect(Ctor.instances).toHaveLength(2);
    expect(Ctor.instances[0].aborted).toBe(true);
    expect(Ctor.last().lang).toBe('en-US');
  });

  it('odbija nepoznat jezik', () => {
    const { rec } = setup();
    expect(() => rec.start('de')).toThrow();
  });

  it('delimičan i konačan tekst idu na prave strane', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    Ctor.last().emitResult(results(['hello wor', false]));
    Ctor.last().emitResult(results(['hello world', true]));
    Ctor.last().emitResult(results(['hello world', true], ['how are', false]), 1);
    expect(log.interim).toEqual(['hello wor', '', 'how are']);
    expect(log.final).toEqual(['hello world']);
  });

  it('preskače prazan konačan tekst', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    Ctor.last().emitResult(results(['   ', true]));
    expect(log.final).toEqual([]);
  });

  it('ponovo pokreće slušanje kad ga pregledač prekine', () => {
    const { Ctor, rec } = setup({ minRunMs: 0 });
    rec.start('en');
    Ctor.last().end();
    expect(Ctor.instances).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(Ctor.instances).toHaveLength(2);
    expect(Ctor.last().started).toBe(true);
    expect(rec.state).toBe('listening');
  });

  it('prekida petlju ako se slušanje stalno odmah gasi', () => {
    const { Ctor, rec, log } = setup({ maxQuickEnds: 3 });
    rec.start('en');
    for (let i = 0; i < 3; i++) {
      Ctor.last().end();
      vi.advanceTimersByTime(250);
    }
    expect(log.error).toEqual(['unavailable']);
    expect(rec.state).toBe('idle');
  });

  it('dugo slušanje bez rezultata nije petlja', () => {
    const { Ctor, rec, log } = setup({ maxQuickEnds: 2 });
    rec.start('en');
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(5000);
      Ctor.last().end();
      vi.advanceTimersByTime(250);
    }
    expect(log.error).toEqual([]);
    expect(rec.state).toBe('listening');
  });

  it('no-speech se ignoriše, a mikrofon odbijen se prijavljuje jednom', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    Ctor.last().emitError('no-speech');
    expect(log.error).toEqual([]);
    Ctor.last().emitError('not-allowed');
    expect(log.error).toEqual(['mic-denied']);
    expect(rec.state).toBe('idle');
    Ctor.instances[0].end();
    vi.advanceTimersByTime(1000);
    expect(Ctor.instances).toHaveLength(1); // nema ponovnog pokretanja
  });

  it('stop zaustavlja i javlja idle tek kad pregledač završi', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    rec.stop();
    expect(Ctor.last().stopped).toBe(true);
    // konačan rezultat posle stop još stiže
    Ctor.last().emitResult(results(['bye', true]));
    expect(log.final).toEqual(['bye']);
    Ctor.last().end();
    expect(rec.state).toBe('idle');
    vi.advanceTimersByTime(1000);
    expect(Ctor.instances).toHaveLength(1);
  });

  it('stop bez slušanja je bezbedan', () => {
    const { rec } = setup();
    expect(() => rec.stop()).not.toThrow();
    expect(rec.state).toBe('idle');
  });

  it('start odmah posle stop pravi novi objekat', () => {
    const { Ctor, rec } = setup();
    rec.start('en');
    rec.stop();
    rec.start('sr');
    expect(Ctor.instances).toHaveLength(2);
    expect(Ctor.last().lang).toBe('sr-RS');
    expect(Ctor.last().started).toBe(true);
  });

  it('suspend pauzira, a resume nastavlja', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    rec.suspend();
    expect(Ctor.instances[0].aborted).toBe(true);
    expect(rec.state).toBe('paused');
    Ctor.instances[0].end(); // kasni događaj starog objekta se ignoriše
    vi.advanceTimersByTime(1000);
    expect(Ctor.instances).toHaveLength(1);
    rec.resume();
    expect(Ctor.instances).toHaveLength(2);
    expect(rec.state).toBe('listening');
    expect(log.state).toEqual(['listening', 'paused', 'listening']);
  });

  it('resume posle stop ne pokreće slušanje', () => {
    const { Ctor, rec } = setup();
    rec.start('en');
    rec.suspend();
    rec.stop();
    rec.resume();
    expect(Ctor.instances).toHaveLength(1);
  });

  it('događaji starog objekta posle promene jezika se ignorišu', () => {
    const { Ctor, rec, log } = setup();
    rec.start('en');
    const old = Ctor.last();
    rec.start('sr');
    old.emitResult(results(['stari', true]));
    expect(log.final).toEqual([]);
  });

  it('greška pri pokretanju se prijavljuje', () => {
    const Broken = class {
      start() {
        throw new Error('nema');
      }
    };
    const errors = [];
    const rec = createRecognizer({ Ctor: Broken, onError: (c) => errors.push(c) });
    rec.start('en');
    expect(errors).toEqual(['unknown']);
    expect(rec.state).toBe('idle');
  });

  it('dispose gasi sve', () => {
    const { Ctor, rec } = setup();
    rec.start('en');
    rec.dispose();
    expect(Ctor.last().aborted).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(Ctor.instances).toHaveLength(1);
  });
});
