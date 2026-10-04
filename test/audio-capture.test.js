import { describe, expect, it, vi } from 'vitest';
import { TARGET_RATE, createCapture } from '../src/core/audio-capture.js';

function fakeAudio({ sampleRate = 16000, failRate = false, state = 'running' } = {}) {
  const made = { ctx: null, processor: null, source: null };
  class FakeCtx {
    constructor(opts) {
      if (failRate && opts) throw new Error('sampleRate nije podržan');
      this.sampleRate = opts?.sampleRate ?? sampleRate;
      this.state = state;
      this.destination = { name: 'dest' };
      this.closed = false;
      made.ctx = this;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createMediaStreamSource(stream) {
      made.source = { stream, connect: vi.fn(), disconnect: vi.fn() };
      return made.source;
    }
    createScriptProcessor(size) {
      made.processor = { size, connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
      return made.processor;
    }
    close() { this.closed = true; }
  }
  return { FakeCtx, made };
}

const frame = (channels) => ({
  inputBuffer: { numberOfChannels: channels.length, getChannelData: (i) => Float32Array.from(channels[i]) },
});

describe('createCapture', () => {
  it('povezuje mikrofon na obradu i javlja PCM delove', async () => {
    const { FakeCtx, made } = fakeAudio();
    const chunks = [];
    const levels = [];
    const cap = createCapture({ stream: { id: 's' }, AudioContextCtor: FakeCtx, onChunk: (c) => chunks.push(c), onLevel: (l) => levels.push(l) });
    await cap.start();
    expect(made.source.stream).toEqual({ id: 's' });
    expect(made.source.connect).toHaveBeenCalledWith(made.processor);
    expect(made.processor.connect).toHaveBeenCalledWith(made.ctx.destination);
    made.processor.onaudioprocess(frame([[0, 1, -1, 0.5]]));
    expect(Array.from(chunks[0])).toEqual([0, 32767, -32768, 16384]);
    expect(levels[0]).toBeGreaterThan(0.5);
  });

  it('traži 16 kHz, a ako pregledač ne dozvoli, sam smanjuje učestanost', async () => {
    const ok = fakeAudio();
    await createCapture({ stream: {}, AudioContextCtor: ok.FakeCtx, onChunk() {} }).start();
    expect(ok.made.ctx.sampleRate).toBe(TARGET_RATE);

    const fallback = fakeAudio({ sampleRate: 48000, failRate: true });
    const chunks = [];
    const cap = createCapture({ stream: {}, AudioContextCtor: fallback.FakeCtx, onChunk: (c) => chunks.push(c) });
    await cap.start();
    expect(fallback.made.ctx.sampleRate).toBe(48000);
    fallback.made.processor.onaudioprocess(frame([new Array(480).fill(0.5)]));
    expect(chunks[0].length).toBe(160);
  });

  it('stereo zvuk se meša u mono', async () => {
    const { FakeCtx, made } = fakeAudio();
    const chunks = [];
    await createCapture({ stream: {}, AudioContextCtor: FakeCtx, onChunk: (c) => chunks.push(c) }).start();
    made.processor.onaudioprocess(frame([[1, 0], [0, 1]]));
    expect(Array.from(chunks[0])).toEqual([16384, 16384]);
  });

  it('utišano hvatanje šalje tišinu iste dužine i nulti nivo', async () => {
    const { FakeCtx, made } = fakeAudio();
    const chunks = [];
    const levels = [];
    const cap = createCapture({ stream: {}, AudioContextCtor: FakeCtx, onChunk: (c) => chunks.push(c), onLevel: (l) => levels.push(l) });
    await cap.start();
    cap.setMuted(true);
    expect(cap.muted).toBe(true);
    made.processor.onaudioprocess(frame([[1, 1, 1, 1]]));
    expect(Array.from(chunks[0])).toEqual([0, 0, 0, 0]);
    expect(levels[0]).toBe(0);
    cap.setMuted(false);
    made.processor.onaudioprocess(frame([[1, 1, 1, 1]]));
    expect(chunks[1][0]).toBe(32767);
  });

  it('pokreće zaustavljen kontekst i može dvaput da se pokrene bez posledica', async () => {
    const { FakeCtx, made } = fakeAudio({ state: 'suspended' });
    const cap = createCapture({ stream: {}, AudioContextCtor: FakeCtx, onChunk() {} });
    await cap.start();
    expect(made.ctx.state).toBe('running');
    const ctx = made.ctx;
    await cap.start();
    expect(made.ctx).toBe(ctx);
  });

  it('stop gasi obradu i zatvara kontekst; kasniji zvuk se ne prosleđuje', async () => {
    const { FakeCtx, made } = fakeAudio();
    const cap = createCapture({ stream: {}, AudioContextCtor: FakeCtx, onChunk() {} });
    await cap.start();
    const { processor, ctx, source } = made;
    cap.stop();
    expect(processor.onaudioprocess).toBe(null);
    expect(processor.disconnect).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    expect(ctx.closed).toBe(true);
    expect(() => cap.stop()).not.toThrow();
  });
});
