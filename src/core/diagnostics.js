// "Provera uređaja": pre prve smene pokazuje da li sve što treba za rad radi, i
// koliko traje jedan prevod. Svaka stavka ima status ok / warn / fail / info i
// objašnjenje na srpskom (šta je problem i šta da se uradi).

import { pickVoice, loadSynthVoices, supportsSynthesis } from './speaker.js';
import { getSpeechRecognitionCtor } from './speech-recognizer.js';

/** Iznad ovoga se prevod smatra sporim. */
export const SLOW_TRANSLATION_MS = 2500;

const item = (id, label, status, detail) => ({ id, label, status, detail });

/**
 * @param {{
 *   win?: Window, nav?: Navigator,
 *   getTranslator?: () => ({ translate: Function } | null),
 *   voiceWaitMs?: number,
 *   supportsMini?: (win: Window) => boolean,
 * }} options
 * @returns {Promise<Array<{id:string,label:string,status:'ok'|'warn'|'fail'|'info',detail:string}>>}
 */
export async function runDeviceChecks({
  win = window,
  nav = navigator,
  getTranslator = () => null,
  voiceWaitMs = 1500,
  supportsMini = (w) => Boolean(w && 'documentPictureInPicture' in w),
} = {}) {
  const out = [];

  out.push(
    win.isSecureContext
      ? item('secure', 'Bezbedna veza (HTTPS)', 'ok', 'Stranica je otvorena na bezbednoj adresi.')
      : item('secure', 'Bezbedna veza (HTTPS)', 'fail', 'Stranica nije na HTTPS adresi, pa mikrofon neće raditi. Otvorite objavljenu adresu.'),
  );

  out.push(
    nav.onLine === false
      ? item('online', 'Internet', 'fail', 'Nema interneta. Prevod i prepoznavanje govora ne rade bez njega.')
      : item('online', 'Internet', 'ok', 'Veza postoji.'),
  );

  out.push(
    getSpeechRecognitionCtor(win)
      ? item('speech', 'Prepoznavanje govora', 'ok', 'Pregledač podržava prepoznavanje govora.')
      : item('speech', 'Prepoznavanje govora', 'fail', 'Ovaj pregledač ne podržava prepoznavanje govora. Koristite Chrome ili Edge.'),
  );

  // Mikrofon: dozvola i uređaj
  let permission = null;
  try {
    permission = (await nav.permissions?.query({ name: 'microphone' }))?.state ?? null;
  } catch {
    permission = null;
  }
  if (permission === 'granted') out.push(item('mic-permission', 'Dozvola za mikrofon', 'ok', 'Dozvoljeno.'));
  else if (permission === 'denied') out.push(item('mic-permission', 'Dozvola za mikrofon', 'fail', 'Mikrofon je zabranjen. Dozvolite ga u podešavanjima sajta (ikona pored adrese).'));
  else if (permission === 'prompt') out.push(item('mic-permission', 'Dozvola za mikrofon', 'warn', 'Pregledač će tražiti dozvolu pri prvom slušanju. Dozvolite je.'));
  else out.push(item('mic-permission', 'Dozvola za mikrofon', 'info', 'Dozvola ne može unapred da se proveri. Proverava se pri prvom slušanju.'));

  try {
    const devices = (await nav.mediaDevices?.enumerateDevices?.()) ?? null;
    if (devices === null) out.push(item('mic-device', 'Mikrofon', 'info', 'Pregledač ne daje spisak uređaja.'));
    else if (devices.some((d) => d.kind === 'audioinput')) out.push(item('mic-device', 'Mikrofon', 'ok', 'Mikrofon je pronađen.'));
    else out.push(item('mic-device', 'Mikrofon', 'fail', 'Nijedan mikrofon nije pronađen. Proverite da li je slušalica ili mikrofon povezan.'));
  } catch {
    out.push(item('mic-device', 'Mikrofon', 'info', 'Spisak uređaja nije dostupan.'));
  }

  // Glasovi za izgovor
  if (!supportsSynthesis(win)) {
    out.push(item('voice-sr', 'Srpski glas', 'warn', 'Pregledač ne podržava izgovor. Prevod se samo prikazuje.'));
    out.push(item('voice-en', 'Engleski glas', 'warn', 'Pregledač ne podržava izgovor.'));
  } else {
    const voices = await loadSynthVoices(win.speechSynthesis, voiceWaitMs);
    const sr = pickVoice(voices, 'sr');
    if (sr && sr.lang.toLowerCase().startsWith('sr')) out.push(item('voice-sr', 'Srpski glas', 'ok', `Pronađen glas: ${sr.name} (${sr.lang}).`));
    else if (sr) out.push(item('voice-sr', 'Srpski glas', 'warn', `Nema srpskog glasa, koristiće se ${sr.name} (${sr.lang}). Izgovor može da zvuči čudno.`));
    else out.push(item('voice-sr', 'Srpski glas', 'warn', 'Nema srpskog glasa. Prevod na srpski se samo prikazuje, ne izgovara. Dodajte srpski glas u podešavanjima računara.'));
    const en = pickVoice(voices, 'en');
    out.push(en ? item('voice-en', 'Engleski glas', 'ok', `Pronađen glas: ${en.name} (${en.lang}).`) : item('voice-en', 'Engleski glas', 'warn', 'Nema engleskog glasa. Koristiće se podrazumevani glas pregledača.'));
  }

  out.push(
    supportsMini(win)
      ? item('mini', 'Mali prozor iznad ostalih programa', 'ok', 'Podržano.')
      : item('mini', 'Mali prozor iznad ostalih programa', 'warn', 'Traži Chrome ili Edge 116+ na računaru. Bez njega aplikacija radi u običnom prozoru.'),
  );
  out.push(
    nav.wakeLock
      ? item('wake', 'Ekran ostaje budan', 'ok', 'Podržano.')
      : item('wake', 'Ekran ostaje budan', 'warn', 'Nije podržano. Isključite spavanje ekrana u podešavanjima računara.'),
  );
  const standalone = Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);
  out.push(
    standalone
      ? item('install', 'Instalirana aplikacija', 'ok', 'Aplikacija je pokrenuta kao instalirana.')
      : item('install', 'Instalirana aplikacija', 'info', 'Nije instalirana. Preporučeno: ikona za instalaciju pored adrese.'),
  );

  // Pravi prevod: proverava ključ, vezu i brzinu odjednom
  const translator = getTranslator();
  if (!translator) {
    out.push(item('translate', 'Probni prevod', 'fail', 'Nema API ključa. Unesite ga u podešavanjima.'));
  } else {
    try {
      const r = await translator.translate({ text: 'Where are you right now?', from: 'en', to: 'sr' });
      const detail = `"${r.text}" za ${r.totalMs ?? '?'} ms (prvi deo za ${r.firstTokenMs ?? '?'} ms).`;
      out.push(
        (r.totalMs ?? 0) > SLOW_TRANSLATION_MS
          ? item('translate', 'Probni prevod', 'warn', `Radi, ali sporo: ${detail} Probajte model Sonnet 5.5 ili proverite vezu.`)
          : item('translate', 'Probni prevod', 'ok', detail),
      );
    } catch (err) {
      out.push(item('translate', 'Probni prevod', 'fail', err?.message || 'Prevod nije uspeo.'));
    }
  }
  return out;
}

/** Zbir statusa i jedna rečenica za vrh liste. */
export function summarizeChecks(results) {
  const count = (s) => results.filter((r) => r.status === s).length;
  const fail = count('fail');
  const warn = count('warn');
  const text = fail
    ? `${fail} ${fail === 1 ? 'problem treba' : 'problema treba'} da se reši pre rada.`
    : warn
      ? `Sve bitno radi, uz ${warn} ${warn === 1 ? 'napomenu' : 'napomene'}.`
      : 'Sve radi.';
  return { fail, warn, ok: count('ok'), text };
}
