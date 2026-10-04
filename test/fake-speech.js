// Lažni objekti pregledača za govor (SpeechRecognition i speechSynthesis).

/** Pravi niz rezultata kao SpeechRecognitionResultList. */
export function results(...parts) {
  return parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
}

export function createFakeRecognitionCtor() {
  const instances = [];
  class FakeRecognition {
    constructor() {
      this.started = false;
      this.aborted = false;
      this.stopped = false;
      instances.push(this);
    }
    start() {
      if (this.started) throw new Error('InvalidStateError');
      this.started = true;
      this.onstart?.();
    }
    stop() {
      this.stopped = true;
    }
    abort() {
      this.aborted = true;
    }
    // pomoćne funkcije za test
    emitResult(list, resultIndex = 0) {
      this.onresult?.({ resultIndex, results: list });
    }
    emitError(error) {
      this.onerror?.({ error });
    }
    end() {
      this.onend?.();
    }
  }
  FakeRecognition.instances = instances;
  FakeRecognition.last = () => instances.at(-1);
  return FakeRecognition;
}

export function createFakeSynth({ voices = [], autoEnd = true } = {}) {
  const spoken = [];
  const listeners = new Set();
  let currentVoices = voices;
  const synth = {
    spoken,
    getVoices: () => currentVoices,
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    setVoices(v) {
      currentVoices = v;
      for (const fn of [...listeners]) fn();
    },
    speak(u) {
      spoken.push(u);
      if (autoEnd) queueMicrotask(() => u.onend?.());
    },
    cancel() {
      synth.cancelled = (synth.cancelled ?? 0) + 1;
    },
    resume() {},
  };
  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  return { synth, Utterance: FakeUtterance };
}
