// Prepoznavanje govora preko Web Speech API-ja (SpeechRecognition).
// Konstruktor se prosleđuje spolja, pa se modul testira lažnim objektom.
//
// Pregledač sam prekida slušanje posle tišine, pa se slušanje ponovo
// pokreće dok korisnik ne pritisne "stop". Greške koje se ne mogu
// popraviti ponovnim pokretanjem (mikrofon, mreža) se prijavljuju jednom.

export const RECOGNITION_LANGS = { en: 'en-US', sr: 'sr-RS' };

export const SPEECH_ERROR_MESSAGES = {
  'mic-denied': 'Mikrofon nije dozvoljen. Dozvolite pristup mikrofonu u podešavanjima pregledača, pa pokušajte ponovo.',
  'no-mic': 'Mikrofon nije pronađen. Proverite da li je povezan.',
  network: 'Prepoznavanje govora traži internet. Proverite vezu.',
  language: 'Ovaj pregledač ne podržava prepoznavanje izabranog jezika.',
  unavailable: 'Prepoznavanje govora trenutno ne radi. Pokušajte ponovo ili kucajte tekst.',
  unknown: 'Prepoznavanje govora nije uspelo. Pokušajte ponovo.',
};

/** Konstruktor SpeechRecognition iz prozora, ili null ako ga pregledač nema. */
export function getSpeechRecognitionCtor(win) {
  return win?.SpeechRecognition ?? win?.webkitSpeechRecognition ?? null;
}

/** Greška pregledača -> naš kod; null znači "ignoriši, slušanje se nastavlja". */
export function mapRecognitionError(error) {
  switch (error) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'mic-denied';
    case 'audio-capture':
      return 'no-mic';
    case 'network':
      return 'network';
    case 'language-not-supported':
      return 'language';
    default:
      return 'unknown';
  }
}

/**
 * @param {{
 *   Ctor: new () => any,
 *   onInterim?: (text: string) => void,
 *   onFinal?: (text: string) => void,
 *   onState?: (state: 'idle'|'listening'|'paused') => void,
 *   onError?: (code: string) => void,
 *   restartDelayMs?: number,
 *   minRunMs?: number,
 *   maxQuickEnds?: number,
 * }} options
 */
export function createRecognizer({
  Ctor,
  onInterim = () => {},
  onFinal = () => {},
  onState = () => {},
  onError = () => {},
  restartDelayMs = 250,
  minRunMs = 700,
  maxQuickEnds = 4,
}) {
  let rec = null;
  let lang = 'en';
  let want = false;
  let suspended = false;
  let startedAt = 0;
  let quickEnds = 0;
  let restartTimer = null;
  let state = 'idle';

  function setState(next) {
    if (next === state) return;
    state = next;
    onState(next);
  }

  function clearTimer() {
    if (restartTimer !== null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  }

  function dropCurrent() {
    const old = rec;
    rec = null; // događaji starog objekta se ignorišu
    if (!old) return;
    try {
      old.abort();
    } catch {
      /* već zaustavljen */
    }
  }

  function fail(code) {
    want = false;
    suspended = false;
    clearTimer();
    dropCurrent();
    setState('idle');
    onError(code);
  }

  function handleResult(e) {
    quickEnds = 0;
    let interim = '';
    for (let i = e.resultIndex ?? 0; i < e.results.length; i++) {
      const res = e.results[i];
      const text = res?.[0]?.transcript ?? '';
      if (res.isFinal) {
        const t = text.trim();
        if (t) onFinal(t);
      } else {
        interim += text;
      }
    }
    onInterim(interim.trim());
  }

  function begin() {
    if (!want || suspended || rec) return;
    let r;
    try {
      r = new Ctor();
      r.lang = RECOGNITION_LANGS[lang];
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        if (r === rec) handleResult(e);
      };
      r.onerror = (e) => {
        if (r !== rec) return;
        const code = mapRecognitionError(e?.error);
        if (code) fail(code);
      };
      r.onend = () => {
        if (r !== rec) return;
        rec = null;
        if (!want) {
          setState('idle');
          return;
        }
        if (suspended) return;
        quickEnds = Date.now() - startedAt < minRunMs ? quickEnds + 1 : 0;
        if (quickEnds >= maxQuickEnds) {
          fail('unavailable');
          return;
        }
        clearTimer();
        restartTimer = setTimeout(() => {
          restartTimer = null;
          begin();
        }, restartDelayMs);
      };
      rec = r;
      startedAt = Date.now();
      r.start();
      setState('listening');
    } catch {
      rec = null;
      fail('unknown');
    }
  }

  return {
    /** Počinje slušanje na jeziku 'en' ili 'sr'; menja jezik ako već sluša. */
    start(nextLang) {
      if (!RECOGNITION_LANGS[nextLang]) throw new Error(`Nepoznat jezik: ${nextLang}`);
      if (want && lang === nextLang && !suspended) return;
      clearTimer();
      dropCurrent();
      lang = nextLang;
      want = true;
      suspended = false;
      quickEnds = 0;
      begin();
    },

    /** Korisnik zaustavlja slušanje; kasniji konačni rezultat još stiže. */
    stop() {
      want = false;
      suspended = false;
      clearTimer();
      if (rec) {
        try {
          rec.stop();
        } catch {
          dropCurrent();
          setState('idle');
        }
      } else {
        setState('idle');
      }
    },

    /** Privremeno prekida slušanje (dok se izgovara prevod). */
    suspend() {
      if (!want || suspended) return;
      suspended = true;
      clearTimer();
      dropCurrent();
      setState('paused');
    },

    /** Nastavlja slušanje posle suspend(). */
    resume() {
      if (!suspended) return;
      suspended = false;
      if (want) {
        quickEnds = 0;
        begin();
      }
    },

    get state() {
      return state;
    },

    dispose() {
      want = false;
      suspended = false;
      clearTimer();
      dropCurrent();
      state = 'idle';
    },
  };
}
