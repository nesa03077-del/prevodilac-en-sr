// Hvata zvuk iz MediaStream-a (mikrofon, zvuk poziva) i daje ga kao 16 kHz mono PCM delove.
// ScriptProcessorNode je zastareo, ali radi svuda (i u Android WebView-u) bez posebnih
// dozvola u sigurnosnoj politici, a nama treba samo jednostavno prosleđivanje zvuka.

import { floatToInt16, mixToMono, resample, rms } from './pcm.js';

export const TARGET_RATE = 16000;

/**
 * @param {{
 *   stream: MediaStream,
 *   onChunk: (pcm: Int16Array) => void,
 *   onLevel?: (level: number) => void,
 *   AudioContextCtor?: any,
 *   bufferSize?: number,
 * }} options
 */
export function createCapture({
  stream,
  onChunk,
  onLevel = () => {},
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  bufferSize = 4096,
}) {
  let ctx = null;
  let source = null;
  let processor = null;
  let muted = false;

  function handle(event) {
    const buf = event.inputBuffer;
    const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const mono = mixToMono(channels);
    onLevel(muted ? 0 : rms(mono));
    const pcm = floatToInt16(resample(mono, ctx.sampleRate, TARGET_RATE));
    // Dok je utišano šaljemo tišinu iste dužine, da servis ne prekine sesiju.
    onChunk(muted ? new Int16Array(pcm.length) : pcm);
  }

  return {
    async start() {
      if (ctx) return;
      try {
        ctx = new AudioContextCtor({ sampleRate: TARGET_RATE });
      } catch {
        ctx = new AudioContextCtor();
      }
      if (ctx.state === 'suspended') await ctx.resume();
      source = ctx.createMediaStreamSource(stream);
      processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processor.onaudioprocess = handle;
      source.connect(processor);
      processor.connect(ctx.destination); // izlaz je tišina; bez ovoga se obrada ne pokreće
    },

    /** Utišava hvatanje (šalje tišinu), npr. dok se izgovara prevod. */
    setMuted(value) {
      muted = Boolean(value);
    },

    get muted() {
      return muted;
    },

    stop() {
      try {
        if (processor) processor.onaudioprocess = null;
        source?.disconnect();
        processor?.disconnect();
        ctx?.close?.();
      } catch {
        /* već zatvoreno */
      }
      ctx = source = processor = null;
    },
  };
}
