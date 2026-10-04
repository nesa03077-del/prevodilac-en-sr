// Obrada zvuka: pretvaranje u 16 kHz, 16-bitni mono PCM, koji traži servis za prepoznavanje govora.

/** Meša kanale u jedan (prosek); jedan kanal se vraća bez kopiranja. */
export function mixToMono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** Smanjuje (ili povećava) učestanost uzorkovanja; smanjenje uzima prosek uzoraka. */
export function resample(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  if (ratio > 1) {
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j];
      out[i] = end > start ? sum / (end - start) : 0;
    }
  } else {
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const j = Math.floor(pos);
      const frac = pos - j;
      out[i] = input[j] * (1 - frac) + (input[Math.min(input.length - 1, j + 1)] ?? 0) * frac;
    }
  }
  return out;
}

/** Float32 (-1..1) -> Int16 sa ograničenjem, bez preglašavanja. */
export function floatToInt16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Jačina zvuka (0..1) za prikaz. */
export function rms(input) {
  if (!input.length) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.sqrt(sum / input.length);
}
