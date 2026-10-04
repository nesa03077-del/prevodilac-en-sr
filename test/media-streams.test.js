import { describe, expect, it, vi } from 'vitest';
import { canCaptureSystemAudio, listOutputDevices, mapMicError, openLiveStreams } from '../src/core/media-streams.js';

function track(kind) {
  const t = { kind, stopped: false, listeners: [], stop() { this.stopped = true; }, addEventListener(type, cb) { this.listeners.push([type, cb]); } };
  return t;
}
function stream(...tracks) {
  return { getTracks: () => tracks, getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'), getVideoTracks: () => tracks.filter((t) => t.kind === 'video') };
}
class FakeStream {
  constructor(tracks) {
    this.tracks = tracks;
  }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
}

function nav({ mic, display, hasDisplay = true } = {}) {
  return {
    mediaDevices: {
      getUserMedia: vi.fn(async () => { if (mic instanceof Error) throw mic; return mic; }),
      ...(hasDisplay ? { getDisplayMedia: vi.fn(async () => { if (display instanceof Error) throw display; return display; }) } : {}),
    },
  };
}
const err = (name) => Object.assign(new Error(name), { name });

describe('mapMicError i canCaptureSystemAudio', () => {
  it('prepoznaje greške mikrofona', () => {
    expect(mapMicError(err('NotFoundError'))).toBe('no-mic');
    expect(mapMicError(err('OverconstrainedError'))).toBe('no-mic');
    expect(mapMicError(err('NotAllowedError'))).toBe('mic-denied');
    expect(mapMicError(undefined)).toBe('mic-denied');
  });
  it('podrška za zvuk poziva', () => {
    expect(canCaptureSystemAudio(nav())).toBe(true);
    expect(canCaptureSystemAudio(nav({ hasDisplay: false }))).toBe(false);
    expect(canCaptureSystemAudio({})).toBe(false);
  });
});

describe('openLiveStreams', () => {
  it('jedan mikrofon: samo mikrofon, bez deljenja ekrana', async () => {
    const mic = stream(track('audio'));
    const n = nav({ mic });
    const s = await openLiveStreams('single-mic', { nav: n, StreamCtor: FakeStream });
    expect(s.mic).toBe(mic);
    expect(s.other).toBe(null);
    expect(n.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    expect(n.mediaDevices.getUserMedia.mock.calls[0][0].audio).toMatchObject({ echoCancellation: true });
  });

  it('izabrani mikrofon se traži tačno', async () => {
    const n = nav({ mic: stream(track('audio')) });
    await openLiveStreams('single-mic', { nav: n, StreamCtor: FakeStream, micDeviceId: 'mik-2' });
    expect(n.mediaDevices.getUserMedia.mock.calls[0][0].audio.deviceId).toEqual({ exact: 'mik-2' });
  });

  it('dve trake: zvuk poziva bez slike, bez obrade zvuka', async () => {
    const audio = track('audio');
    const video = track('video');
    const n = nav({ mic: stream(track('audio')), display: stream(video, audio) });
    const s = await openLiveStreams('two-streams', { nav: n, StreamCtor: FakeStream });
    expect(n.mediaDevices.getDisplayMedia.mock.calls[0][0].audio).toMatchObject({ echoCancellation: false, noiseSuppression: false });
    expect(video.stopped).toBe(true);
    expect(audio.stopped).toBe(false);
    expect(s.other.getAudioTracks()).toEqual([audio]);
  });

  it('close gasi sve trake', async () => {
    const micTrack = track('audio');
    const audio = track('audio');
    const s = await openLiveStreams('two-streams', { nav: nav({ mic: stream(micTrack), display: stream(track('video'), audio) }), StreamCtor: FakeStream });
    s.close();
    expect(micTrack.stopped).toBe(true);
    expect(audio.stopped).toBe(true);
  });

  it('onEnded se javlja kad se bilo koja traka prekine', async () => {
    const micTrack = track('audio');
    const audio = track('audio');
    const s = await openLiveStreams('two-streams', { nav: nav({ mic: stream(micTrack), display: stream(track('video'), audio) }), StreamCtor: FakeStream });
    const cb = vi.fn();
    s.onEnded(cb);
    expect(micTrack.listeners[0][0]).toBe('ended');
    expect(audio.listeners[0][0]).toBe('ended');
    audio.listeners[0][1]();
    expect(cb).toHaveBeenCalled();
  });

  it('mikrofon odbijen ili nepostojeći', async () => {
    await expect(openLiveStreams('single-mic', { nav: nav({ mic: err('NotAllowedError') }) })).rejects.toMatchObject({ code: 'mic-denied' });
    await expect(openLiveStreams('single-mic', { nav: nav({ mic: err('NotFoundError') }) })).rejects.toMatchObject({ code: 'no-mic' });
    await expect(openLiveStreams('single-mic', { nav: {} })).rejects.toMatchObject({ code: 'no-mic' });
  });

  it('korisnik otkaže deljenje: mikrofon se oslobađa', async () => {
    const micTrack = track('audio');
    const n = nav({ mic: stream(micTrack), display: err('NotAllowedError') });
    await expect(openLiveStreams('two-streams', { nav: n, StreamCtor: FakeStream })).rejects.toMatchObject({ code: 'share-cancelled' });
    expect(micTrack.stopped).toBe(true);
  });

  it('izabran izvor bez zvuka: greška, a mikrofon i slika se oslobađaju', async () => {
    const micTrack = track('audio');
    const video = track('video');
    const n = nav({ mic: stream(micTrack), display: stream(video) });
    await expect(openLiveStreams('two-streams', { nav: n, StreamCtor: FakeStream })).rejects.toMatchObject({ code: 'no-system-audio' });
    expect(micTrack.stopped).toBe(true);
    expect(video.stopped).toBe(true);
  });

  it('uređaj bez deljenja ekrana (Android): greška "unsupported"', async () => {
    const micTrack = track('audio');
    const n = nav({ mic: stream(micTrack), hasDisplay: false });
    await expect(openLiveStreams('two-streams', { nav: n, StreamCtor: FakeStream })).rejects.toMatchObject({ code: 'unsupported' });
    expect(micTrack.stopped).toBe(true);
  });
});

describe('listOutputDevices', () => {
  it('daje samo izlazne uređaje, sa nazivima', async () => {
    const n = { mediaDevices: { enumerateDevices: async () => [
      { kind: 'audioinput', deviceId: 'a', label: 'Mikrofon' },
      { kind: 'audiooutput', deviceId: 'default', label: 'Podrazumevani' },
      { kind: 'audiooutput', deviceId: 'zv', label: 'Zvučnici' },
      { kind: 'audiooutput', deviceId: 'kabl', label: '' },
    ] } };
    expect(await listOutputDevices(n)).toEqual([{ id: 'zv', label: 'Zvučnici' }, { id: 'kabl', label: 'Izlaz 2' }]);
  });
  it('bez podrške ili uz grešku: prazna lista', async () => {
    expect(await listOutputDevices({})).toEqual([]);
    expect(await listOutputDevices({ mediaDevices: { enumerateDevices: async () => { throw new Error('x'); } } })).toEqual([]);
  });
});
