// Razgovor govorom: jedan govornik po dugmetu ("Engleski govori" / "Srpski govori").
// Spaja prepoznavanje govora, prevod, izgovor i istoriju razgovora.
//
// - Dok osoba govori, delimičan tekst se prevodi uživo (samo za prikaz).
// - Kad pregledač javi završenu rečenicu, ona postaje stavka razgovora, prevodi se
//   (uz prethodne rečenice kao kontekst) i izgovara na jeziku sagovornika.
// - Dok se prevod izgovara, mikrofon je pauziran da aplikacija ne bi čula sebe.

import { createLiveSession } from './live.js';
import { compareNumbers } from './numbers.js';
import { SPEECH_ERROR_MESSAGES } from './speech-recognizer.js';
import { ERROR_MESSAGES, TranslationError } from './translator.js';
import { toLatin } from './transliterate.js';

export const MAX_ITEMS = 50;
const OTHER = { en: 'sr', sr: 'en' };

// Isti tekst bez obzira na velika slova i znakove interpunkcije.
const canonical = (t) => (t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const NO_VOICE_MESSAGE =
  'Ovaj uređaj nema srpski glas, pa se prevod na srpski samo prikazuje.';
export const NO_KEY_MESSAGE = 'Za prevod je potreban Anthropic API ključ.';

/**
 * @param {{
 *   getTranslator: () => ({ translate: Function } | null),
 *   createRecognizer: (handlers: object) => ({ start: Function, stop: Function, suspend: Function, resume: Function, dispose: Function }),
 *   speaker?: { speak: Function, cancel: Function } | null,
 *   getSpeak?: () => boolean,
 *   maxContext?: number,
 *   interimDebounceMs?: number,
 *   onChange?: (state: object) => void,
 *   onMetric?: (metric: { firstTokenMs: number|null, totalMs: number, model: string, reused: boolean }) => void,
 * }} options
 */
export function createConversation({
  getTranslator,
  createRecognizer,
  speaker = null,
  getSpeak = () => true,
  maxContext = 6,
  interimDebounceMs = 500,
  onChange = () => {},
  onMetric = () => {},
}) {
  let nextId = 1;
  let epoch = 0; // raste pri brisanju razgovora; stare stavke više ne izgovaraju
  let speakerLang = 'en'; // ko je poslednji govorio (konačan tekst može da stigne posle stop)
  let pendingSpeech = 0;
  let pipeline = Promise.resolve();
  const missingVoice = new Set();

  const state = {
    listening: null, // 'en' | 'sr' | null
    phase: 'idle', // 'idle' | 'listening' | 'paused'
    interim: '',
    interimTranslation: '',
    items: [],
    speaking: false,
    error: null, // { code, message }
    notice: null, // jednokratna napomena (npr. nema srpskog glasa)
  };

  const emit = () =>
    onChange({
      ...state,
      error: state.error ? { ...state.error } : null,
      items: state.items.map((i) => ({ ...i })),
    });

  const normalize = (text, lang) => {
    const t = (text ?? '').trim();
    return lang === 'sr' ? toLatin(t) : t;
  };

  const contextBefore = (id) =>
    state.items
      .filter((i) => i.id < id && i.status === 'done')
      .slice(-maxContext)
      .map((i) => i.source);

  // Prevod delimičnog teksta uživo; greške se ignorišu jer će ih prijaviti konačan prevod.
  const live = createLiveSession({
    translator: {
      translate: (req) => {
        const t = getTranslator();
        return t
          ? t.translate(req)
          : Promise.reject(new TranslationError('auth', ERROR_MESSAGES.auth));
      },
    },
    getMode: () => (speakerLang === 'sr' ? 'sr-en' : 'en-sr'),
    getContext: () => contextBefore(Infinity),
    debounceMs: interimDebounceMs,
    onUpdate: ({ source, translation }) => {
      if (!state.listening) return;
      state.interimTranslation = source ? translation : '';
      emit();
    },
    onError: () => {},
  });

  function clearInterim() {
    state.interim = '';
    state.interimTranslation = '';
    live.flush('');
  }

  function setError(code, message) {
    state.error = { code, message };
  }

  async function speakItem(item) {
    recognizer.suspend(); // bezbedno i kad je već pauzirano
    state.speaking = true;
    emit();
    const result = await speaker.speak(item.translation, item.to);
    if (result.reason === 'no-voice' && !missingVoice.has(item.to)) {
      missingVoice.add(item.to);
      state.notice = NO_VOICE_MESSAGE;
    }
    return result;
  }

  function finishSpeech() {
    pendingSpeech = Math.max(0, pendingSpeech - 1);
    if (pendingSpeech === 0) {
      state.speaking = false;
      if (state.listening) recognizer.resume();
      emit();
    }
  }

  // Dodaje stavku u razgovor; prevod (translated) se završava kad bude spreman, a izgovor ide redom.
  function commit(item, translated, willSpeak, myEpoch) {
    if (willSpeak) pendingSpeech++;
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

  function markDone(item, text) {
    item.translation = text;
    item.status = 'done';
    item.numbers = compareNumbers(item.source, text);
    emit();
    return true;
  }

  function pushItem(item) {
    state.items.push(item);
    if (state.items.length > MAX_ITEMS) state.items.splice(0, state.items.length - MAX_ITEMS);
  }

  function handleFinal(rawText) {
    const from = speakerLang;
    const to = OTHER[from];
    const source = normalize(rawText, from);
    if (!source) return;

    // Ako je prevod istog teksta već stigao dok je osoba govorila, koristi se odmah.
    const earlier = live.lastResult;
    const reuse =
      earlier && earlier.from === from && earlier.to === to && canonical(earlier.source) === canonical(source)
        ? earlier.translation
        : null;
    clearInterim();

    const item = {
      id: nextId++, from, to, source, translation: '', status: 'translating',
      error: null, numbers: null, check: null, fixed: false, reused: false,
    };
    pushItem(item);

    const myEpoch = epoch;
    const willSpeak = Boolean(speaker) && getSpeak();
    state.error = null;

    let translated;
    if (reuse) {
      item.reused = true;
      onMetric({ firstTokenMs: 0, totalMs: 0, model: '', reused: true });
      translated = Promise.resolve(markDone(item, reuse));
    } else {
      emit();
      const translator = getTranslator();
      const work = translator
        ? translator.translate({
            text: source,
            from,
            to,
            context: contextBefore(item.id),
            onText: (partial) => {
              item.translation = partial;
              emit();
            },
          })
        : Promise.reject(new TranslationError('auth', NO_KEY_MESSAGE));
      translated = work.then(
        (r) => {
          onMetric({ firstTokenMs: r.firstTokenMs ?? null, totalMs: r.totalMs ?? 0, model: r.model ?? '', reused: false });
          return markDone(item, r.text);
        },
        (err) => {
          item.status = 'error';
          item.error = err?.message || ERROR_MESSAGES.unknown;
          emit();
          return false;
        },
      );
    }
    commit(item, translated, willSpeak, myEpoch);
  }

  /** Unapred proverena fraza dispečera: srpski tekst se izgovara odmah, bez prevoda. */
  function addPhrase(phrase) {
    if (!phrase?.en || !phrase?.sr) throw new Error('Fraza nije ispravna.');
    const item = {
      id: nextId++, from: 'en', to: 'sr', source: phrase.en, translation: phrase.sr,
      status: 'done', error: null, numbers: null, check: null, fixed: true, reused: false,
    };
    if (speaker && state.speaking) speaker.cancel();
    pushItem(item);
    state.error = null;
    emit();
    commit(item, Promise.resolve(true), Boolean(speaker) && getSpeak(), epoch);
  }

  /** Provera prevodom nazad: prevod se vraća na jezik govornika da bi se video smisao. */
  function verify(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item || item.status !== 'done' || item.fixed || item.check?.status === 'translating') return;
    const translator = getTranslator();
    if (!translator) return;
    item.check = { status: 'translating', text: '', numbers: null, error: null };
    emit();
    translator
      .translate({ text: item.translation, from: item.to, to: item.from, context: [] })
      .then(
        (r) => {
          item.check = { status: 'done', text: r.text, numbers: compareNumbers(item.source, r.text), error: null };
        },
        (err) => {
          item.check = { status: 'error', text: '', numbers: null, error: err?.message || ERROR_MESSAGES.unknown };
        },
      )
      .then(emit);
  }

  const recognizer = createRecognizer({
    onInterim: (text) => {
      const t = normalize(text, speakerLang);
      state.interim = t;
      if (t) live.update(t);
      else {
        state.interimTranslation = '';
        live.flush('');
      }
      emit();
    },
    onFinal: handleFinal,
    onState: (phase) => {
      state.phase = phase;
      emit();
    },
    onError: (code) => {
      state.listening = null;
      clearInterim();
      setError(code, SPEECH_ERROR_MESSAGES[code] ?? SPEECH_ERROR_MESSAGES.unknown);
      emit();
    },
  });

  return {
    getState: () => ({ ...state, items: state.items.map((i) => ({ ...i })) }),

    /** Počinje (ili menja) slušanje: 'en' govori engleski, 'sr' govori srpski. */
    startListening(lang) {
      if (lang !== 'en' && lang !== 'sr') throw new Error(`Nepoznat jezik: ${lang}`);
      if (speaker && state.speaking) speaker.cancel();
      if (speakerLang !== lang) clearInterim();
      speakerLang = lang;
      state.listening = lang;
      state.error = null;
      state.notice = null;
      recognizer.start(lang);
      emit();
    },

    /** Zaustavlja slušanje; rečenica koja je upravo završena se još prevodi. */
    stopListening() {
      state.listening = null;
      state.interim = '';
      state.interimTranslation = '';
      live.flush('');
      recognizer.stop();
      emit();
    },

    /** Briše istoriju razgovora (i prekida izgovor). */
    clear() {
      epoch++;
      speaker?.cancel();
      state.items = [];
      state.error = null;
      state.notice = null;
      clearInterim();
      emit();
    },

    addPhrase,
    verify,

    dismissNotice() {
      state.notice = null;
      state.error = null;
      emit();
    },

    dispose() {
      epoch++;
      live.dispose();
      recognizer.dispose();
      speaker?.cancel();
    },
  };
}

/** Tekst statusa iznad razgovora, prema stanju razgovora. */
export function describeStatus(state) {
  if (state.speaking) return 'Izgovaram prevod…';
  const translating = state.items.some((i) => i.status === 'translating');
  if (state.listening && state.interim) return 'Slušam…';
  if (translating) return state.listening ? 'Slušam i prevodim…' : 'Prevodim…';
  if (state.listening === 'en') return 'Slušam: govorite engleski.';
  if (state.listening === 'sr') return 'Slušam: govorite srpski.';
  return 'Pritisnite dugme i govorite.';
}
