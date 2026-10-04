// Prevođenje uživo bez pritiskanja dugmadi (probna verzija za Windows i Android).
//
// Dva načina rada:
//  - 'two-streams': moj mikrofon i zvuk sagovornika (zvuk poziva) su dva odvojena toka;
//    svaki ima svoj jezik, pa nema pogađanja ko govori.
//  - 'single-mic': jedan mikrofon (sagovornik na zvučniku); servis za govor sam određuje
//    jezik svake izjave.
//
// Ja govorim svoj jezik -> prevod na jezik sagovornika (prikaz i, po želji, glas).
// Sagovornik govori -> prevod na moj jezik (prikaz i, po želji, glas).
// Dok se izgovara prevod, hvatanje zvuka je utišano (nema "slušanja samog sebe").

import { canonical } from './conversation.js';
import { createLiveSession } from './live.js';
import { compareNumbers } from './numbers.js';
import { ERROR_MESSAGES, TranslationError } from './translator.js';
import { toLatin } from './transliterate.js';
import { AZURE_ERROR_MESSAGES } from './azure-speech.js';

export const MAX_ITEMS = 50;
export const LIVE_MODES = ['two-streams', 'single-mic'];
const OTHER = { en: 'sr', sr: 'en' };

export const LIVE_MESSAGES = {
  'mic-denied': 'Mikrofon nije dozvoljen. Dozvolite pristup mikrofonu u podešavanjima, pa pokušajte ponovo.',
  'no-mic': 'Mikrofon nije pronađen. Proverite da li je povezan.',
  'share-cancelled': 'Niste izabrali zvuk poziva. Izaberite ceo ekran ili karticu i uključite "Deli zvuk".',
  'no-system-audio': 'Izabrani izvor nema zvuk. Izaberite ceo ekran (Windows) ili karticu, i uključite "Deli zvuk".',
  unsupported: 'Ovaj uređaj ne može da uhvati zvuk poziva. Izaberite "Isti mikrofon" i stavite sagovornika na zvučnik.',
  'stream-ended': 'Deljenje zvuka je prekinuto. Pokrenite ponovo.',
  'no-azure-key': 'Za prevođenje uživo treba Azure ključ za govor. Unesite ga u podešavanjima.',
  'no-key': 'Za prevod je potreban Anthropic API ključ.',
  ...AZURE_ERROR_MESSAGES,
};

/**
 * @param {{
 *   getTranslator: () => ({ translate: Function } | null),
 *   getConfig: () => { myLang: 'en'|'sr', mode: 'two-streams'|'single-mic', speakToOther: boolean, speakToMe: boolean },
 *   openStreams: (mode: string) => Promise<{ mic: any, other: any|null, close: () => void, onEnded?: (cb: () => void) => void }>,
 *   createCapture: (opts: { stream: any, onChunk: (pcm: Int16Array) => void, onLevel: (l: number) => void }) => { start: Function, stop: Function, setMuted: Function },
 *   createRecognizer: (opts: { languages: string[], onInterim: Function, onFinal: Function, onState?: Function, onError: Function }) => { start: Function, write: Function, stop: Function },
 *   speak?: ((text: string, lang: 'en'|'sr', who: 'me'|'other') => Promise<{ spoken: boolean, reason?: string }>) | null,
 *   cancelSpeech?: () => void,
 *   maxContext?: number,
 *   interimDebounceMs?: number,
 *   onChange?: (state: object) => void,
 *   onMetric?: (metric: object) => void,
 * }} options
 */
