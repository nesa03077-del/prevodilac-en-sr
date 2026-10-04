// Pravi Anthropic SDK protiv lokalnog lažnog servera: proverava tačan HTTP
// zahtev (putanja, zaglavlja, telo), čitanje strima i prekid zahteva.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, createTranslator } from '../src/core/translator.js';

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

function messageEvents(chunks, stopReason = 'end_turn') {
  return [
    {
      type: 'message_start',
      message: {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
        content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...chunks.map((text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
}

let server;
let baseURL;
const requests = [];
let behavior = () => ({ status: 200, body: sse(messageEvents(['Zdravo', ' svete'])) });

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      const b = behavior();
      if (b.hang) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(sse(messageEvents(['Prvi']).slice(0, 3)));
        return; // ne završava odgovor; klijent mora da prekine
      }
      res.writeHead(b.status, { 'content-type': b.status === 200 ? 'text/event-stream' : 'application/json' });
      res.end(b.body);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.closeAllConnections?.();
  return new Promise((r) => server.close(r));
});

const translatorFor = () =>
  createTranslator({ client: createClient('sk-test-123', { baseURL, maxRetries: 0 }) });

describe('SDK integracija', () => {
  it('šalje ispravan HTTP zahtev i čita strim', async () => {
    requests.length = 0;
    behavior = () => ({ status: 200, body: sse(messageEvents(['Zdravo', ' svete'])) });
    const partials = [];
    const result = await translatorFor().translate({
      text: 'Hello world', from: 'en', to: 'sr', onText: (t) => partials.push(t),
    });
    expect(result.text).toBe('Zdravo svete');
    expect(partials).toEqual(['Zdravo', 'Zdravo svete']);

    const [req] = requests;
    expect(req.method).toBe('POST');
    expect(req.url).toMatch(/^\/v1\/messages/);
    expect(req.headers['x-api-key']).toBe('sk-test-123');
    expect(req.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      max_tokens: 16000,
      fallbacks: 'default',
      output_config: { effort: 'low' },
    });
    expect(req.body.betas).toBeUndefined();
    expect(req.body.thinking).toBeUndefined();
  });

  it('401 daje poruku o neispravnom ključu', async () => {
    behavior = () => ({
      status: 401,
      body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    });
    await expect(translatorFor().translate({ text: 'Hi', from: 'en', to: 'sr' }))
      .rejects.toMatchObject({ code: 'auth' });
  });

  it('429 daje poruku o previše zahteva', async () => {
    behavior = () => ({
      status: 429,
      body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }),
    });
    await expect(translatorFor().translate({ text: 'Hi', from: 'en', to: 'sr' }))
      .rejects.toMatchObject({ code: 'rate_limit' });
  });

  it('prekid usred strima odmah završava zahtev', async () => {
    behavior = () => ({ hang: true });
    const controller = new AbortController();
    const promise = translatorFor().translate({
      text: 'Hi', from: 'en', to: 'sr', signal: controller.signal,
      onText: () => controller.abort(),
    });
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });
});
