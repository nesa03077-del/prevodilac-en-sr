// Prepoznavanje govora i glas preko Azure Speech servisa (strimovanje u realnom vremenu).
// SDK se prosleđuje spolja (loadAzureSdk() ga učitava tek kad zatreba), pa se sve
// testira lažnim SDK-om. Zvuk dobijamo kao 16 kHz mono PCM iz audio-capture.js.

export const AZURE_LANGS = { en: 'en-US', sr: 'sr-RS' };
// Neuralni glasovi; engleski za sagovornika, srpski za mene.
export const AZURE_VOICES = { en: 'en-US-GuyNeural', sr: 'sr-RS-NicholasNeural' };

export const AZURE_ERROR_MESSAGES = {
  'azure-auth': 'Azure ključ ili region nisu ispravni. Proverite ih u podešavanjima.',
  quota: 'Azure je ograničio broj zahteva (možda je potrošena besplatna kvota). Sačekajte ili proverite pretplatu.',
  network: 'Nema veze sa Azure servisom za govor. Proverite internet.',
  unavailable: 'Azure servis za govor trenutno ne radi. Pokušajte ponovo za nekoliko minuta.',
  unknown: 'Prepoznavanje govora nije uspelo. Pokušajte ponovo.',
};

/** Učitava Azure SDK tek kad treba (velik je). `__PREVODILAC_FAKE_AZURE__` služi samo za provere. */
export async function loadAzureSdk() {
  return globalThis.__PREVODILAC_FAKE_AZURE__ ?? (await import('microsoft-cognitiveservices-speech-sdk'));
}

/** 'en-US' -> 'en', 'sr-RS' / 'sr-Latn-RS' -> 'sr', ostalo -> null. */
export function fromAzureLang(code) {
  const base = String(code ?? '').toLowerCase().split('-')[0];
  return base === 'en' || base === 'sr' ? base : null;
}

/** Greška Azure servisa -> naš kod. */
export function mapAzureError(sdk, errorCode) {
  const E = sdk.CancellationErrorCode ?? {};
  switch (errorCode) {
    case E.AuthenticationFailure:
    case E.Forbidden:
      return 'azure-auth';
    case E.TooManyRequests:
      return 'quota';
    case E.ConnectionFailure:
    case E.ServiceTimeout:
      return 'network';
    case E.ServiceUnavailable:
    case E.ServiceError:
      return 'unavailable';
    default:
      return 'unknown';
  }
}

/**
 * Strimovano prepoznavanje. Jedan jezik: tačno taj jezik. Dva jezika: Azure sam određuje
 * jezik svake izjave (automatski), pa jedan mikrofon može da čuje oba govornika.
 *
 * @param {{
 *   sdk: any, key: string, region: string,
 *   languages: Array<'en'|'sr'>,
 *   onInterim?: (text: string, lang: 'en'|'sr') => void,
 *   onFinal?: (text: string, lang: 'en'|'sr') => void,
 *   onState?: (state: 'listening'|'stopped') => void,
 *   onError?: (code: string) => void,
 * }} options
 */
