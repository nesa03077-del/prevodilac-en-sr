import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEY,
  createSettingsStore,
  isAzureRegion,
  looksLikeApiKey,
  looksLikeAzureKey,
  maskKey,
  normalizeSettings,
} from '../src/core/settings.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = String(v)),
    removeItem: (k) => void delete data[k],
  };
}

const brokenStorage = {
  getItem() { throw new Error('blokirano'); },
  setItem() { throw new Error('blokirano'); },
  removeItem() { throw new Error('blokirano'); },
};

describe('normalizeSettings', () => {
  it('prazan ulaz daje podrazumevane vrednosti', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('tekst')).toEqual(DEFAULT_SETTINGS);
  });

  it('odbacuje nepoznat model i smer, seče razmake u ključu', () => {
    expect(normalizeSettings({ apiKey: '  sk-ant-x  ', model: 'gpt-4', domain: 'x', mode: 'de-en', view: 'x', speak: 'da' })).toEqual({
      ...DEFAULT_SETTINGS,
      apiKey: 'sk-ant-x',
    });
  });

  it('zadržava ispravne vrednosti', () => {
    const s = {
      apiKey: 'k', model: 'claude-haiku-4-5', domain: 'general', mode: 'sr-en', view: 'live', speak: false,
      azureKey: 'a'.repeat(32), azureRegion: 'eastus', liveMyLang: 'en', liveMode: 'single-mic',
      liveSpeakToOther: false, liveSpeakToMe: true, outputDeviceId: 'kabl-1',
    };
    expect(normalizeSettings(s)).toEqual(s);
  });
});

describe('createSettingsStore', () => {
  it('čuva i učitava', () => {
    const store = createSettingsStore(memoryStorage());
    const saved = { ...DEFAULT_SETTINGS, apiKey: 'abc', model: 'claude-sonnet-5-5', domain: 'general', mode: 'en-sr', view: 'talk', speak: false, azureKey: 'b'.repeat(32), liveMode: 'single-mic' };
    expect(store.save(saved)).toBe(true);
    expect(store.load()).toEqual(saved);
  });

  it('oštećen JSON daje podrazumevane vrednosti', () => {
    const store = createSettingsStore(memoryStorage({ [STORAGE_KEY]: '{nije json' }));
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('clearAll briše sve, uključujući ključ', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(storage);
    store.save({ apiKey: 'abc' });
    expect(store.clearAll()).toBe(true);
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
    expect(store.load().apiKey).toBe('');
  });

  it('radi i kad je storage blokiran ili ga nema', () => {
    for (const storage of [brokenStorage, null, undefined]) {
      const store = createSettingsStore(storage);
      expect(store.load()).toEqual(DEFAULT_SETTINGS);
      expect(store.save({ apiKey: 'abc' })).toBe(false);
      expect(store.clearAll()).toBe(false);
    }
  });
});

describe('ključ', () => {
  it('prepoznaje oblik Anthropic ključa', () => {
    expect(looksLikeApiKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(looksLikeApiKey('  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ')).toBe(true);
    expect(looksLikeApiKey('sk-ant-kratko')).toBe(false);
    expect(looksLikeApiKey('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });

  it('maskira ključ', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('sk-ant-…wxyz');
    expect(maskKey('kratko')).toBe('••••');
    expect(maskKey('')).toBe('');
    expect(maskKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).not.toContain('abcdefgh');
  });
});

describe('podešavanja za prevođenje uživo', () => {
  it('podrazumevane vrednosti', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      azureKey: '', azureRegion: 'westeurope', liveMyLang: 'sr', liveMode: 'two-streams',
      liveSpeakToOther: true, liveSpeakToMe: false, outputDeviceId: '',
    });
  });

  it('čisti neispravne vrednosti', () => {
    const s = normalizeSettings({
      azureKey: 5, azureRegion: 'ne valja!', liveMyLang: 'de', liveMode: 'nešto',
      liveSpeakToOther: 'da', liveSpeakToMe: 1, outputDeviceId: 7,
    });
    expect(s).toMatchObject({
      azureKey: '', azureRegion: 'westeurope', liveMyLang: 'sr', liveMode: 'two-streams',
      liveSpeakToOther: true, liveSpeakToMe: false, outputDeviceId: '',
    });
  });

  it('region se piše malim slovima i seče', () => {
    expect(normalizeSettings({ azureRegion: ' WestEurope ' }).azureRegion).toBe('westeurope');
  });

  it('isAzureRegion i looksLikeAzureKey', () => {
    expect(isAzureRegion('westeurope')).toBe(true);
    expect(isAzureRegion('eastus2')).toBe(true);
    expect(isAzureRegion('ne valja')).toBe(false);
    expect(isAzureRegion('')).toBe(false);
    expect(isAzureRegion(5)).toBe(false);
    expect(looksLikeAzureKey('a1b2c3d4'.repeat(4))).toBe(true);
    expect(looksLikeAzureKey('  ' + 'A'.repeat(32) + '  ')).toBe(true);
    expect(looksLikeAzureKey('kratko')).toBe(false);
    expect(looksLikeAzureKey('sk-ant-' + 'a'.repeat(40))).toBe(false);
    expect(looksLikeAzureKey(null)).toBe(false);
  });
});
