import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, pickVoice, supportsSynthesis } from '../src/core/speaker.js';
import { createFakeSynth } from './fake-speech.js';

const v = (lang, extra = {}) => ({ lang, name: lang, ...extra });

describe('pickVoice', () => {
  it('srpski glas ima prednost, pa hrvatski i bosanski', () => {
    expect(pickVoice([v('en-US'), v('hr-HR'), v('sr-RS')], 'sr').lang).toBe('sr-RS');
    expect(pickVoice([v('en-US'), v('bs-BA'), v('hr-HR')], 'sr').lang).toBe('hr-HR');
    expect(pickVoice([v('en-US'), v('bs-BA')], 'sr').lang).toBe('bs-BA');
    expect(pickVoice([v('en-US'), v('de-DE')], 'sr')).toBe(null);
  });

  it('engleski: en-US pre ostalih, pa podrazumevani', () => {
    expect(pickVoice([v('en-GB'), v('en-US')], 'en').lang).toBe('en-US');
    expect(pickVoice([v('en-GB'), v('en-AU', { default: true })], 'en').lang).toBe('en-AU');
    expect(pickVoice([v('sr-RS')], 'en')).toBe(null);
  });

  it('podnosi razne zapise jezika (sr_RS, sr-Latn-RS)', () => {
    expect(pickVoice([v('sr_RS')], 'sr').lang).toBe('sr_RS');
    expect(pickVoice([v('sr-Latn-RS')], 'sr').lang).toBe('sr-Latn-RS');
  });

  it('prazna lista ili nepoznat jezik', () => {
    expect(pickVoice([], 'sr')).toBe(null);
    expect(pickVoice(undefined, 'en')).toBe(null);
    expect(pickVoice([v('en-US')], 'de')).toBe(null);
  });
});

describe('supportsSynthesis', () => {
  it('traži i synth i Utterance', () => {
    expect(supportsSynthesis({ speechSynthesis: {}, SpeechSynthesisUtterance: class {} })).toBe(true);
    expect(supportsSynthesis({ speechSynthesis: {} })).toBe(false);
    expect(supportsSynthesis({})).toBe(false);
    expect(supportsSynthesis(undefined)).toBe(false);
  });
});

describe('createSpeaker', () => {
  it('izgovara tekst izabranim glasom', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US'), v('sr-RS')] });
    const speaker = createSpeaker({ synth, Utterance });
    const r = await speaker.speak('Dobar dan', 'sr');
    expect(r.spoken).toBe(true);
    expect(synth.spoken).toHaveLength(1);
    expect(synth.spoken[0]).toMatchObject({ text: 'Dobar dan', lang: 'sr-RS' });
    expect(synth.spoken[0].voice.lang).toBe('sr-RS');
  });

  it('bez srpskog glasa ne izgovara srpski', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')] });
    const r = await createSpeaker({ synth, Utterance }).speak('Dobar dan', 'sr');
    expect(r).toEqual({ spoken: false, reason: 'no-voice' });
    expect(synth.spoken).toHaveLength(0);
  });

  it('engleski se izgovara i bez prepoznatog glasa (podrazumevani glas pregledača)', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('sr-RS')] });
    const r = await createSpeaker({ synth, Utterance }).speak('Hello', 'en');
    expect(r.spoken).toBe(true);
    expect(synth.spoken[0].lang).toBe('en-US');
    expect(synth.spoken[0].voice).toBeUndefined();
  });

  it('izgovori idu redom, jedan za drugim', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')], autoEnd: false });
    const speaker = createSpeaker({ synth, Utterance });
    const a = speaker.speak('prvi', 'en');
    const b = speaker.speak('drugi', 'en');
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
    expect(synth.spoken[0].text).toBe('prvi');
    synth.spoken[0].onend();
    await a;
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(2));
    expect(synth.spoken[1].text).toBe('drugi');
    synth.spoken[1].onend();
    expect((await b).spoken).toBe(true);
  });

  it('cancel prekida izgovor i briše red čekanja', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')], autoEnd: false });
    const speaker = createSpeaker({ synth, Utterance });
    const a = speaker.speak('prvi', 'en');
    const b = speaker.speak('drugi', 'en');
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
    speaker.cancel();
    synth.spoken[0].onerror({ error: 'interrupted' });
    expect(await a).toEqual({ spoken: false, reason: 'cancelled' });
    expect(await b).toEqual({ spoken: false, reason: 'cancelled' });
    expect(synth.spoken).toHaveLength(1);
    expect(synth.cancelled).toBe(1);
  });

  it('posle cancel novi izgovor opet radi', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')] });
    const speaker = createSpeaker({ synth, Utterance });
    speaker.cancel();
    expect((await speaker.speak('opet', 'en')).spoken).toBe(true);
  });

  it('greška izgovora se prijavljuje bez izuzetka', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')], autoEnd: false });
    const speaker = createSpeaker({ synth, Utterance });
    const p = speaker.speak('x', 'en');
    await vi.waitFor(() => expect(synth.spoken).toHaveLength(1));
    synth.spoken[0].onerror({ error: 'synthesis-failed' });
    expect(await p).toEqual({ spoken: false, reason: 'error' });
  });

  it('izuzetak iz synth.speak se hvata', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')] });
    synth.speak = () => {
      throw new Error('nema');
    };
    expect(await createSpeaker({ synth, Utterance }).speak('x', 'en')).toEqual({ spoken: false, reason: 'error' });
  });
});

describe('učitavanje glasova', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('čeka događaj voiceschanged', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [] });
    const p = createSpeaker({ synth, Utterance }).speak('Zdravo', 'sr');
    await vi.advanceTimersByTimeAsync(100);
    expect(synth.spoken).toHaveLength(0);
    synth.setVoices([v('sr-RS')]);
    await vi.advanceTimersByTimeAsync(0);
    expect((await p).spoken).toBe(true);
    expect(synth.spoken[0].lang).toBe('sr-RS');
  });

  it('posle isteka čekanja javlja da nema glasa', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [] });
    const p = createSpeaker({ synth, Utterance, waitVoicesMs: 1000 }).speak('Zdravo', 'sr');
    await vi.advanceTimersByTimeAsync(1100);
    expect(await p).toEqual({ spoken: false, reason: 'no-voice' });
  });

  it('ako pregledač nikad ne javi kraj, izgovor se ipak završava', async () => {
    const { synth, Utterance } = createFakeSynth({ voices: [v('en-US')], autoEnd: false });
    const p = createSpeaker({ synth, Utterance }).speak('kratko', 'en');
    await vi.advanceTimersByTimeAsync(20000);
    expect((await p).spoken).toBe(true);
  });
});
