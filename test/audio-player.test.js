import { describe, expect, it, vi } from 'vitest';
import { createAudioPlayer } from '../src/core/audio-player.js';

function setup({ sink = true, failPlay = false, sinkFails = false } = {}) {
  const made = [];
  const urls = [];
  class FakeAudio {
    constructor(url) {
      this.url = url;
      this.paused = false;
      this.sinkId = null;
      if (sink) this.setSinkId = vi.fn(async (id) => { if (sinkFails) throw new Error('NotFound'); this.sinkId = id; });
      made.push(this);
    }
    play() {
      if (failPlay) return Promise.reject(new Error('blokirano'));
      this.started = true;
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const player = createAudioPlayer({
    AudioCtor: FakeAudio,
    createObjectURL: (blob) => { const u = `blob:${urls.length}:${blob.type}`; urls.push(u); return u; },
    revokeObjectURL: (u) => urls.splice(urls.indexOf(u), 1, `${u}:oslobođen`),
    BlobCtor: class { constructor(parts, opts) { this.parts = parts; this.type = opts.type; } },
  });
  return { player, made, urls };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe('createAudioPlayer', () => {
  it('pušta zvuk i razrešava se kad se završi, uz oslobađanje adrese', async () => {
    const { player, made, urls } = setup();
    const p = player.play(new ArrayBuffer(4));
    await tick();
    expect(made[0].started).toBe(true);
    expect(player.playing).toBe(true);
    made[0].onended();
    expect(await p).toEqual({ played: true });
    expect(player.playing).toBe(false);
    expect(urls[0]).toContain('audio/mpeg');
    expect(urls[0]).toContain('oslobođen');
  });

  it('bira izlazni uređaj', async () => {
    const { player, made } = setup();
    const p = player.play(new ArrayBuffer(1), { sinkId: 'kabl-1' });
    await tick();
    expect(made[0].setSinkId).toHaveBeenCalledWith('kabl-1');
    made[0].onended();
    await p;
  });

  it('bez izbora uređaja ne poziva setSinkId; bez podrške ipak pušta', async () => {
    const a = setup();
    const pa = a.player.play(new ArrayBuffer(1));
    await tick();
    expect(a.made[0].setSinkId).not.toHaveBeenCalled();
    a.made[0].onended();
    await pa;

    const b = setup({ sink: false });
    const pb = b.player.play(new ArrayBuffer(1), { sinkId: 'x' });
    await tick();
    expect(b.made[0].started).toBe(true);
    b.made[0].onended();
    await pb;
  });

  it('uređaj koji ne postoji: pušta na podrazumevanom', async () => {
    const { player, made } = setup({ sinkFails: true });
    const p = player.play(new ArrayBuffer(1), { sinkId: 'nema' });
    await tick();
    expect(made[0].started).toBe(true);
    made[0].onended();
    expect(await p).toEqual({ played: true });
  });

  it('zvukovi idu jedan za drugim', async () => {
    const { player, made } = setup();
    const a = player.play(new ArrayBuffer(1));
    const b = player.play(new ArrayBuffer(1));
    await tick();
    expect(made).toHaveLength(1);
    made[0].onended();
    await a;
    await tick();
    expect(made).toHaveLength(2);
    made[1].onended();
    expect((await b).played).toBe(true);
  });

  it('greška puštanja se prijavljuje bez izuzetka', async () => {
    const { player } = setup({ failPlay: true });
    expect(await player.play(new ArrayBuffer(1))).toEqual({ played: false, reason: 'error' });
  });

  it('stop prekida zvuk koji svira i briše red čekanja', async () => {
    const { player, made } = setup();
    const a = player.play(new ArrayBuffer(1));
    const b = player.play(new ArrayBuffer(1));
    await tick();
    player.stop();
    expect(made[0].paused).toBe(true);
    await a;
    expect(await b).toEqual({ played: false, reason: 'cancelled' });
    expect(made).toHaveLength(1);
    const c = player.play(new ArrayBuffer(1)); // posle stop radi opet
    await tick();
    expect(made).toHaveLength(2);
    made[1].onended();
    expect((await c).played).toBe(true);
  });
});
