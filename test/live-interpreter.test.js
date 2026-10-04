import { describe, expect, it, vi } from 'vitest';
import { LIVE_MESSAGES, MAX_ITEMS, createInterpreter, describeLiveStatus } from '../src/core/live-interpreter.js';
import { TranslationError } from '../src/core/translator.js';

const settle = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function setup({ cfg = {}, translator, speakResult, openStreams, recognizerStartFails, noTranslator = false, interimDebounceMs = 5 } = {}) {
  const config = { myLang: 'sr', mode: 'two-streams', speakToOther: true, speakToMe: false, ...cfg };
  const calls = [];
  const tr = translator ?? {
    translate: vi.fn(async ({ text, from, to, context, onText }) => {
      calls.push({ text, from, to, context });
      onText?.('...');
      return { text: `[${to}] ${text}`, model: 'm', firstTokenMs: 300, totalMs: 700 };
    }),
  };

  const streams = { mic: { id: 'mic' }, other: config.mode === 'two-streams' ? { id: 'other' } : null, closed: 0, endedCb: null };
  streams.close = () => { streams.closed++; };
  streams.onEnded = (cb) => { streams.endedCb = cb; };

  const captures = [];
  const recognizers = [];
  const spoken = [];
  const metrics = [];
  const speak = vi.fn(async (text, lang, who) => {
    spoken.push({ text, lang, who });
    return speakResult ?? { spoken: true };
  });

  const it_ = createInterpreter({
    getTranslator: () => (noTranslator ? null : tr),
    getConfig: () => config,
    openStreams: openStreams ?? (async () => streams),
    createCapture: (opts) => {
      const cap = { opts, started: false, stopped: false, muteLog: [], start: vi.fn(async () => { cap.started = true; }), stop: vi.fn(() => { cap.stopped = true; }), setMuted: vi.fn((v) => cap.muteLog.push(v)) };
      captures.push(cap);
      return cap;
    },
    createRecognizer: (opts) => {
      const rec = {
        opts, written: [], stopped: false,
        start: vi.fn(async () => { if (recognizerStartFails) throw new Error('nema veze'); }),
        write: vi.fn((pcm) => rec.written.push(pcm)),
        stop: vi.fn(async () => { rec.stopped = true; }),
      };
      recognizers.push(rec);
      return rec;
    },
    speak,
    cancelSpeech: vi.fn(),
    interimDebounceMs,
    onMetric: (m) => metrics.push(m),
  });
  return { it_, config, streams, captures, recognizers, spoken, speak, calls, metrics, tr };
}

