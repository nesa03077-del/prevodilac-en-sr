import { describe, expect, it } from 'vitest';
import {
  AZURE_ERROR_MESSAGES, AZURE_LANGS, AZURE_VOICES, createAzureRecognizer, createAzureSynthesizer,
  fromAzureLang, loadAzureSdk, mapAzureError, testAzure,
} from '../src/core/azure-speech.js';
import { createFakeAzureSdk } from './fake-azure.js';

function setup(languages, extra = {}) {
  const sdk = createFakeAzureSdk();
  const events = { interim: [], final: [], state: [], error: [] };
  const rec = createAzureRecognizer({
    sdk, key: 'KLJUC', region: 'westeurope', languages,
    onInterim: (t, l) => events.interim.push([t, l]),
    onFinal: (t, l) => events.final.push([t, l]),
    onState: (s) => events.state.push(s),
    onError: (c) => events.error.push(c),
    ...extra,
  });
  return { sdk, rec, events, native: sdk.log.recognizers[0] };
}

describe('pomoćne funkcije', () => {
  it('fromAzureLang', () => {
    expect(fromAzureLang('en-US')).toBe('en');
    expect(fromAzureLang('sr-RS')).toBe('sr');
    expect(fromAzureLang('sr-Latn-RS')).toBe('sr');
    expect(fromAzureLang('de-DE')).toBe(null);
    expect(fromAzureLang(undefined)).toBe(null);
  });

  it('mapAzureError pokriva sve grupe i ima poruku za svaku', () => {
    const sdk = createFakeAzureSdk();
    const E = sdk.CancellationErrorCode;
    expect(mapAzureError(sdk, E.AuthenticationFailure)).toBe('azure-auth');
    expect(mapAzureError(sdk, E.Forbidden)).toBe('azure-auth');
    expect(mapAzureError(sdk, E.TooManyRequests)).toBe('quota');
    expect(mapAzureError(sdk, E.ConnectionFailure)).toBe('network');
    expect(mapAzureError(sdk, E.ServiceTimeout)).toBe('network');
    expect(mapAzureError(sdk, E.ServiceUnavailable)).toBe('unavailable');
    expect(mapAzureError(sdk, E.BadRequest)).toBe('unknown');
    for (const code of ['azure-auth', 'quota', 'network', 'unavailable', 'unknown']) expect(AZURE_ERROR_MESSAGES[code]).toBeTruthy();
  });

  it('SDK za proveru može da se podmetne', async () => {
    const fake = createFakeAzureSdk();
    globalThis.__PREVODILAC_FAKE_AZURE__ = fake;
    try {
      expect(await loadAzureSdk()).toBe(fake);
    } finally {
      delete globalThis.__PREVODILAC_FAKE_AZURE__;
    }
  });

  it('pravi Azure SDK se učitava i ima ono što koristimo', async () => {
    const sdk = await loadAzureSdk();
    for (const name of ['SpeechConfig', 'SpeechRecognizer', 'SpeechSynthesizer', 'AudioInputStream', 'AudioConfig', 'AutoDetectSourceLanguageConfig', 'AutoDetectSourceLanguageResult', 'PropertyId', 'ResultReason', 'CancellationReason', 'CancellationErrorCode', 'SpeechSynthesisOutputFormat']) {
      expect(sdk[name], name).toBeTruthy();
    }
    expect(typeof sdk.AudioInputStream.createPushStream).toBe('function');
    expect(typeof sdk.SpeechRecognizer.FromConfig).toBe('function');
    expect(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode).toBeDefined();
  });
});

describe('createAzureRecognizer: jedan jezik', () => {
  it('podešava jezik, ključ i region, i tekst se prevodi onakav kakav je izgovoren', () => {
    const { sdk, native } = setup(['sr']);
    const cfg = sdk.log.configs[0];
    expect(cfg.key).toBe('KLJUC');
    expect(cfg.region).toBe('westeurope');
    expect(cfg.speechRecognitionLanguage).toBe(AZURE_LANGS.sr);
    expect(cfg.profanity).toBe(sdk.ProfanityOption.Raw);
    expect(native.auto).toBe(null);
  });

  it('delimičan i konačan tekst idu na prave strane, sa jezikom', () => {
    const { native, events } = setup(['en']);
    native.emitInterim('where are', undefined);
    native.emitFinal('Where are you?', undefined);
    native.emitNoMatch();
    native.emitFinal('   ');
    expect(events.interim).toEqual([['where are', 'en']]);
    expect(events.final).toEqual([['Where are you?', 'en']]);
  });

  it('start javlja stanje; greška pri pokretanju odbija obećanje', async () => {
    const { rec, native, events } = setup(['en']);
    await rec.start();
    expect(native.started).toBe(true);
    expect(events.state).toEqual(['listening']);

    const bad = setup(['en']);
    bad.native.failStart = 'nema veze';
    await expect(bad.rec.start()).rejects.toThrow('nema veze');
  });

  it('PCM se prosleđuje kao kopija tačne dužine', () => {
    const { sdk, rec } = setup(['en']);
    const big = new Int16Array([1, 2, 3, 4, 5, 6]);
    rec.write(big.subarray(2, 5)); // pogled na deo bafera
    const written = sdk.log.pushes[0].chunks[0];
    expect(Array.from(new Int16Array(written))).toEqual([3, 4, 5]);
    expect(written.byteLength).toBe(6);
  });

  it('greške servisa se javljaju kao naši kodovi, a kraj toka se ignoriše', () => {
    const { sdk, native, events } = setup(['en']);
    native.emitEnd();
    native.emitError(sdk.CancellationErrorCode.AuthenticationFailure);
    native.emitError(sdk.CancellationErrorCode.TooManyRequests);
    expect(events.error).toEqual(['azure-auth', 'quota']);
  });

  it('stop zatvara tok i prepoznavač; kasniji događaji i zvuk se ignorišu', async () => {
    const { sdk, rec, native, events } = setup(['en']);
    await rec.start();
    await rec.stop();
    expect(native.stopped).toBe(true);
    expect(native.closed).toBe(true);
    expect(sdk.log.pushes[0].closed).toBe(true);
    native.emitFinal('kasno');
    native.emitError(sdk.CancellationErrorCode.ConnectionFailure);
    rec.write(new Int16Array(10));
    expect(events.final).toEqual([]);
    expect(events.error).toEqual([]);
    expect(sdk.log.pushes[0].chunks).toEqual([]);
    await rec.stop(); // dvaput je bezbedno
  });

  it('nepoznat jezik je greška', () => {
    expect(() => setup(['de'])).toThrow();
    expect(() => setup([])).toThrow();
  });
});

