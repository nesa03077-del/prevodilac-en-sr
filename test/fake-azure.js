// Lažni Azure Speech SDK za testove (samo ono što koristi src/core/azure-speech.js).

export function createFakeAzureSdk() {
  const log = { recognizers: [], synths: [], configs: [], pushes: [] };

  const ResultReason = { NoMatch: 0, RecognizedSpeech: 3, SynthesizingAudioCompleted: 9, Canceled: 1 };
  const CancellationReason = { Error: 1, EndOfStream: 2 };
  const CancellationErrorCode = {
    NoError: 0, AuthenticationFailure: 1, BadRequest: 2, TooManyRequests: 3, Forbidden: 4,
    ConnectionFailure: 5, ServiceTimeout: 6, ServiceError: 7, ServiceUnavailable: 8, RuntimeError: 9,
  };
  const PropertyId = { SpeechServiceConnection_LanguageIdMode: 37, SpeechServiceConnection_Endpoint: 1 };
  const SpeechSynthesisOutputFormat = { Audio24Khz48KBitRateMonoMp3: 6 };

  class SpeechConfig {
    constructor(key, region) {
      this.key = key;
      this.region = region;
      this.props = {};
      this.profanity = undefined;
      log.configs.push(this);
    }
    static fromSubscription(key, region) {
      return new SpeechConfig(key, region);
    }
    setProperty(id, value) {
      this.props[id] = value;
    }
    setProfanity(p) {
      this.profanity = p;
    }
  }

  const AudioInputStream = {
    createPushStream() {
      const push = { chunks: [], closed: false, write(b) { this.chunks.push(b); }, close() { this.closed = true; } };
      log.pushes.push(push);
      return push;
    },
  };
  const AudioConfig = { fromStreamInput: (push) => ({ push }) };
  const AutoDetectSourceLanguageConfig = { fromLanguages: (languages) => ({ languages }) };
  const AutoDetectSourceLanguageResult = { fromResult: (result) => ({ language: result.detectedLanguage }) };

  class SpeechRecognizer {
    constructor(config, audio) {
      this.config = config;
      this.audio = audio;
      this.auto = null;
      this.started = false;
      this.stopped = false;
      this.closed = false;
      this.failStart = null;
      log.recognizers.push(this);
    }
    static FromConfig(config, auto, audio) {
      const r = new SpeechRecognizer(config, audio);
      r.auto = auto;
      return r;
    }
    startContinuousRecognitionAsync(ok, err) {
      if (this.failStart) err?.(this.failStart);
      else {
        this.started = true;
        ok?.();
      }
    }
    stopContinuousRecognitionAsync(ok) {
      this.stopped = true;
      ok?.();
    }
    close() {
      this.closed = true;
    }
    // pomoćne funkcije za test
    emitInterim(text, detectedLanguage) {
      this.recognizing?.(this, { result: { text, detectedLanguage, reason: 2 } });
    }
    emitFinal(text, detectedLanguage) {
      this.recognized?.(this, { result: { text, detectedLanguage, reason: ResultReason.RecognizedSpeech } });
    }
    emitNoMatch() {
      this.recognized?.(this, { result: { text: '', reason: ResultReason.NoMatch } });
    }
    emitError(errorCode, errorDetails = 'greška') {
      this.canceled?.(this, { reason: CancellationReason.Error, errorCode, errorDetails });
    }
    emitEnd() {
      this.canceled?.(this, { reason: CancellationReason.EndOfStream });
    }
  }

  class SpeechSynthesizer {
    constructor(config, audio) {
      this.config = config;
      this.audio = audio;
      this.closed = false;
      this.texts = [];
      log.synths.push(this);
    }
    speakTextAsync(text, ok, err) {
      this.texts.push(text);
      if (SpeechSynthesizer.fail) err?.(SpeechSynthesizer.fail);
      else if (SpeechSynthesizer.cancel) ok?.({ reason: ResultReason.Canceled, errorDetails: SpeechSynthesizer.cancel });
      else ok?.({ reason: ResultReason.SynthesizingAudioCompleted, audioData: new TextEncoder().encode(`mp3:${text}`).buffer });
    }
    close() {
      this.closed = true;
    }
  }
  SpeechSynthesizer.fail = null;
  SpeechSynthesizer.cancel = null;

  return {
    log,
    SpeechConfig, AudioInputStream, AudioConfig, AutoDetectSourceLanguageConfig, AutoDetectSourceLanguageResult,
    SpeechRecognizer, SpeechSynthesizer, ResultReason, CancellationReason, CancellationErrorCode, PropertyId,
    SpeechSynthesisOutputFormat, ProfanityOption: { Raw: 2 },
  };
}
