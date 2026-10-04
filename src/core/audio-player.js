// Puštanje izgovorenog prevoda (MP3 iz Azure glasa) redom, sa izborom izlaznog uređaja.
// Izbor uređaja omogućava da engleski glas ide u virtuelni kabl (poziv), a ne u zvučnike.

/**
 * @param {{
 *   AudioCtor?: new (url?: string) => any,
 *   createObjectURL?: (blob: Blob) => string,
 *   revokeObjectURL?: (url: string) => void,
 *   BlobCtor?: typeof Blob,
 * }} [options]
 */
export function createAudioPlayer({
  AudioCtor = globalThis.Audio,
  createObjectURL = (b) => URL.createObjectURL(b),
  revokeObjectURL = (u) => URL.revokeObjectURL(u),
  BlobCtor = globalThis.Blob,
} = {}) {
  let chain = Promise.resolve();
  let epoch = 0;
  let current = null;

  function playNow(buffer, sinkId, myEpoch) {
    if (myEpoch !== epoch) return Promise.resolve({ played: false, reason: 'cancelled' });
    const url = createObjectURL(new BlobCtor([buffer], { type: 'audio/mpeg' }));
    const audio = new AudioCtor(url);
    current = audio;
    return new Promise((resolve) => {
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        if (current === audio) current = null;
        revokeObjectURL(url);
        resolve(result);
      };
      audio.onended = () => finish({ played: true });
      audio.onerror = () => finish({ played: false, reason: 'error' });
      const start = async () => {
        try {
          if (sinkId && typeof audio.setSinkId === 'function') await audio.setSinkId(sinkId);
        } catch {
          // Uređaj nije dostupan: pušta se na podrazumevanom, da se prevod ipak čuje.
        }
        await audio.play();
      };
      start().catch(() => finish({ played: false, reason: 'error' }));
    });
  }

  return {
    /** Pušta zvuk posle ranijih; razrešava se kad se završi. */
    play(buffer, { sinkId = '' } = {}) {
      const myEpoch = epoch;
      const run = () => playNow(buffer, sinkId, myEpoch);
      const result = chain.then(run, run);
      chain = result.then(() => {}, () => {});
      return result;
    },

    /** Prekida zvuk koji svira i briše red čekanja. */
    stop() {
      epoch++;
      if (current) {
        try {
          current.pause();
          current.onended?.();
        } catch {
          /* već zaustavljen */
        }
      }
    },

    get playing() {
      return current !== null;
    },
  };
}