describe('createAzureRecognizer: automatski jezik', () => {
  it('traži oba jezika, neprekidno određivanje jezika i v2 adresu', () => {
    const { sdk, native } = setup(['sr', 'en']);
    const cfg = sdk.log.configs[0];
    expect(native.auto.languages).toEqual(['sr-RS', 'en-US']);
    expect(cfg.props[sdk.PropertyId.SpeechServiceConnection_LanguageIdMode]).toBe('Continuous');
    expect(cfg.props[sdk.PropertyId.SpeechServiceConnection_Endpoint]).toBe('wss://westeurope.stt.speech.microsoft.com/speech/universal/v2');
  });

  it('jezik svake izjave dolazi iz rezultata', () => {
    const { native, events } = setup(['sr', 'en']);
    native.emitFinal('Where are you?', 'en-US');
    native.emitFinal('U Dalasu sam', 'sr-RS');
    native.emitInterim('hvala', 'sr-Latn-RS');
    expect(events.final).toEqual([['Where are you?', 'en'], ['U Dalasu sam', 'sr']]);
    expect(events.interim).toEqual([['hvala', 'sr']]);
  });

  it('nepoznat jezik u rezultatu pada na prvi traženi', () => {
    const { native, events } = setup(['sr', 'en']);
    native.emitFinal('nešto', 'de-DE');
    native.emitFinal('nešto drugo', undefined);
    expect(events.final.map((f) => f[1])).toEqual(['sr', 'sr']);
  });
});

describe('createAzureSynthesizer', () => {
  it('pravi MP3 odgovarajućim glasom po jeziku', async () => {
    const sdk = createFakeAzureSdk();
    const synth = createAzureSynthesizer({ sdk, key: 'K', region: 'westeurope' });
    const en = await synth.synthesize('Hello', 'en');
    const sr = await synth.synthesize('Zdravo', 'sr');
    await synth.synthesize('Again', 'en');
    expect(new TextDecoder().decode(en)).toBe('mp3:Hello');
    expect(new TextDecoder().decode(sr)).toBe('mp3:Zdravo');
    expect(sdk.log.synths).toHaveLength(2); // po jedan sintetizator po jeziku
    expect(sdk.log.synths[0].config.speechSynthesisVoiceName).toBe(AZURE_VOICES.en);
    expect(sdk.log.synths[1].config.speechSynthesisVoiceName).toBe(AZURE_VOICES.sr);
    expect(sdk.log.synths[0].config.speechSynthesisOutputFormat).toBe(sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3);
    expect(sdk.log.synths[0].audio).toBe(null);
    synth.close();
    expect(sdk.log.synths.every((s) => s.closed)).toBe(true);
  });

  it('greške servisa odbijaju obećanje', async () => {
    const sdk = createFakeAzureSdk();
    const synth = createAzureSynthesizer({ sdk, key: 'K', region: 'r' });
    sdk.SpeechSynthesizer.fail = 'mreža';
    await expect(synth.synthesize('x', 'en')).rejects.toThrow('mreža');
    sdk.SpeechSynthesizer.fail = null;
    sdk.SpeechSynthesizer.cancel = '401 Unauthorized';
    await expect(synth.synthesize('x', 'en')).rejects.toThrow('401');
    await expect(synth.synthesize('x', 'de')).rejects.toThrow();
  });
});

describe('testAzure', () => {
  it('uspeh javlja vreme', async () => {
    const sdk = createFakeAzureSdk();
    let t = 0;
    const r = await testAzure({ sdk, key: 'K', region: 'r', now: () => (t += 120) });
    expect(r).toEqual({ ok: true, ms: 120 });
  });

  it('pogrešan ključ daje poruku o ključu, ostalo poruku o mreži', async () => {
    const sdk = createFakeAzureSdk();
    sdk.SpeechSynthesizer.cancel = 'Authentication error (401). Check your subscription key';
    const auth = await testAzure({ sdk, key: 'K', region: 'r' });
    expect(auth.ok).toBe(false);
    expect(auth.message).toBe(AZURE_ERROR_MESSAGES['azure-auth']);
    sdk.SpeechSynthesizer.cancel = null;
    sdk.SpeechSynthesizer.fail = 'WebSocket connection failed';
    const net = await testAzure({ sdk, key: 'K', region: 'r' });
    expect(net.message).toBe(AZURE_ERROR_MESSAGES.network);
  });
});
