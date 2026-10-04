// Podešavanja korisnika. Čuvaju se samo na njegovom uređaju (localStorage).
// Storage se prosleđuje spolja da bi modul radio i u testovima i kad je
// localStorage nedostupan (privatni prozor, blokiran sajt).

import { DEFAULT_DOMAIN_ID, isDomain } from './domains.js';
import { DEFAULT_MODEL_ID, MODELS } from './models.js';

export const STORAGE_KEY = 'prevodilac.podesavanja.v1';
export const MODES = ['auto', 'en-sr', 'sr-en'];
export const VIEWS = ['type', 'talk'];

export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: '',
  model: DEFAULT_MODEL_ID,
  domain: DEFAULT_DOMAIN_ID,
  mode: 'auto',
  view: 'type',
  speak: true, // izgovaraj prevod u razgovoru
});

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
