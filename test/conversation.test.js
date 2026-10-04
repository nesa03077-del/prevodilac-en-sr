import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ITEMS,
  NO_KEY_MESSAGE,
  NO_VOICE_MESSAGE,
  createConversation,
} from '../src/core/conversation.js';
import { SPEECH_ERROR_MESSAGES } from '../src/core/speech-recognizer.js';
import { TranslationError } from '../src/core/translator.js';

function setup({ speak = true, translator: customTranslator, speakerResult } = {}) {
  const calls = [];
  const translator = customTranslator ?? {
    translate: vi.fn(async ({ text, from, to, context, onText }) => {
      calls.push({ text, from, to, context });
      onText?.('...');
      return { text: `[${to}] ${text}` };
    }),
  };

  let handlers;
  const recognizer = {
    start: vi.fn(),
    stop: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
    dispose: vi.fn(),
  };
  const createRecognizer = (h) => {
    handlers = h;
    return recognizer;
  };

  const spoken = [];
  const speaker = {
    speak: vi.fn(async (text, lang) => {
      spoken.push({ text, lang });
      return speakerResult ?? { spoken: true };
    }),
    cancel: vi.fn(),
  };

  const changes = [];
  const conv = createConversation({
    getTranslator: () => translator,
    createRecognizer,
    speaker,
    getSpeak: () => speak,
    interimDebounceMs: 5,
    onChange: (s) => changes.push(s),
  });
  return { conv, translator, recognizer, speaker, spoken, calls, changes, h: () => handlers };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('createConversation', () => {
  it('počinje slušanje izabranog govornika', () => {
    const { conv, recognizer } = setup();
    conv.startListening('en');
    expect(recognizer.start).toHaveBeenCalledWith('en');
    expect(conv.getState().listening).toBe('en');
    expect(() => conv.startListening('de')).toThrow();
  });

  it('delimičan tekst se prevodi uživo, u smeru govornika', async () => {
    const { conv, h, calls } = setup();
    conv.startListening('en');
    h().onInterim('where is the');
    expect(conv.getState().interim).toBe('where is the');
    await vi.waitFor(() => expect(conv.getState().interimTranslation).toBe('[sr] where is the'));
    expect(calls[0]).toMatchObject({ from: 'en', to: 'sr', text: 'where is the' });
  });

  it('završena rečenica postaje stavka, prevodi se i izgovara na jeziku sagovornika', async () => {
    const { conv, h, spoken, recognizer } = setup();
    conv.startListening('en');
    h().onInterim('where is the station');
    h().onFinal('where is the station');
    expect(conv.getState().interim).toBe('');
    expect(conv.getState().items[0]).toMatchObject({ from: 'en', to: 'sr', source: 'where is the station', status: 'translating' });
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toEqual({ text: '[sr] where is the station', lang: 'sr' });
    expect(conv.getState().items[0]).toMatchObject({ status: 'done', translation: '[sr] where is the station' });
    // mikrofon je pauziran dok se izgovara, pa nastavljen
    await vi.waitFor(() => expect(recognizer.resume).toHaveBeenCalled());
    expect(recognizer.suspend).toHaveBeenCalled();
    expect(recognizer.suspend.mock.invocationCallOrder[0]).toBeLessThan(recognizer.resume.mock.invocationCallOrder[0]);
    expect(conv.getState().speaking).toBe(false);
  });

  it('srpski govornik: prevod ide na engleski, a ćirilica postaje latinica', async () => {
    const { conv, h, spoken, calls } = setup();
    conv.startListening('sr');
    h().onFinal('Здраво, како си?');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(conv.getState().items[0].source).toBe('Zdravo, kako si?');
    expect(calls.at(-1)).toMatchObject({ from: 'sr', to: 'en', text: 'Zdravo, kako si?' });
    expect(spoken[0].lang).toBe('en');
  });

  it('prethodne rečenice idu kao kontekst', async () => {
    const { conv, h, spoken, calls } = setup();
    conv.startListening('en');
    h().onFinal('Ana is late');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    conv.startListening('sr');
    h().onFinal('Znam');
    await vi.waitFor(() => expect(spoken).toHaveLength(2));
    const second = calls.find((c) => c.text === 'Znam');
    expect(second.context).toEqual(['Ana is late']);
  });

  it('kontekst je ograničen na poslednjih nekoliko rečenica', async () => {
    const { conv, h, spoken, calls } = setup();
    conv.startListening('en');
    for (let i = 1; i <= 8; i++) {
      h().onFinal(`rečenica ${i}`);
      await vi.waitFor(() => expect(spoken).toHaveLength(i));
    }
    const last = calls.find((c) => c.text === 'rečenica 8');
    expect(last.context).toHaveLength(6);
    expect(last.context.at(-1)).toBe('rečenica 7');
  });

  it('bez izgovora (isključen prekidač) mikrofon se ne pauzira', async () => {
    const { conv, h, speaker, recognizer } = setup({ speak: false });
    conv.startListening('en');
    h().onFinal('hello');
    await vi.waitFor(() => expect(conv.getState().items[0].status).toBe('done'));
    await settle();
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(recognizer.suspend).not.toHaveBeenCalled();
  });

  it('izgovori idu redom i mikrofon se vraća tek posle poslednjeg', async () => {
    let releaseFirst;
    const spokenOrder = [];
    const gate = new Promise((r) => (releaseFirst = r));
    const { conv, h, speaker, recognizer } = setup();
    speaker.speak.mockImplementation(async (text) => {
      if (spokenOrder.length === 0) await gate;
      spokenOrder.push(text);
      return { spoken: true };
    });
    conv.startListening('en');
    h().onFinal('prva');
    h().onFinal('druga');
    await settle();
    expect(recognizer.resume).not.toHaveBeenCalled();
    releaseFirst();
    await vi.waitFor(() => expect(spokenOrder).toEqual(['[sr] prva', '[sr] druga']));
    await vi.waitFor(() => expect(recognizer.resume).toHaveBeenCalledTimes(1));
  });

  it('greška prevoda se beleži na stavci, ne izgovara se, a mikrofon se vraća', async () => {
    const translator = { translate: vi.fn(async () => { throw new TranslationError('network', 'Nema veze sa serverom.'); }) };
    const { conv, h, speaker, recognizer } = setup({ translator });
    conv.startListening('en');
    h().onFinal('hello');
    await vi.waitFor(() => expect(conv.getState().items[0].status).toBe('error'));
    expect(conv.getState().items[0].error).toBe('Nema veze sa serverom.');
    await settle();
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(conv.getState().speaking).toBe(false);
    expect(recognizer.suspend).not.toHaveBeenCalled();
  });

  it('bez ključa (nema prevodioca) stavka dobija poruku o ključu', async () => {
    const conv0 = setup();
    const conv = createConversation({
      getTranslator: () => null,
      createRecognizer: (h) => { conv0.hh = h; return conv0.recognizer; },
      speaker: conv0.speaker,
      onChange: () => {},
    });
    conv.startListening('en');
    conv0.hh.onFinal('hello');
    await vi.waitFor(() => expect(conv.getState().items[0].status).toBe('error'));
    expect(conv.getState().items[0].error).toBe(NO_KEY_MESSAGE);
  });

  it('bez srpskog glasa napomena se pojavljuje jednom', async () => {
    const { conv, h, speaker } = setup({ speakerResult: { spoken: false, reason: 'no-voice' } });
    conv.startListening('en');
    h().onFinal('one');
    await vi.waitFor(() => expect(speaker.speak).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(conv.getState().notice).toBe(NO_VOICE_MESSAGE));
    conv.dismissNotice();
    h().onFinal('two');
    await vi.waitFor(() => expect(speaker.speak).toHaveBeenCalledTimes(2));
    await settle();
    expect(conv.getState().notice).toBe(null);
  });

  it('pritisak na dugme dok se izgovara prekida izgovor', async () => {
    const { conv, h, speaker } = setup();
    speaker.speak.mockImplementation(() => new Promise(() => {}));
    conv.startListening('en');
    h().onFinal('hello');
    await vi.waitFor(() => expect(conv.getState().speaking).toBe(true));
    conv.startListening('sr');
    expect(speaker.cancel).toHaveBeenCalled();
    expect(conv.getState().listening).toBe('sr');
  });

  it('stop čisti delimičan tekst, ali konačna rečenica koja stigne posle se prevodi', async () => {
    const { conv, h, recognizer, spoken } = setup();
    conv.startListening('sr');
    h().onInterim('dobar da');
    conv.stopListening();
    expect(recognizer.stop).toHaveBeenCalled();
    expect(conv.getState()).toMatchObject({ listening: null, interim: '' });
    h().onFinal('dobar dan'); // pregledač isporučuje kasnije
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(conv.getState().items[0]).toMatchObject({ from: 'sr', to: 'en' });
  });

  it('greška prepoznavanja zaustavlja slušanje i daje poruku', () => {
    const { conv, h } = setup();
    conv.startListening('en');
    h().onError('mic-denied');
    const s = conv.getState();
    expect(s.listening).toBe(null);
    expect(s.error).toEqual({ code: 'mic-denied', message: SPEECH_ERROR_MESSAGES['mic-denied'] });
    conv.startListening('en');
    expect(conv.getState().error).toBe(null);
  });

  it('brisanje razgovora prazni istoriju i prekida izgovor stavki koje su u toku', async () => {
    const { conv, h, speaker } = setup();
    conv.startListening('en');
    h().onFinal('hello');
    conv.clear();
    expect(conv.getState().items).toEqual([]);
    expect(speaker.cancel).toHaveBeenCalled();
    await settle();
    expect(speaker.speak).not.toHaveBeenCalled();
    expect(conv.getState().speaking).toBe(false);
  });

  it('čuva samo poslednjih MAX_ITEMS stavki', async () => {
    const { conv, h } = setup({ speak: false });
    conv.startListening('en');
    for (let i = 0; i < MAX_ITEMS + 5; i++) h().onFinal(`s${i}`);
    const items = conv.getState().items;
    expect(items).toHaveLength(MAX_ITEMS);
    expect(items.at(-1).source).toBe(`s${MAX_ITEMS + 4}`);
  });

  it('prazan konačan tekst se preskače', () => {
    const { conv, h } = setup();
    conv.startListening('en');
    h().onFinal('   ');
    expect(conv.getState().items).toEqual([]);
  });

  it('dispose gasi sve', () => {
    const { conv, recognizer, speaker } = setup();
    conv.dispose();
    expect(recognizer.dispose).toHaveBeenCalled();
    expect(speaker.cancel).toHaveBeenCalled();
  });

  it('onChange dobija kopiju stanja, ne živi objekat', async () => {
    const { conv, h, changes } = setup({ speak: false });
    conv.startListening('en');
    h().onFinal('hello');
    const snapshot = changes.at(-1);
    snapshot.items[0].source = 'izmenjeno';
    expect(conv.getState().items[0].source).toBe('hello');
  });
});

import { describeStatus } from '../src/core/conversation.js';

describe('describeStatus', () => {
  const base = { listening: null, interim: '', items: [], speaking: false };
  it('pokriva sva stanja', () => {
    expect(describeStatus(base)).toBe('Pritisnite dugme i govorite.');
    expect(describeStatus({ ...base, listening: 'en' })).toBe('Slušam: govorite engleski.');
    expect(describeStatus({ ...base, listening: 'sr' })).toBe('Slušam: govorite srpski.');
    expect(describeStatus({ ...base, listening: 'sr', interim: 'dobar' })).toBe('Slušam…');
    expect(describeStatus({ ...base, items: [{ status: 'translating' }] })).toBe('Prevodim…');
    expect(describeStatus({ ...base, listening: 'en', items: [{ status: 'translating' }] })).toBe('Slušam i prevodim…');
    expect(describeStatus({ ...base, listening: 'en', speaking: true })).toBe('Izgovaram prevod…');
  });
});