describe('pokretanje', () => {
  it('dve trake: moj mikrofon na srpskom, zvuk sagovornika na engleskom', async () => {
    const { it_, recognizers, captures, streams } = setup();
    await it_.start();
    expect(it_.getState().phase).toBe('listening');
    expect(recognizers.map((r) => r.opts.languages)).toEqual([['sr'], ['en']]);
    expect(captures.map((c) => c.opts.stream)).toEqual([streams.mic, streams.other]);
    expect(captures.every((c) => c.started)).toBe(true);
    // zvuk iz hvatanja ide u pravi prepoznavač
    captures[0].opts.onChunk(new Int16Array([1, 2]));
    captures[1].opts.onChunk(new Int16Array([3]));
    expect(recognizers[0].written).toHaveLength(1);
    expect(recognizers[1].written).toHaveLength(1);
    expect(Array.from(recognizers[1].written[0])).toEqual([3]);
  });

  it('engleski kao moj jezik menja strane', async () => {
    const { it_, recognizers } = setup({ cfg: { myLang: 'en' } });
    await it_.start();
    expect(recognizers.map((r) => r.opts.languages)).toEqual([['en'], ['sr']]);
  });

  it('jedan mikrofon: jedan prepoznavač sa oba jezika', async () => {
    const { it_, recognizers, captures } = setup({ cfg: { mode: 'single-mic' } });
    await it_.start();
    expect(recognizers).toHaveLength(1);
    expect(captures).toHaveLength(1);
    expect(recognizers[0].opts.languages).toEqual(['sr', 'en']);
  });

  it('bez Anthropic ključa se ne otvara ništa', async () => {
    const open = vi.fn();
    const { it_ } = setup({ noTranslator: true, openStreams: open });
    await it_.start();
    expect(open).not.toHaveBeenCalled();
    expect(it_.getState()).toMatchObject({ phase: 'idle', error: { code: 'no-key' } });
  });

  it('odbijen mikrofon ili deljenje zvuka daje poruku, a stanje je mirno', async () => {
    for (const code of ['mic-denied', 'no-mic', 'share-cancelled', 'no-system-audio', 'unsupported']) {
      const { it_ } = setup({ openStreams: async () => { throw Object.assign(new Error('x'), { code }); } });
      await it_.start();
      const s = it_.getState();
      expect(s.phase).toBe('idle');
      expect(s.error).toEqual({ code, message: LIVE_MESSAGES[code] });
    }
  });

  it('prepoznavač koji ne može da se poveže zatvara tokove i javlja grešku', async () => {
    const { it_, streams, captures } = setup({ recognizerStartFails: true });
    await it_.start();
    expect(it_.getState()).toMatchObject({ phase: 'idle', error: { code: 'network' } });
    expect(streams.closed).toBe(1);
    expect(captures.every((c) => !c.started || c.stopped)).toBe(true);
  });

  it('dvaput pokretanje ne pravi duplo', async () => {
    const { it_, recognizers } = setup();
    await it_.start();
    await it_.start();
    expect(recognizers).toHaveLength(2);
  });

  it('zaustavljanje dok se još povezuje ne završava u "sluša"', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const streams = { mic: {}, other: {}, closed: 0, close() { this.closed++; } };
    const { it_, recognizers } = setup({ openStreams: async () => { await gate; return streams; } });
    const starting = it_.start();
    expect(it_.getState().phase).toBe('starting');
    await it_.stop();
    release();
    await starting;
    expect(it_.getState().phase).toBe('idle');
    expect(recognizers).toHaveLength(0);
    expect(streams.closed).toBe(1);
  });
});

describe('zaustavljanje i greške', () => {
  it('stop zaustavlja hvatanje, prepoznavanje i tokove; može dvaput', async () => {
    const { it_, captures, recognizers, streams } = setup();
    await it_.start();
    await it_.stop();
    expect(captures.every((c) => c.stopped)).toBe(true);
    expect(recognizers.every((r) => r.stopped)).toBe(true);
    expect(streams.closed).toBe(1);
    expect(it_.getState().phase).toBe('idle');
    await it_.stop();
    expect(streams.closed).toBe(1);
  });

  it('greška Azure servisa zaustavlja sve i daje poruku', async () => {
    const { it_, recognizers, streams } = setup();
    await it_.start();
    recognizers[0].opts.onError('azure-auth');
    await settle();
    const s = it_.getState();
    expect(s.phase).toBe('idle');
    expect(s.error).toEqual({ code: 'azure-auth', message: LIVE_MESSAGES['azure-auth'] });
    expect(streams.closed).toBe(1);
  });

  it('prekid deljenja zvuka zaustavlja prevođenje sa porukom', async () => {
    const { it_, streams } = setup();
    await it_.start();
    streams.endedCb();
    await settle();
    expect(it_.getState()).toMatchObject({ phase: 'idle', error: { code: 'stream-ended' } });
  });

  it('može ponovo da se pokrene posle zaustavljanja', async () => {
    const { it_, recognizers } = setup();
    await it_.start();
    await it_.stop();
    await it_.start();
    expect(it_.getState().phase).toBe('listening');
    expect(recognizers).toHaveLength(4);
  });
});

