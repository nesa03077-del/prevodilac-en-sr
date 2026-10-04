import { describe, expect, it } from 'vitest';
import { SLOW_TRANSLATION_MS, runDeviceChecks, summarizeChecks } from '../src/core/diagnostics.js';
import { createFakeRecognitionCtor, createFakeSynth } from './fake-speech.js';

const v = (lang, name = lang) => ({ lang, name });

function env({ secure = true, online = true, speech = true, voices = [v('en-US'), v('sr-RS')], permission = 'granted', devices = [{ kind: 'audioinput' }], mini = true, wake = true, standalone = false, synthesis = true } = {}) {
  const { synth, Utterance } = createFakeSynth({ voices });
  const win = {
    isSecureContext: secure,
    matchMedia: () => ({ matches: standalone }),
    ...(speech ? { SpeechRecognition: createFakeRecognitionCtor() } : {}),
    ...(synthesis ? { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } : {}),
    ...(mini ? { documentPictureInPicture: {} } : {}),
  };
  const nav = {
    onLine: online,
    permissions: permission === 'unsupported' ? undefined : { query: async () => ({ state: permission }) },
    mediaDevices: devices === null ? undefined : { enumerateDevices: async () => devices },
    ...(wake ? { wakeLock: {} } : {}),
  };
  return { win, nav };
}

const okTranslator = { translate: async () => ({ text: 'Gde si sada?', firstTokenMs: 400, totalMs: 900 }) };
const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));

