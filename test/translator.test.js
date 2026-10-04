import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  TranslationError,
  cleanOutput,
  createTranslator,
  toTranslationError,
} from '../src/core/translator.js';
import { createFakeClient } from './fake-client.js';

describe('createTranslator', () => {
  it('šalje ispravan zahtev', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdravo'] }));
    await createTranslator({ client }).translate({ text: 'Hello', from: 'en', to: 'sr' });
    const { params } = client.calls[0];
    expect(params.model).toBe(DEFAULT_MODEL);
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params.thinking).toBeUndefined();
    expect(params.system).toContain('from English into Serbian');
    expect(params.messages).toEqual([{ role: 'user', content: '<source>\nHello\n</source>' }]);
  });

  it('javlja delimičan prevod dok stiže i vraća ceo prevod', async () => {
    const client = createFakeClient(() => ({ chunks: ['Kako ', 'si', '?'] }));
    const partials = [];
    const result = await createTranslator({ client }).translate({
      text: 'How are you?',
      from: 'en',
      to: 'sr',
      onText: (t) => partials.push(t),
    });
    expect(partials).toEqual(['Kako', 'Kako si', 'Kako si?']);
    expect(result.text).toBe('Kako si?');
    expect(result.stopReason).toBe('end_turn');
  });

  it('pretvara ćirilicu u latinicu kad je cilj srpski', async () => {
    const client = createFakeClient(() => ({ chunks: ['Добар ', 'дан'] }));
    const result = await createTranslator({ client }).translate({ text: 'Good day', from: 'en', to: 'sr' });
    expect(result.text).toBe('Dobar dan');
  });

  it('ne dira tekst kad je cilj engleski', async () => {
    const client = createFakeClient(() => ({ chunks: ['Good day'] }));
    const result = await createTranslator({ client }).translate({ text: 'Добар дан', from: 'sr', to: 'en' });
    expect(result.text).toBe('Good day');
  });

  it('prazan tekst ne šalje zahtev', async () => {
    const client = createFakeClient(() => ({ chunks: ['x'] }));
    const result = await createTranslator({ client }).translate({ text: '  ', from: 'en', to: 'sr' });
    expect(result.text).toBe('');
    expect(client.calls).toHaveLength(0);
  });

  it('prijavljuje odbijanje', async () => {
    const client = createFakeClient(() => ({ chunks: [], stopReason: 'refusal' }));
    await expect(
      createTranslator({ client }).translate({ text: 'x y', from: 'en', to: 'sr' }),
    ).rejects.toMatchObject({ code: 'refusal' });
  });

  it('prijavljuje prazan odgovor', async () => {
    const client = createFakeClient(() => ({ chunks: ['  '] }));
    await expect(
      createTranslator({ client }).translate({ text: 'Hi', from: 'en', to: 'sr' }),
    ).rejects.toMatchObject({ code: 'empty' });
  });

  it('prekid preko AbortSignal daje kod "aborted"', async () => {
    const client = createFakeClient(() => ({ chunks: ['a', 'b', 'c'], delayMs: 5 }));
    const controller = new AbortController();
    const promise = createTranslator({ client }).translate({
      text: 'Hello',
      from: 'en',
      to: 'sr',
      signal: controller.signal,
      onText: () => controller.abort(),
    });
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
  });

  it('greške SDK-a pretvara u razumljive kodove', async () => {
    const authError = new Anthropic.AuthenticationError(401, { type: 'error' }, 'bad key', new Headers());
    const client = createFakeClient(() => ({ error: authError }));
    const err = await createTranslator({ client })
      .translate({ text: 'Hello', from: 'en', to: 'sr' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TranslationError);
    expect(err.code).toBe('auth');
    expect(err.message).toContain('API ključ');
  });
});

describe('toTranslationError', () => {
  const h = new Headers();
  it.each([
    [new Anthropic.APIUserAbortError(), 'aborted'],
    [new Anthropic.AuthenticationError(401, {}, 'x', h), 'auth'],
    [new Anthropic.PermissionDeniedError(403, {}, 'x', h), 'permission'],
    [new Anthropic.RateLimitError(429, {}, 'x', h), 'rate_limit'],
    [new Anthropic.BadRequestError(400, {}, 'x', h), 'bad_request'],
    [new Anthropic.NotFoundError(404, {}, 'x', h), 'bad_request'],
    [new Anthropic.InternalServerError(529, {}, 'x', h), 'overloaded'],
    [new Anthropic.APIConnectionError({ message: 'x' }), 'network'],
    [new Error('x'), 'unknown'],
  ])('%s -> %s', (err, code) => {
    expect(toTranslationError(err).code).toBe(code);
  });
});

describe('cleanOutput', () => {
  it('uklanja ponovljene oznake i razmake', () => {
    expect(cleanOutput('<source>\nZdravo\n</source>', 'sr')).toBe('Zdravo');
    expect(cleanOutput('  Hi  ', 'en')).toBe('Hi');
  });
});


describe('zahtev prema modelu', () => {
  it('Haiku ne dobija effort ni rezervni model', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdravo'] }));
    await createTranslator({ client, model: 'claude-haiku-4-5' }).translate({
      text: 'Hello', from: 'en', to: 'sr',
    });
    const { params } = client.calls[0];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.output_config).toBeUndefined();
    expect(params.fallbacks).toBeUndefined();
    expect(params.betas).toBeUndefined();
    expect(params.thinking).toBeUndefined();
  });

  it('Sonnet 5.5 dobija effort i rezervni model', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdravo'] }));
    await createTranslator({ client, model: 'claude-sonnet-5-5' }).translate({
      text: 'Hello', from: 'en', to: 'sr',
    });
    const { params } = client.calls[0];
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.fallbacks).toBe('default');
  });
});

describe('oblast i rokovi', () => {
  it('oblast ide u sistemski prompt', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdravo'] }));
    await createTranslator({ client, domain: 'trucking' }).translate({ text: 'Load 123', from: 'en', to: 'sr' });
    expect(client.calls[0].params.system).toContain('US trucking and freight dispatch');
  });

  it('bez oblasti prompt je opšti', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdravo'] }));
    await createTranslator({ client }).translate({ text: 'Hello', from: 'en', to: 'sr' });
    expect(client.calls[0].params.system).not.toContain('trucking');
  });

  it('klijent ima kratak rok i jedan ponovni pokušaj', async () => {
    const { createClient, REQUEST_TIMEOUT_MS } = await import('../src/core/translator.js');
    const c = createClient('sk-ant-test');
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    expect(c.timeout).toBe(REQUEST_TIMEOUT_MS);
    expect(c.maxRetries).toBe(1);
    expect(createClient('k', { maxRetries: 0 }).maxRetries).toBe(0);
  });
});

describe('merenje brzine', () => {
  it('vraća vreme do prvog dela i ukupno vreme', async () => {
    const client = createFakeClient(() => ({ chunks: ['Zdr', 'avo'], delayMs: 15 }));
    const r = await createTranslator({ client }).translate({ text: 'Hello', from: 'en', to: 'sr' });
    expect(r.firstTokenMs).toBeGreaterThanOrEqual(10);
    expect(r.totalMs).toBeGreaterThanOrEqual(r.firstTokenMs);
    expect(Number.isInteger(r.firstTokenMs)).toBe(true);
    expect(Number.isInteger(r.totalMs)).toBe(true);
  });
});