describe('prevod i izgovor', () => {
  it('moja izjava se prevodi na jezik sagovornika i izgovara njemu', async () => {
    const { it_, recognizers, spoken } = setup();
    await it_.start();
    recognizers[0].opts.onFinal('Gde si sada?', 'sr');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toEqual({ text: '[en] Gde si sada?', lang: 'en', who: 'me' });
    expect(it_.getState().items[0]).toMatchObject({ who: 'me', from: 'sr', to: 'en', status: 'done' });
  });

  it('izjava sagovornika se prevodi na moj jezik i NE izgovara se kad je to isključeno', async () => {
    const { it_, recognizers, speak } = setup();
    await it_.start();
    recognizers[1].opts.onFinal('I am at the shipper', 'en');
    await vi.waitFor(() => expect(it_.getState().items[0]?.status).toBe('done'));
    await settle();
    expect(it_.getState().items[0]).toMatchObject({ who: 'other', from: 'en', to: 'sr', translation: '[sr] I am at the shipper' });
    expect(speak).not.toHaveBeenCalled();
  });

  it('izgovaranje sagovorniku može da se isključi, a meni da se uključi', async () => {
    const { it_, recognizers, spoken } = setup({ cfg: { speakToOther: false, speakToMe: true } });
    await it_.start();
    recognizers[0].opts.onFinal('Dobar dan', 'sr');
    recognizers[1].opts.onFinal('Good day', 'en');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ lang: 'sr', who: 'other' });
  });

  it('srpski tekst iz prepoznavanja je uvek latinica', async () => {
    const { it_, recognizers, calls } = setup();
    await it_.start();
    recognizers[0].opts.onFinal('Где си сада?', 'sr');
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(it_.getState().items[0].source).toBe('Gde si sada?');
  });

  it('jedan mikrofon: izjave se razvrstavaju po prepoznatom jeziku', async () => {
    const { it_, recognizers, spoken } = setup({ cfg: { mode: 'single-mic', speakToMe: true } });
    await it_.start();
    recognizers[0].opts.onFinal('Where are you?', 'en');
    recognizers[0].opts.onFinal('U Dalasu sam', 'sr');
    await vi.waitFor(() => expect(spoken).toHaveLength(2));
    const items = it_.getState().items;
    expect(items.map((i) => [i.who, i.from, i.to])).toEqual([['other', 'en', 'sr'], ['me', 'sr', 'en']]);
  });

  it('dok se izgovara prevod, hvatanje zvuka je utišano, pa se vraća', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const { it_, recognizers, captures, speak } = setup();
    speak.mockImplementation(async () => { await gate; return { spoken: true }; });
    await it_.start();
    recognizers[0].opts.onFinal('Zdravo', 'sr');
    await vi.waitFor(() => expect(it_.getState().speaking).toBe(true));
    expect(captures.every((c) => c.muteLog.at(-1) === true)).toBe(true);
    release();
    await vi.waitFor(() => expect(it_.getState().speaking).toBe(false));
    expect(captures.every((c) => c.muteLog.at(-1) === false)).toBe(true);
  });

  it('izgovori idu redom i hvatanje se vraća tek posle poslednjeg', async () => {
    const order = [];
    let releaseFirst;
    const gate = new Promise((r) => (releaseFirst = r));
    const { it_, recognizers, captures, speak } = setup();
    speak.mockImplementation(async (text) => {
      if (!order.length) await gate;
      order.push(text);
      return { spoken: true };
    });
    await it_.start();
    recognizers[0].opts.onFinal('prva', 'sr');
    recognizers[0].opts.onFinal('druga', 'sr');
    await settle();
    expect(captures[0].muteLog).not.toContain(false);
    releaseFirst();
    await vi.waitFor(() => expect(order).toEqual(['[en] prva', '[en] druga']));
    await vi.waitFor(() => expect(captures[0].muteLog.at(-1)).toBe(false));
  });

  it('greška prevoda: stavka dobija poruku, ne izgovara se, hvatanje nije utišano', async () => {
    const translator = { translate: vi.fn(async () => { throw new TranslationError('network', 'Nema veze sa serverom.'); }) };
    const { it_, recognizers, speak, captures } = setup({ translator });
    await it_.start();
    recognizers[0].opts.onFinal('Zdravo', 'sr');
    await vi.waitFor(() => expect(it_.getState().items[0].status).toBe('error'));
    await settle();
    expect(it_.getState().items[0].error).toBe('Nema veze sa serverom.');
    expect(speak).not.toHaveBeenCalled();
    expect(captures[0].muteLog.filter(Boolean)).toHaveLength(0);
  });

  it('nema glasa: napomena se pojavljuje jednom', async () => {
    const { it_, recognizers, speak } = setup({ speakResult: { spoken: false, reason: 'no-voice' } });
    await it_.start();
    recognizers[0].opts.onFinal('jedan', 'sr');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(it_.getState().notice).toContain('Glas za izgovor'));
    it_.dismissNotice();
    recognizers[0].opts.onFinal('dva', 'sr');
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    await settle();
    expect(it_.getState().notice).toBe(null);
  });

  it('prethodne rečenice idu kao kontekst', async () => {
    const { it_, recognizers, calls, spoken } = setup();
    await it_.start();
    recognizers[0].opts.onFinal('Ana kasni', 'sr');
    await vi.waitFor(() => expect(spoken).toHaveLength(1));
    recognizers[1].opts.onFinal('She is late', 'en');
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].context).toEqual(['Ana kasni']);
  });

  it('brojevi se proveravaju mašinski', async () => {
    const translator = { translate: vi.fn(async () => ({ text: 'Load 48231', model: 'm', firstTokenMs: 1, totalMs: 2 })) };
    const { it_, recognizers } = setup({ translator, cfg: { speakToOther: false } });
    await it_.start();
    recognizers[0].opts.onFinal('Tovar 48213', 'sr');
    await vi.waitFor(() => expect(it_.getState().items[0].status).toBe('done'));
    expect(it_.getState().items[0].numbers).toMatchObject({ checked: true, ok: false, missing: ['48213'], extra: ['48231'] });
  });

  it('prevod uživo koji je već stigao koristi se bez novog zahteva', async () => {
    const { it_, recognizers, tr } = setup({ cfg: { speakToOther: false } });
    await it_.start();
    recognizers[0].opts.onInterim('Gde si sada', 'sr');
    await vi.waitFor(() => expect(it_.getState().me.interimTranslation).toBe('[en] Gde si sada'));
    expect(tr.translate).toHaveBeenCalledTimes(1);
    recognizers[0].opts.onFinal('Gde si sada?', 'sr');
    expect(it_.getState().items[0]).toMatchObject({ status: 'done', reused: true, translation: '[en] Gde si sada' });
    expect(tr.translate).toHaveBeenCalledTimes(1);
  });

  it('delimičan tekst svake trake je odvojen', async () => {
    const { it_, recognizers } = setup();
    await it_.start();
    recognizers[0].opts.onInterim('moj tekst', 'sr');
    recognizers[1].opts.onInterim('their text', 'en');
    const s = it_.getState();
    expect(s.me.interim).toBe('moj tekst');
    expect(s.other.interim).toBe('their text');
  });

  it('merenje brzine se javlja po prevodu', async () => {
    const { it_, recognizers, metrics } = setup({ cfg: { speakToOther: false } });
    await it_.start();
    recognizers[0].opts.onFinal('Dobar dan', 'sr');
    await vi.waitFor(() => expect(metrics).toHaveLength(1));
    expect(metrics[0]).toEqual({ firstTokenMs: 300, totalMs: 700, model: 'm', reused: false });
  });

  it('prazan tekst se preskače, a istorija je ograničena', async () => {
    const { it_, recognizers } = setup({ cfg: { speakToOther: false } });
    await it_.start();
    recognizers[0].opts.onFinal('   ', 'sr');
    expect(it_.getState().items).toEqual([]);
    for (let i = 0; i < MAX_ITEMS + 3; i++) recognizers[0].opts.onFinal(`s${i}`, 'sr');
    expect(it_.getState().items).toHaveLength(MAX_ITEMS);
  });
});

