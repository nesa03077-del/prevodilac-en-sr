// Brzo prepoznavanje jezika (engleski ili srpski) bez poziva servera.
// Služi da u automatskom režimu odmah znamo smer prevoda; kad nema
// dovoljno signala vraća null, a pozivalac zadržava prethodni smer.

const SERBIAN_LETTERS = /[čćžšđČĆŽŠĐ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
// Slova kojih nema u srpskoj latinici.
const ENGLISH_ONLY_LETTERS = /[wqxy]/gi;

// Reči koje postoje samo u jednom od dva jezika. Namerno su izostavljene
// dvosmislene reči ("to", "a", "on", "me", "no", "i", "do", "pa", "most").
const SERBIAN_WORDS = new Set([
  'je', 'sam', 'si', 'smo', 'ste', 'su', 'jesam', 'nisam', 'nije', 'nisu',
  'da', 'ne', 'li', 'se', 'u', 'na', 'za', 'sa', 'od', 'iz', 'kod',
  'ali', 'ili', 'kad', 'kada', 'gde', 'kako', 'sta', 'šta', 'što', 'zašto',
  'zasto', 'koji', 'koja', 'koje', 'ovo', 'ovaj', 'ova', 'taj', 'ta', 'ono',
  'mi', 'ti', 'vi', 'oni', 'ona', 'njega', 'nju', 'meni', 'tebi', 'mene',
  'tebe', 'moj', 'moja', 'moje', 'tvoj', 'tvoja', 'tvoje', 'naš', 'vaš',
  'zdravo', 'hvala', 'molim', 'izvini', 'izvinite', 'dobro', 'dobar', 'dan',
  'veče', 'vece', 'jutro', 'laku', 'noć', 'noc', 'može', 'moze', 'mogu',
  'hoću', 'hocu', 'hoćeš', 'imam', 'imaš', 'ima', 'treba', 'idem', 'ide',
  'sada', 'sad', 'danas', 'sutra', 'juče', 'juce', 'još', 'jos', 'već',
  'vec', 'samo', 'mnogo', 'malo', 'jako', 'vrlo', 'koliko', 'košta',
  'kosta', 'ovde', 'tamo', 'nešto', 'nesto', 'ništa', 'nista',
  'jer', 'pošto', 'kao', 'bio', 'bila', 'bilo', 'biti', 'će', 'ce', 'ću',
  'cu', 'ćemo', 'bih', 'bi', 'nemam', 'neću', 'necu', 'volim', 'znam',
]);

const ENGLISH_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'and', 'or', 'but',
  'you', 'your', 'yours', 'he', 'she', 'it', 'its', 'we', 'they', 'them',
  'my', 'mine', 'his', 'her', 'our', 'their', 'this', 'that', 'these',
  'those', 'what', 'where', 'when', 'why', 'how', 'who', 'which', 'of',
  'in', 'at', 'for', 'with', 'from', 'about', 'have', 'has', 'had', 'does',
  'did', 'can', 'could', 'will', 'would', 'should', 'please', 'thank',
  'thanks', 'hello', 'hi', 'yes', 'not', 'dont', "don't", "i'm", 'im',
  "it's", "you're", 'good', 'morning', 'evening', 'night', 'today',
  'tomorrow', 'yesterday', 'now', 'here', 'there', 'much', 'many', 'very',
  'want', 'need', 'like', 'know', 'think', 'go', 'going', 'come', 'see',
  'get', 'make', 'time', 'some', 'any', 'all', 'just', 'only', 'also',
  'than', 'then', 'if', 'so', 'because', 'sorry', 'excuse', 'help', 'name',
]);

const WORD = /[\p{L}']+/gu;

/**
 * Vraća 'sr', 'en' ili null (nedovoljno signala).
 * @param {string} text
 * @returns {'sr'|'en'|null}
 */
export function detectLanguage(text) {
  if (!text || !text.trim()) return null;
  if (CYRILLIC.test(text)) return 'sr';
  if (SERBIAN_LETTERS.test(text)) return 'sr';

  let sr = 0;
  let en = 0;
  const words = text.match(WORD) ?? [];
  for (const raw of words) {
    // Samostalno veliko "I" je engleska zamenica; malo "i" je srpski veznik.
    if (raw === 'I') {
      en++;
      continue;
    }
    if (raw === 'i') {
      sr++;
      continue;
    }
    const w = raw.toLowerCase();
    if (SERBIAN_WORDS.has(w)) sr++;
    if (ENGLISH_WORDS.has(w)) en++;
  }
  // Slova w, q, x, y su slab ali koristan signal za engleski.
  const foreignLetters = (text.match(ENGLISH_ONLY_LETTERS) ?? []).length;
  en += Math.min(foreignLetters, 3) * 0.5;

  if (sr === 0 && en === 0) return null;
  if (sr > en) return 'sr';
  if (en > sr) return 'en';
  return null;
}

/**
 * Određuje smer prevoda.
 * @param {'auto'|'en-sr'|'sr-en'} mode
 * @param {string} text
 * @param {{from:'en'|'sr', to:'en'|'sr'}} [previous] smer koji se koristi kad se jezik ne može prepoznati
 * @returns {{from:'en'|'sr', to:'en'|'sr'}}
 */
export function resolveDirection(mode, text, previous = { from: 'en', to: 'sr' }) {
  if (mode === 'en-sr') return { from: 'en', to: 'sr' };
  if (mode === 'sr-en') return { from: 'sr', to: 'en' };
  const lang = detectLanguage(text);
  if (lang === 'sr') return { from: 'sr', to: 'en' };
  if (lang === 'en') return { from: 'en', to: 'sr' };
  return previous;
}