export function createAzureRecognizer({
  sdk, key, region, languages,
  onInterim = () => {}, onFinal = () => {}, onState = () => {}, onError = () => {},
}) {
  if (!languages?.length || languages.some((l) => !AZURE_LANGS[l])) throw new Error('Nepoznat jezik za prepoznavanje.');

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.setProfanity?.(sdk.ProfanityOption?.Raw); // tekst se prevodi onakav kakav je izgovoren
  const push = sdk.AudioInputStream.createPushStream();
  const audioConfig = sdk.AudioConfig.fromStreamInput(push);

  let recognizer;
  if (languages.length === 1) {
    speechConfig.speechRecognitionLanguage = AZURE_LANGS[languages[0]];
    recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  } else {
    speechConfig.setProperty(sdk.PropertyId.SpeechServiceConnection_LanguageIdMode, 'Continuous');
    speechConfig.setProperty(
      sdk.PropertyId.SpeechServiceConnection_Endpoint,
      `wss://${region}.stt.speech.microsoft.com/speech/universal/v2`,
    );
    const detect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(languages.map((l) => AZURE_LANGS[l]));
    recognizer = sdk.SpeechRecognizer.FromConfig(speechConfig, detect, audioConfig);
  }

  let closed = false;

  const detected = (result) => {
    if (languages.length === 1) return languages[0];
    const code = sdk.AutoDetectSourceLanguageResult.fromResult(result)?.language;
    return fromAzureLang(code) ?? languages[0];
  };

  recognizer.recognizing = (_s, e) => {
    const text = (e.result?.text ?? '').trim();
    if (!closed && text) onInterim(text, detected(e.result));
  };
  recognizer.recognized = (_s, e) => {
    if (closed || e.result?.reason !== sdk.ResultReason.RecognizedSpeech) return;
    const text = (e.result.text ?? '').trim();
    if (text) onFinal(text, detected(e.result));
  };
  recognizer.canceled = (_s, e) => {
    if (closed || e.reason !== sdk.CancellationReason.Error) return;
    onError(mapAzureError(sdk, e.errorCode));
  };
  recognizer.sessionStopped = () => {
    if (!closed) onState('stopped');
  };

  return {
    /** Povezuje se sa servisom; razrešava se kad je slušanje počelo. */
    start() {
      return new Promise((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(
          () => {
            onState('listening');
            resolve();
          },
          (err) => reject(new Error(String(err))),
        );
      });
    },

    /** Šalje PCM (Int16, 16 kHz, mono). */
    write(pcm) {
      if (closed) return;
      push.write(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    },

    stop() {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise((resolve) => {
        const finish = () => {
          try {
            push.close();
            recognizer.close();
          } catch {
            /* već zatvoreno */
          }
          resolve();
        };
        try {
          recognizer.stopContinuousRecognitionAsync(finish, finish);
        } catch {
          finish();
        }
      });
    },
  };
}

/**
 * Glas (neuralni) za izgovor prevoda. Vraća MP3 kao ArrayBuffer, a puštanje i izbor
 * izlaznog uređaja radi audio-player.js.
 */
export function createAzureSynthesizer({ sdk, key, region, voices = AZURE_VOICES }) {
  const synths = {};

  function synthFor(lang) {
    if (!synths[lang]) {
      const config = sdk.SpeechConfig.fromSubscription(key, region);
      config.speechSynthesisVoiceName = voices[lang];
      config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      synths[lang] = new sdk.SpeechSynthesizer(config, null);
    }
    return synths[lang];
  }

  return {
    /** @returns {Promise<ArrayBuffer>} */
    synthesize(text, lang) {
      if (!voices[lang]) return Promise.reject(new Error('Nepoznat jezik za glas.'));
      return new Promise((resolve, reject) => {
        synthFor(lang).speakTextAsync(
          text,
          (result) => {
            if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) resolve(result.audioData);
            else reject(new Error(result.errorDetails || 'Glas nije napravljen.'));
          },
          (err) => reject(new Error(String(err))),
        );
      });
    },

    close() {
      for (const s of Object.values(synths)) {
        try {
          s.close();
        } catch {
          /* već zatvoreno */
        }
      }
    },
  };
}

/** Proba ključa i regiona: pravi kratak glas. Vraća { ok, ms } ili { ok: false, message }. */
export async function testAzure({ sdk, key, region, now = () => performance.now() }) {
  const synth = createAzureSynthesizer({ sdk, key, region });
  const t0 = now();
  try {
    await synth.synthesize('OK', 'en');
    return { ok: true, ms: Math.round(now() - t0) };
  } catch (err) {
    const text = String(err?.message ?? err);
    const auth = /401|403|authentication|forbidden|subscription|key/i.test(text);
    return { ok: false, message: auth ? AZURE_ERROR_MESSAGES['azure-auth'] : AZURE_ERROR_MESSAGES.network, detail: text };
  } finally {
    synth.close();
  }
}
