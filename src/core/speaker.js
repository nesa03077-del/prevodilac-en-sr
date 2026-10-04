// Izgovor prevoda preko speechSynthesis. Objekti pregledača se prosleđuju
// spolja (testovi koriste lažne). Izgovori se redaju jedan za drugim.

import { RECOGNITION_LANGS } from './speech-recognizer.js';

const norm = (lang) => (lang ?? '').toLowerCase().replace('_', '-');
const base = (lang) => norm(lang).split('-')[0];

// Srpski glas tražimo prvo, a hrvatski/bosanski su rezerva (isto pismo i slično izgovaranje).
const VOICE_PREFERENCE = { sr: ['sr', 'hr', 'bs'], en: ['en'] };
const PREFERRED_REGION = { sr: 'sr-rs', en: 'en-us' };

/** Bira glas za jezik 'en' ili 'sr'; null ako odgovarajućeg nema. */
export function pickVoice(voices, lang) {
  for (const prefix of VOICE_PREFERENCE[lang] ?? []) {
    const matches = (voices ?? []).filter((v) => base(v.lang) === prefix);
    if (matches.length === 0) continue;
    return (
      matches.find((v) => norm(v.lang) === PREFERRED_REGION[lang]) ??
      matches.find((v) => v.default) ??
      matches[0]
    );
  }
  return null;
}

/** Da li pregledač ima izgovor. */
export function supportsSynthesis(win) {
  return Boolean(win?.speechSynthesis && win?.SpeechSynthesisUtterance);
}

/**
 * Lista glasova; neki pregledači je pune tek posle prvog poziva, pa se čeka voiceschanged.
 * @param {any} synth
 * @param {number} waitMs
 */
export async function loadSynthVoices(synth, waitMs = 1500) {
  const now = synth.getVoices();
  if (now.length > 0) return now;
  await new Promise((resolve) => {
    let timer = null;
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', done);
      resolve();
    };
    timer = setTimeout(done, waitMs);
    synth.addEventListener?.('voiceschanged', done);
  });
  return synth.getVoices();
}

/**
 * @param {{ synth: any, Utterance: new (text: string) => any, waitVoicesMs?: number }} options
 */
export function createSpeaker({ synth, Utterance, waitVoicesMs = 1500 }) {
  let chain = Promise.resolve();
  let epoch = 0;

  const loadVoices = () => loadSynthVoices(synth, waitVoicesMs);

  async function speakNow(text, lang, myEpoch) {
    const voices = await loadVoices();
    if (myEpoch !== epoch) return { spoken: false, reason: 'cancelled' };
    const voice = pickVoice(voices, lang);
    // Bez srpskog glasa bi pregledač čitao srpski engleskim izgovorom.
    if (!voice && lang === 'sr') return { spoken: false, reason: 'no-voice' };

    const utterance = new Utterance(text);
    utterance.lang = voice?.lang ?? RECOGNITION_LANGS[lang];
    if (voice) utterance.voice = voice;

    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      utterance.onend = () => finish({ spoken: true, voiceLang: utterance.lang });
      utterance.onerror = (e) => {
        const cancelled = e?.error === 'canceled' || e?.error === 'interrupted';
        finish({ spoken: false, reason: cancelled ? 'cancelled' : 'error' });
      };
      // Neki pregledači nikad ne jave kraj dugog izgovora.
      timer = setTimeout(() => finish({ spoken: true, voiceLang: utterance.lang }), 8000 + text.length * 120);
      try {
        synth.resume?.();
        synth.speak(utterance);
      } catch {
        finish({ spoken: false, reason: 'error' });
      }
    });
  }

  return {
    /** Izgovara tekst posle ranijih; vraća { spoken, reason? }. */
    speak(text, lang) {
      const myEpoch = epoch;
      const run = () =>
        myEpoch !== epoch ? { spoken: false, reason: 'cancelled' } : speakNow(text, lang, myEpoch);
      const result = chain.then(run, run);
      chain = result.then(() => {}, () => {});
      return result;
    },

    /** Prekida izgovor koji traje i briše red čekanja. */
    cancel() {
      epoch++;
      try {
        synth.cancel();
      } catch {
        /* nema šta da se prekine */
      }
    },
  };
}
