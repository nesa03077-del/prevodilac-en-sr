// Glas za prevođenje uživo: Azure neuralni glas puštan na izabranom izlaznom uređaju.
// Ako Azure glas ne uspe, koristi se glas pregledača (ako postoji), da se prevod ipak čuje.

/**
 * @param {{
 *   synthesize: (text: string, lang: 'en'|'sr') => Promise<ArrayBuffer>,
 *   player: { play: Function, stop: Function },
 *   getOutputDevice?: () => string,
 *   fallback?: { speak: Function, cancel: Function } | null,
 * }} options
 */
export function createLiveVoice({ synthesize, player, getOutputDevice = () => '', fallback = null }) {
  return {
    /**
     * Engleski glas za sagovornika ide na izabrani izlaz (npr. u poziv), a glas za mene na
     * podrazumevani izlaz (moje slušalice).
     * @returns {Promise<{ spoken: boolean, reason?: string }>}
     */
    async speak(text, lang, who) {
      try {
        const audio = await synthesize(text, lang);
        const result = await player.play(audio, { sinkId: who === 'me' ? getOutputDevice() : '' });
        return result.played ? { spoken: true } : { spoken: false, reason: result.reason ?? 'error' };
      } catch {
        if (!fallback) return { spoken: false, reason: 'error' };
        return fallback.speak(text, lang);
      }
    },

    cancel() {
      player.stop();
      fallback?.cancel();
    },
  };
}