describe('ostalo', () => {
  it('jačina zvuka se javlja, ali ne prečesto', async () => {
    vi.useFakeTimers();
    try {
      const changes = [];
      const base = setup();
      const it2 = createInterpreter({
        getTranslator: () => base.tr, getConfig: () => base.config, openStreams: async () => base.streams,
        createCapture: (o) => { base.captures.push({ o, start: async () => {}, stop() {}, setMuted() {} }); return base.captures.at(-1); },
        createRecognizer: () => ({ start: async () => {}, write() {}, stop: async () => {} }),
        onChange: (s) => changes.push(s),
      });
      await it2.start();
      const before = changes.length;
      const cap = base.captures.at(-2);
      cap.o.onLevel(0.3);
      cap.o.onLevel(0.4);
      cap.o.onLevel(0.5);
      expect(changes.length - before).toBe(1);
      expect(it2.getState().me.level).toBe(0.5);
      vi.advanceTimersByTime(200);
      cap.o.onLevel(0.2);
      expect(changes.length - before).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('brisanje razgovora prazni istoriju i prekida izgovor', async () => {
    const { it_, recognizers } = setup({ cfg: { speakToOther: false } });
    await it_.start();
    recognizers[0].opts.onFinal('Zdravo', 'sr');
    await vi.waitFor(() => expect(it_.getState().items).toHaveLength(1));
    it_.clear();
    expect(it_.getState().items).toEqual([]);
  });

  it('dispose zaustavlja sve', async () => {
    const { it_, streams } = setup();
    await it_.start();
    await it_.dispose();
    expect(it_.getState().phase).toBe('idle');
    expect(streams.closed).toBe(1);
  });

  it('onChange dobija kopiju stanja', async () => {
    const changes = [];
    const base = setup();
    const it2 = createInterpreter({
      getTranslator: () => base.tr, getConfig: () => base.config, openStreams: async () => base.streams,
      createCapture: () => ({ start: async () => {}, stop() {}, setMuted() {} }),
      createRecognizer: () => ({ start: async () => {}, write() {}, stop: async () => {} }),
      onChange: (s) => changes.push(s),
    });
    await it2.start();
    changes.at(-1).items.push('izmenjeno');
    expect(it2.getState().items).toEqual([]);
  });

  it('describeLiveStatus pokriva sva stanja', () => {
    const base = { phase: 'listening', items: [], me: { interim: '' }, other: { interim: '' }, speaking: false };
    expect(describeLiveStatus({ ...base, phase: 'idle' })).toContain('Pokreni');
    expect(describeLiveStatus({ ...base, phase: 'starting' })).toBe('Povezujem se…');
    expect(describeLiveStatus({ ...base, speaking: true })).toBe('Izgovaram prevod…');
    expect(describeLiveStatus({ ...base, items: [{ status: 'translating' }] })).toBe('Prevodim…');
    expect(describeLiveStatus({ ...base, me: { interim: 'x' } })).toBe('Slušam…');
    expect(describeLiveStatus(base)).toContain('Slušam');
  });

  it('svaka poruka za grešku postoji na srpskom', () => {
    for (const code of ['mic-denied', 'no-mic', 'share-cancelled', 'no-system-audio', 'unsupported', 'stream-ended', 'no-azure-key', 'no-key', 'azure-auth', 'quota', 'network', 'unavailable', 'unknown']) {
      expect(LIVE_MESSAGES[code], code).toBeTruthy();
    }
  });
});
