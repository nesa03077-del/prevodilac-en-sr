// Prevod "uživo" dok korisnik kuca ili govori.
// Svaka nova izmena teksta posle kratke pauze (debounce) pokreće novi
// prevod i prekida prethodni, a zakasneli odgovori starih zahteva se
// odbacuju, pa na ekranu uvek ostaje prevod poslednjeg teksta.

import { resolveDirection } from './detect.js';

export const DEFAULT_DEBOUNCE_MS = 350;

/**
 * @param {{
 *   translator: { translate: Function },
 *   getMode?: () => 'auto'|'en-sr'|'sr-en',
 *   getContext?: () => string[],
 *   debounceMs?: number,
 *   onUpdate: (state: { source: string, translation: string, from: string, to: string, done: boolean }) => void,
 *   onError?: (err: import('./translator.js').TranslationError) => void,
 *   onBusy?: (busy: boolean) => void,
 * }} options
 */
export function createLiveSession({
  translator,
  getMode = () => 'auto',
  getContext = () => [],
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onUpdate,
  onError = () => {},
  onBusy = () => {},
}) {
  let timer = null;
  let controller = null;
  let seq = 0;
  let pendingText = '';
  let direction = { from: 'en', to: 'sr' };
  let lastDone = null; // { text, from, to } poslednjeg završenog prevoda
  let lastResult = null; // { source, translation, from, to } poslednjeg završenog prevoda

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function abortRunning() {
    if (controller) {
      controller.abort();
      controller = null;
      onBusy(false);
    }
  }

  async function run(text) {
    cancelTimer();
    const source = text.trim();
    abortRunning();
    const id = ++seq;

    if (!source) {
      lastDone = null;
      lastResult = null;
      onUpdate({ source: '', translation: '', ...direction, done: true });
      return;
    }

    direction = resolveDirection(getMode(), source, direction);
    const { from, to } = direction;
    if (lastDone && lastDone.text === source && lastDone.from === from && lastDone.to === to) {
      return; // isti tekst je već preveden
    }

    controller = new AbortController();
    const { signal } = controller;
    onBusy(true);
    try {
      const result = await translator.translate({
        text: source,
        from,
        to,
        context: getContext(),
        signal,
        onText: (partial) => {
          if (id === seq) onUpdate({ source, translation: partial, from, to, done: false });
        },
      });
      if (id !== seq) return;
      lastDone = { text: source, from, to };
      lastResult = { source, translation: result.text, from, to };
      onUpdate({ source, translation: result.text, from, to, done: true });
    } catch (err) {
      if (id !== seq || err?.code === 'aborted') return;
      onError(err);
    } finally {
      if (id === seq) {
        controller = null;
        onBusy(false);
      }
    }
  }

  return {
    /** Tekst se promenio; prevod kreće posle kratke pauze. */
    update(text) {
      pendingText = text;
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        run(pendingText);
      }, debounceMs);
    },
    /** Prevedi odmah (Enter, kraj izgovorene rečenice). */
    flush(text = pendingText) {
      pendingText = text;
      return run(text);
    },
    /** Zaboravi poslednji prevod, npr. posle promene smera ili modela. */
    reset() {
      lastDone = null;
      lastResult = null;
    },
    /** Poslednji završen prevod (za ponovnu upotrebu kad se tekst ne menja). */
    get lastResult() {
      return lastResult;
    },
    get direction() {
      return { ...direction };
    },
    dispose() {
      cancelTimer();
      seq++;
      abortRunning();
    },
  };
}
