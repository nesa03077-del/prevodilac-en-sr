// Lažni Anthropic klijent za testove: strimuje unapred zadate delove teksta.
import Anthropic from '@anthropic-ai/sdk';

/**
 * @param {(params: object) => { chunks?: string[], stopReason?: string, model?: string, error?: Error, delayMs?: number }} respond
 */
export function createFakeClient(respond) {
  const calls = [];
  const client = {
    calls,
    beta: {
      messages: {
        stream(params, options = {}) {
          calls.push({ params, options });
          const { chunks = [], stopReason = 'end_turn', model = params.model, error, delayMs = 0 } =
            respond(params) ?? {};
          const signal = options.signal;
          const wait = () => new Promise((r) => setTimeout(r, delayMs));
          let finished;
          const done = new Promise((resolve, reject) => (finished = { resolve, reject }));
          done.catch(() => {});
          return {
            async *[Symbol.asyncIterator]() {
              try {
                if (error) throw error;
                for (const text of chunks) {
                  if (delayMs) await wait();
                  if (signal?.aborted) throw new Anthropic.APIUserAbortError();
                  yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } };
                }
                finished.resolve({ model, stop_reason: stopReason, content: [] });
              } catch (err) {
                finished.reject(err);
                throw err;
              }
            },
            finalMessage: () => done,
          };
        },
      },
    },
  };
  return client;
}
