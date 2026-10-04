import { describe, expect, it } from 'vitest';
import { floatToInt16, mixToMono, resample, rms } from '../src/core/pcm.js';

describe('floatToInt16', () => {
  it('pretvara raspon -1..1 u 16 bita', () => {
    expect(Array.from(floatToInt16(Float32Array.from([0, 1, -1, 0.5, -0.5])))).toEqual([0, 32767, -32768, 16384, -16384]);
  });
  it('ograničava preglasne uzorke', () => {
    expect(Array.from(floatToInt16(Float32Array.from([2, -3, 1.0001])))).toEqual([32767, -32768, 32767]);
  });
  it('prazan niz', () => {
    expect(floatToInt16(new Float32Array(0)).length).toBe(0);
  });
});

describe('mixToMono', () => {
  it('jedan kanal se vraća kakav jeste', () => {
    const ch = Float32Array.from([0.1, 0.2]);
    expect(mixToMono([ch])).toBe(ch);
  });
  it('više kanala daje prosek', () => {
    const mono = mixToMono([Float32Array.from([1, 0, -1]), Float32Array.from([0, 1, -1])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5, -1]);
  });
});

describe('resample', () => {
  it('ista učestanost: bez promene', () => {
    const a = Float32Array.from([1, 2, 3]);
    expect(resample(a, 16000, 16000)).toBe(a);
  });
  it('48 kHz -> 16 kHz uzima prosek po tri uzorka', () => {
    const out = resample(Float32Array.from([0, 0.3, 0.6, 1, 1, 1]), 48000, 16000);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(1);
  });
  it('dužina je srazmerna odnosu učestanosti', () => {
    expect(resample(new Float32Array(4800), 48000, 16000).length).toBe(1600);
    expect(resample(new Float32Array(4410), 44100, 16000).length).toBe(1600);
  });
  it('povećanje učestanosti interpoliše', () => {
    const out = resample(Float32Array.from([0, 1]), 8000, 16000);
    expect(out.length).toBe(4);
    expect(out[1]).toBeCloseTo(0.5);
  });
});

describe('rms', () => {
  it('tišina je 0, pun talas je 1', () => {
    expect(rms(new Float32Array(10))).toBe(0);
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBeCloseTo(1);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