describe('runDeviceChecks', () => {
  it('sve ispravno: nema problema ni napomena', async () => {
    const results = await runDeviceChecks({ ...env({ standalone: true }), getTranslator: () => okTranslator, voiceWaitMs: 5 });
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(summarizeChecks(results)).toMatchObject({ fail: 0, warn: 0, text: 'Sve radi.' });
    expect(byId(results).translate.detail).toContain('900 ms');
  });

  it('redosled i broj stavki su stabilni', async () => {
    const results = await runDeviceChecks({ ...env(), getTranslator: () => okTranslator, voiceWaitMs: 5 });
    expect(results.map((r) => r.id)).toEqual([
      'secure', 'online', 'speech', 'mic-permission', 'mic-device', 'voice-sr', 'voice-en', 'mini', 'wake', 'install', 'translate',
    ]);
    for (const r of results) {
      expect(['ok', 'warn', 'fail', 'info']).toContain(r.status);
      expect(r.label).toBeTruthy();
      expect(r.detail).toBeTruthy();
    }
  });

  it('stranica bez HTTPS-a i bez interneta su problemi', async () => {
    const r = byId(await runDeviceChecks({ ...env({ secure: false, online: false }), voiceWaitMs: 5 }));
    expect(r.secure.status).toBe('fail');
    expect(r.secure.detail).toContain('HTTPS');
    expect(r.online.status).toBe('fail');
  });

  it('pregledač bez prepoznavanja govora je problem', async () => {
    const r = byId(await runDeviceChecks({ ...env({ speech: false }), voiceWaitMs: 5 }));
    expect(r.speech.status).toBe('fail');
    expect(r.speech.detail).toContain('Chrome');
  });

  it('dozvola za mikrofon: odbijena, traži se, nepoznata', async () => {
    expect(byId(await runDeviceChecks({ ...env({ permission: 'denied' }), voiceWaitMs: 5 }))['mic-permission'].status).toBe('fail');
    expect(byId(await runDeviceChecks({ ...env({ permission: 'prompt' }), voiceWaitMs: 5 }))['mic-permission'].status).toBe('warn');
    expect(byId(await runDeviceChecks({ ...env({ permission: 'unsupported' }), voiceWaitMs: 5 }))['mic-permission'].status).toBe('info');
  });

  it('nema mikrofona je problem; spisak nedostupan je informacija', async () => {
    expect(byId(await runDeviceChecks({ ...env({ devices: [{ kind: 'audiooutput' }] }), voiceWaitMs: 5 }))['mic-device'].status).toBe('fail');
    expect(byId(await runDeviceChecks({ ...env({ devices: null }), voiceWaitMs: 5 }))['mic-device'].status).toBe('info');
  });

  it('glasovi: srpski, rezervni hrvatski, nijedan', async () => {
    const sr = byId(await runDeviceChecks({ ...env({ voices: [v('en-US'), v('sr-RS', 'Srpski')] }), voiceWaitMs: 5 }));
    expect(sr['voice-sr'].status).toBe('ok');
    expect(sr['voice-sr'].detail).toContain('Srpski');
    const hr = byId(await runDeviceChecks({ ...env({ voices: [v('en-US'), v('hr-HR', 'Hrvatski')] }), voiceWaitMs: 5 }));
    expect(hr['voice-sr'].status).toBe('warn');
    expect(hr['voice-sr'].detail).toContain('Hrvatski');
    const none = byId(await runDeviceChecks({ ...env({ voices: [v('en-US')] }), voiceWaitMs: 5 }));
    expect(none['voice-sr'].status).toBe('warn');
    expect(none['voice-sr'].detail).toContain('samo prikazuje');
    expect(none['voice-en'].status).toBe('ok');
  });

  it('bez izgovora u pregledaču obe stavke su napomene', async () => {
    const r = byId(await runDeviceChecks({ ...env({ synthesis: false }), voiceWaitMs: 5 }));
    expect(r['voice-sr'].status).toBe('warn');
    expect(r['voice-en'].status).toBe('warn');
  });

  it('mali prozor, ekran budan i instalacija su napomene ili informacije', async () => {
    const r = byId(await runDeviceChecks({ ...env({ mini: false, wake: false, standalone: false }), voiceWaitMs: 5 }));
    expect(r.mini.status).toBe('warn');
    expect(r.wake.status).toBe('warn');
    expect(r.install.status).toBe('info');
  });

  it('probni prevod: nema ključa, greška, sporo, brzo', async () => {
    const none = byId(await runDeviceChecks({ ...env(), getTranslator: () => null, voiceWaitMs: 5 }));
    expect(none.translate.status).toBe('fail');
    expect(none.translate.detail).toContain('API ključ');

    const err = byId(await runDeviceChecks({
      ...env(),
      getTranslator: () => ({ translate: async () => { throw Object.assign(new Error('API ključ nije ispravan.'), { code: 'auth' }); } }),
      voiceWaitMs: 5,
    }));
    expect(err.translate.status).toBe('fail');
    expect(err.translate.detail).toBe('API ključ nije ispravan.');

    const slow = byId(await runDeviceChecks({
      ...env(),
      getTranslator: () => ({ translate: async () => ({ text: 'Gde si?', firstTokenMs: 1500, totalMs: SLOW_TRANSLATION_MS + 1 }) }),
      voiceWaitMs: 5,
    }));
    expect(slow.translate.status).toBe('warn');
    expect(slow.translate.detail).toContain('sporo');

    const fast = byId(await runDeviceChecks({ ...env(), getTranslator: () => okTranslator, voiceWaitMs: 5 }));
    expect(fast.translate.status).toBe('ok');
  });
});

describe('summarizeChecks', () => {
  it('broji i piše rečenicu', () => {
    expect(summarizeChecks([{ status: 'fail' }, { status: 'warn' }, { status: 'ok' }])).toEqual({ fail: 1, warn: 1, ok: 1, text: '1 problem treba da se reši pre rada.' });
    expect(summarizeChecks([{ status: 'fail' }, { status: 'fail' }]).text).toBe('2 problema treba da se reši pre rada.');
    expect(summarizeChecks([{ status: 'warn' }, { status: 'ok' }]).text).toBe('Sve bitno radi, uz 1 napomenu.');
    expect(summarizeChecks([{ status: 'warn' }, { status: 'warn' }]).text).toBe('Sve bitno radi, uz 2 napomene.');
    expect(summarizeChecks([{ status: 'ok' }]).text).toBe('Sve radi.');
  });
});
