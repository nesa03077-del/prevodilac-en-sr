// Provera brojeva između izgovorenog teksta i prevoda.
// Za dispečera je pogrešna cifra (broj tovara, ZIP, sat, težina) najskuplja greška,
// pa se brojevi porede mašinski, nezavisno od modela.

// Grupa cifara: razmaci, tačke, zarezi, crtice i dvotačke unutar broja se ignorišu,
// pa "1,200", "1.200" i "1200" ili "555-123-4567" i "555 123 4567" daju iste cifre.
const NUMBER_GROUP = /\d(?:[\d\s().:,/-]*\d)?/g;

/** Nizovi cifara iz teksta: { raw: kako je napisano, digits: samo cifre }. */
export function extractNumbers(text) {
  return (String(text ?? '').match(NUMBER_GROUP) ?? []).map((raw) => ({
    raw: raw.trim(),
    digits: raw.replace(/\D/g, ''),
  }));
}

/**
 * Poredi cifre izvornog teksta i prevoda (redosled reči se može razlikovati).
 * Proverava se samo kad izvor ima cifre: izgovorene brojeve rečima ("fifteen")
 * pregledač i model različito zapisuju, pa tu nema pouzdanog poređenja.
 *
 * @returns {{ checked: boolean, ok: boolean, missing: string[], extra: string[] }}
 *   missing = brojevi iz izvora kojih nema u prevodu; extra = brojevi u prevodu kojih nema u izvoru
 */
export function compareNumbers(source, translation) {
  const src = extractNumbers(source);
  if (src.length === 0) return { checked: false, ok: true, missing: [], extra: [] };

  const rest = extractNumbers(translation);
  const missing = [];
  for (const s of src) {
    const i = rest.findIndex((t) => t.digits === s.digits);
    if (i === -1) missing.push(s.raw);
    else rest.splice(i, 1);
  }
  const extra = rest.map((t) => t.raw);
  return { checked: true, ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Deli tekst na delove sa brojevima i bez njih, da ekran istakne brojeve. */
export function splitByNumbers(text) {
  const parts = [];
  let last = 0;
  const t = String(text ?? '');
  for (const m of t.matchAll(NUMBER_GROUP)) {
    if (m.index > last) parts.push({ text: t.slice(last, m.index), number: false });
    parts.push({ text: m[0], number: true });
    last = m.index + m[0].length;
  }
  if (last < t.length) parts.push({ text: t.slice(last), number: false });
  return parts;
}

/** Poruka za dispečera kad se brojevi ne poklapaju, npr. "nedostaje u prevodu: 48213; višak u prevodu: 48231". */
export function describeNumberMismatch(numbers) {
  const parts = [];
  if (numbers.missing.length) parts.push(`nedostaje u prevodu: ${numbers.missing.join(', ')}`);
  if (numbers.extra.length) parts.push(`višak u prevodu: ${numbers.extra.join(', ')}`);
  return `Brojevi se ne poklapaju (${parts.join('; ')}). Proverite pre nego što se oslonite na prevod.`;
}
