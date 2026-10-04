// Podešavanja korisnika. Čuvaju se samo na njegovom uređaju (localStorage).
// Storage se prosleđuje spolja da bi modul radio i u testovima i kad je
// localStorage nedostupan (privatni prozor, blokiran sajt).

import { DEFAULT_DOMAIN_ID, isDomain } from './domains.js';
import { DEFAULT_MODEL_ID, MODELS } from './models.js';

export const STORAGE_KEY = 'prevodilac.podesavanja.v1';
export const MODES = ['auto', 'en-sr', 'sr-en'];
export const VIEWS = ['type', 'talk', 'live'];
export const LIVE_MODES = ['two-streams', 'single-mic'];
export const DEFAULT_AZURE_REGION = 'westeurope';

export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: '',
  model: DEFAULT_MODEL_ID,
  domain: DEFAULT_DOMAIN_ID,
  mode: 'auto',
  view: 'type',
  speak: true, // izgovaraj prevod u razgovoru
  // Prevođenje uživo (Azure Speech za prepoznavanje govora i glas)
  azureKey: '',
  azureRegion: DEFAULT_AZURE_REGION,
  liveMyLang: 'sr', // jezik kojim ja govorim
  liveMode: 'two-streams', // 'two-streams' (moj mikrofon + zvuk poziva) ili 'single-mic'
  liveSpeakToOther: true, // izgovori prevod sagovorniku
  liveSpeakToMe: false, // izgovori prevod meni
  outputDeviceId: '', // izlaz za glas sagovorniku (npr. virtuelni kabl)
});

/** Region Azure resursa, npr. westeurope, eastus, germanywestcentral. */
export function isAzureRegion(value) {
  return typeof value === 'string' && /^[a-z0-9]{3,30}$/i.test(value.trim());
}

/** Da li tekst liči na Azure Speech ključ (32 ili više slova i cifara). */
export function looksLikeAzureKey(key) {
  return /^[A-Za-z0-9]{32,100}$/.test((key ?? '').trim());
}

/** Čisti učitane vrednosti: nepoznat model ili smer vraćamo na podrazumevani. */
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    apiKey: typeof s.apiKey === 'string' ? s.apiKey.trim() : DEFAULT_SETTINGS.apiKey,
    model: MODELS.some((m) => m.id === s.model) ? s.model : DEFAULT_SETTINGS.model,
    domain: isDomain(s.domain) ? s.domain : DEFAULT_SETTINGS.domain,
    mode: MODES.includes(s.mode) ? s.mode : DEFAULT_SETTINGS.mode,
    view: VIEWS.includes(s.view) ? s.view : DEFAULT_SETTINGS.view,
    speak: typeof s.speak === 'boolean' ? s.speak : DEFAULT_SETTINGS.speak,
    azureKey: typeof s.azureKey === 'string' ? s.azureKey.trim() : DEFAULT_SETTINGS.azureKey,
    azureRegion: isAzureRegion(s.azureRegion) ? s.azureRegion.trim().toLowerCase() : DEFAULT_SETTINGS.azureRegion,
    liveMyLang: s.liveMyLang === 'en' ? 'en' : 'sr',
    liveMode: LIVE_MODES.includes(s.liveMode) ? s.liveMode : DEFAULT_SETTINGS.liveMode,
    liveSpeakToOther: typeof s.liveSpeakToOther === 'boolean' ? s.liveSpeakToOther : DEFAULT_SETTINGS.liveSpeakToOther,
    liveSpeakToMe: typeof s.liveSpeakToMe === 'boolean' ? s.liveSpeakToMe : DEFAULT_SETTINGS.liveSpeakToMe,
    outputDeviceId: typeof s.outputDeviceId === 'string' ? s.outputDeviceId.slice(0, 300) : '',
  };
}

/** @param {Pick<Storage,'getItem'|'setItem'|'removeItem'>|null|undefined} storage */
export function createSettingsStore(storage) {
  function load() {
    try {
      const text = storage?.getItem(STORAGE_KEY);
      return normalizeSettings(text ? JSON.parse(text) : null);
    } catch {
      return normalizeSettings(null);
    }
  }

  /** Vraća true ako je upis uspeo. */
  function save(settings) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
      return true;
    } catch {
      return false;
    }
  }

  function clearAll() {
    try {
      storage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  return { load, save, clearAll };
}

/** Da li tekst liči na Anthropic API ključ (samo osnovna provera oblika). */
export function looksLikeApiKey(key) {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test((key ?? '').trim());
}

/** Prikaz ključa bez otkrivanja: sk-ant-…abcd */
export function maskKey(key) {
  const k = (key ?? '').trim();
  if (!k) return '';
  return k.length <= 12 ? '••••' : `${k.slice(0, 7)}…${k.slice(-4)}`;
}
