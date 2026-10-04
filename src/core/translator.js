// Prevođenje preko Claude API-ja sa strimovanjem: prevod se prikazuje
// reč po reč dok stiže, a svaki zahtev može da se prekine (AbortSignal)
// čim korisnik nastavi da kuca ili govori.

import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, buildUserMessage } from './prompt.js';
import { DEFAULT_MODEL_ID, getModelInfo } from './models.js';
import { toLatin } from './transliterate.js';

export const DEFAULT_MODEL = DEFAULT_MODEL_ID;
// Prevod kratkog teksta ne traži duboko razmišljanje; "low" daje najkraće čekanje.
export const DEFAULT_EFFORT = 'low';
const MAX_TOKENS = 16000;
// Ako model odbije zahtev, server ga sam ponovi na preporučenom rezervnom modelu.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

/** Greška sa kodom koji UI prevodi u poruku za korisnika. */
export class TranslationError extends Error {
  /**
   * @param {'aborted'|'auth'|'permission'|'rate_limit'|'overloaded'|'network'|'bad_request'|'refusal'|'empty'|'unknown'} code
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(code, message, cause) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.cause = cause;
  }
}

export const ERROR_MESSAGES = {
  aborted: 'Prevod je prekinut.',
  auth: 'API ključ nije ispravan. Proverite ga u podešavanjima.',
  permission: 'Ovaj API ključ nema dozvolu za izabrani model.',
  rate_limit: 'Previše zahteva u kratkom roku. Sačekajte trenutak.',
  overloaded: 'Servis je trenutno preopterećen. Pokušajte ponovo.',
  network: 'Nema veze sa serverom. Proverite internet.',
  bad_request: 'Zahtev nije prihvaćen (proverite model i stanje kredita na nalogu).',
  refusal: 'Model je odbio da prevede ovaj tekst.',
  empty: 'Model nije vratio prevod.',
  unknown: 'Došlo je do neočekivane greške.',
};

/** Pretvara grešku SDK-a u TranslationError. Redosled: od najužeg ka najširem. */
export function toTranslationError(err) {
  if (err instanceof TranslationError) return err;
  const make = (code) => new TranslationError(code, ERROR_MESSAGES[code], err);
  if (err instanceof Anthropic.APIUserAbortError) return make('aborted');
  if (err?.name === 'AbortError') return make('aborted');
  if (err instanceof Anthropic.AuthenticationError) return make('auth');
  if (err instanceof Anthropic.PermissionDeniedError) return make('permission');
  if (err instanceof Anthropic.RateLimitError) return make('rate_limit');
  if (err instanceof Anthropic.BadRequestError) return make('bad_request');
  if (err instanceof Anthropic.NotFoundError) return make('bad_request');
  if (err instanceof Anthropic.InternalServerError) return make('overloaded');
  if (err instanceof Anthropic.APIConnectionError) return make('network');
  return make('unknown');
}

/** Klijent za pregledač: ključ unosi sam korisnik i čuva se samo na njegovom uređaju. */
export const REQUEST_TIMEOUT_MS = 20_000;

export function createClient(apiKey, options = {}) {
  // Kratak rok i jedan ponovni pokušaj: dispečeru je bolje brza poruka o grešci nego duga tišina.
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    ...options,
  });
}

/** Uklanja omaške modela: okolne razmake i slučajno ponovljene oznake. */
export function cleanOutput(text, to) {
  let out = text.replace(/^\s*<\/?source>\s*/i, '').replace(/\s*<\/?source>\s*$/i, '').trim();
  if (to === 'sr') out = toLatin(out);
  return out;
}

/**
 * @param {{ client: Anthropic, model?: string, effort?: string }} options
 */
export function createTranslator({ client, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT, domain = 'general' }) {
  /**
   * Prevodi tekst i javlja delimičan prevod kroz onText dok stiže.
   * @param {{
   *   text: string,
   *   from: 'en'|'sr',
   *   to: 'en'|'sr',
   *   context?: string[],
   *   signal?: AbortSignal,
   *   onText?: (partial: string) => void,
   * }} request
   * @returns {Promise<{ text: string, model: string, stopReason: string|null }>}
   */
  async function translate({ text, from, to, context = [], signal, onText }) {
    if (!text || !text.trim()) return { text: '', model, stopReason: null };
    if (signal?.aborted) throw new TranslationError('aborted', ERROR_MESSAGES.aborted);

    let raw = '';
    const startedAt = nowMs();
    let firstTokenMs = null;
    try {
      const info = getModelInfo(model);
      const params = {
        model,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt({ from, to, domain }),
        messages: [{ role: 'user', content: buildUserMessage(text, context) }],
      };
      if (info.effort) params.output_config = { effort };
      if (info.fallback) {
        params.betas = [FALLBACK_BETA];
        params.fallbacks = 'default';
      }
      const stream = client.beta.messages.stream(params, { signal });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          firstTokenMs ??= nowMs() - startedAt;
          raw += event.delta.text;
          onText?.(cleanOutput(raw, to));
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        throw new TranslationError('refusal', ERROR_MESSAGES.refusal);
      }
      const result = cleanOutput(raw, to);
      if (!result) throw new TranslationError('empty', ERROR_MESSAGES.empty);
      return {
        text: result,
        model: final.model,
        stopReason: final.stop_reason,
        firstTokenMs: Math.round(firstTokenMs ?? 0),
        totalMs: Math.round(nowMs() - startedAt),
      };
    } catch (err) {
      if (signal?.aborted) throw new TranslationError('aborted', ERROR_MESSAGES.aborted, err);
      throw toTranslationError(err);
    }
  }

  return { translate, model, effort, domain };
}