export function createInterpreter({
  getTranslator,
  getConfig,
  openStreams,
  createCapture,
  createRecognizer,
  speak = null,
  cancelSpeech = () => {},
  maxContext = 6,
  interimDebounceMs = 600,
  onChange = () => {},
  onMetric = () => {},
}) {
  let nextId = 1;
  let epoch = 0;
  let cfg = null;
  let streams = null;
  let captures = [];
  let recognizers = [];
  let pendingSpeech = 0;
  let pipeline = Promise.resolve();
  let lastLevelEmit = 0;
  let noVoiceShown = false;
  let startSeq = 0; // povećava se pri svakom stop(), da zakasnelo pokretanje ne pređe u 'sluša'

  const lane = () => ({ interim: '', interimTranslation: '', level: 0 });
  const state = {
    phase: 'idle', // 'idle' | 'starting' | 'listening'
    items: [],
    me: lane(),
    other: lane(),
    speaking: false,
    error: null, // { code, message }
    notice: null,
  };

  const emit = () =>
    onChange({
      ...state,
      me: { ...state.me },
      other: { ...state.other },
      error: state.error ? { ...state.error } : null,
      items: state.items.map((i) => ({ ...i })),
    });

  const myLang = () => cfg?.myLang ?? getConfig().myLang;
  const langOf = (who) => (who === 'me' ? myLang() : OTHER[myLang()]);
  const normalize = (text, lang) => {
    const t = (text ?? '').trim();
    return lang === 'sr' ? toLatin(t) : t;
  };
  const contextBefore = (id) =>
    state.items.filter((i) => i.id < id && i.status === 'done').slice(-maxContext).map((i) => i.source);

  // Prevod delimičnog teksta uživo, po jedna sesija za svaku traku; greške se ignorišu
  // jer ih prijavljuje konačan prevod.
  const liveFor = (who) =>
    createLiveSession({
      translator: {
        translate: (req) => {
          const t = getTranslator();
          return t ? t.translate(req) : Promise.reject(new TranslationError('auth', ERROR_MESSAGES.auth));
        },
      },
      getMode: () => (langOf(who) === 'sr' ? 'sr-en' : 'en-sr'),
      getContext: () => contextBefore(Infinity),
      debounceMs: interimDebounceMs,
      onUpdate: ({ source, translation }) => {
        if (state.phase !== 'listening') return;
        state[who].interimTranslation = source ? translation : '';
        emit();
      },
      onError: () => {},
    });
  const live = { me: liveFor('me'), other: liveFor('other') };

  function setMuted(value) {
    for (const c of captures) c.setMuted(value);
  }

  function setError(code) {
    state.error = { code, message: LIVE_MESSAGES[code] ?? LIVE_MESSAGES.unknown };
  }

  // ----- izgovor prevoda -----

  async function speakItem(item) {
    setMuted(true); // dok se izgovara, ne slušamo
    state.speaking = true;
    emit();
    let result;
    try {
      result = await speak(item.translation, item.to, item.who);
    } catch {
      result = { spoken: false, reason: 'error' };
    }
    if (result?.reason === 'no-voice' && !noVoiceShown) {
      noVoiceShown = true;
      state.notice = 'Glas za izgovor nije dostupan, pa se prevod samo prikazuje.';
    }
  }

  function finishSpeech() {
    pendingSpeech = Math.max(0, pendingSpeech - 1);
    if (pendingSpeech === 0) {
      state.speaking = false;
      setMuted(false);
      emit();
    }
  }

  // ----- izjave -----

  function handleInterim(who, rawText) {
    const text = normalize(rawText, langOf(who));
    state[who].interim = text;
    if (text) live[who].update(text);
    else {
      state[who].interimTranslation = '';
      live[who].flush('');
    }
    emit();
  }

  function handleFinal(who, rawText) {
    const from = langOf(who);
    const to = OTHER[from];
    const source = normalize(rawText, from);
    if (!source) return;

    const earlier = live[who].lastResult;
    const reuse =
      earlier && earlier.from === from && earlier.to === to && canonical(earlier.source) === canonical(source)
        ? earlier.translation
        : null;
    state[who].interim = '';
    state[who].interimTranslation = '';
    live[who].flush('');

    const item = {
      id: nextId++, who, from, to, source, translation: '', status: 'translating',
      error: null, numbers: null, fixed: false, reused: false,
    };
    state.items.push(item);
    if (state.items.length > MAX_ITEMS) state.items.splice(0, state.items.length - MAX_ITEMS);

    const myEpoch = epoch;
    const willSpeak = Boolean(speak) && (who === 'me' ? cfg?.speakToOther : cfg?.speakToMe);
    if (willSpeak) pendingSpeech++;
    state.error = null;

    const markDone = (text) => {
      item.translation = text;
      item.status = 'done';
      item.numbers = compareNumbers(item.source, text);
      emit();
      return true;
    };

    let translated;
    if (reuse) {
      item.reused = true;
      onMetric({ firstTokenMs: 0, totalMs: 0, model: '', reused: true });
      translated = Promise.resolve(markDone(reuse));
    } else {
      emit();
      const translator = getTranslator();
      const work = translator
        ? translator.translate({
            text: source, from, to, context: contextBefore(item.id),
            onText: (partial) => {
              item.translation = partial;
              emit();
            },
          })
        : Promise.reject(new TranslationError('auth', LIVE_MESSAGES['no-key']));
      translated = work.then(
        (r) => {
          onMetric({ firstTokenMs: r.firstTokenMs ?? null, totalMs: r.totalMs ?? 0, model: r.model ?? '', reused: false });
          return markDone(r.text);
        },
        (err) => {
          item.status = 'error';
          item.error = err?.message || ERROR_MESSAGES.unknown;
          emit();
          return false;
        },
      );
    }

    pipeline = pipeline.then(async () => {
      const ok = await translated;
      if (!willSpeak) return;
      try {
        if (ok && myEpoch === epoch) await speakItem(item);
      } finally {
        finishSpeech();
      }
    });
  }

  // U režimu jednog mikrofona jezik izjave određuje ko je govorio.
  const whoFor = (lang) => (lang === myLang() ? 'me' : 'other');

  function onLevel(who, level) {
    state[who].level = level;
    const now = Date.now();
    if (now - lastLevelEmit >= 120) {
      lastLevelEmit = now;
      emit();
    }
  }

  // ----- pokretanje i zaustavljanje -----

  async function teardown() {
    const caps = captures;
    const recs = recognizers;
    const s = streams;
    captures = [];
    recognizers = [];
    streams = null;
    for (const c of caps) c.stop();
    await Promise.all(recs.map((r) => Promise.resolve(r.stop()).catch(() => {})));
    try {
      s?.close();
    } catch {
      /* već zatvoreno */
    }
    live.me.flush('');
    live.other.flush('');
    state.me = lane();
    state.other = lane();
  }

  async function start() {
    if (state.phase !== 'idle') return;
    cfg = { ...getConfig() };
    if (!getTranslator()) {
      setError('no-key');
      emit();
      return;
    }
    state.phase = 'starting';
    state.error = null;
    state.notice = null;
    emit();
    const mySeq = ++startSeq;
    const cancelled = () => mySeq !== startSeq || state.phase !== 'starting';

    try {
      streams = await openStreams(cfg.mode);
      if (cancelled()) {
        await teardown();
        return;
      }
      const fatal = (code) => {
        setError(code);
        stop();
      };
      const pair = (who, stream, languages, pick) => {
        const rec = createRecognizer({
          languages,
          onInterim: (text, lang) => handleInterim(pick(lang), text),
          onFinal: (text, lang) => handleFinal(pick(lang), text),
          onError: fatal,
        });
        const cap = createCapture({ stream, onChunk: (pcm) => rec.write(pcm), onLevel: (l) => onLevel(who, l) });
        recognizers.push(rec);
        captures.push(cap);
      };

      if (cfg.mode === 'single-mic') {
        pair('me', streams.mic, [cfg.myLang, OTHER[cfg.myLang]], whoFor);
      } else {
        pair('me', streams.mic, [cfg.myLang], () => 'me');
        pair('other', streams.other, [OTHER[cfg.myLang]], () => 'other');
      }
      streams.onEnded?.(() => {
        if (state.phase === 'idle') return;
        setError('stream-ended');
        stop();
      });

      await Promise.all(recognizers.map((r) => r.start()));
      await Promise.all(captures.map((c) => c.start()));
      if (cancelled()) {
        await teardown();
        return;
      }
      state.phase = 'listening';
      emit();
    } catch (err) {
      if (cancelled()) {
        await teardown();
        return;
      }
      await teardown();
      state.phase = 'idle';
      setError(LIVE_MESSAGES[err?.code] ? err.code : err?.code === 'azure-auth' ? 'azure-auth' : 'network');
      emit();
    }
  }

  async function stop() {
    if (state.phase === 'idle') return;
    startSeq++;
    state.phase = 'idle';
    await teardown();
    emit();
  }

  return {
    getState: () => ({ ...state, items: state.items.map((i) => ({ ...i })) }),
    start,
    stop,

    /** Briše istoriju razgovora i prekida izgovor. */
    clear() {
      epoch++;
      cancelSpeech();
      state.items = [];
      state.notice = null;
      pendingSpeech = 0;
      state.speaking = false;
      setMuted(false);
      emit();
    },

    dismissNotice() {
      state.notice = null;
      state.error = null;
      emit();
    },

    async dispose() {
      epoch++;
      cancelSpeech();
      await stop();
      live.me.dispose();
      live.other.dispose();
    },
  };
}

/** Tekst statusa za ekran "Uživo". */
export function describeLiveStatus(state) {
  if (state.phase === 'starting') return 'Povezujem se…';
  if (state.phase === 'idle') return 'Pritisnite "Pokreni" da počne prevođenje.';
  if (state.speaking) return 'Izgovaram prevod…';
  if (state.items.some((i) => i.status === 'translating')) return 'Prevodim…';
  if (state.me.interim || state.other.interim) return 'Slušam…';
  return 'Slušam: govorite, sagovornik se čuje sam.';
}
