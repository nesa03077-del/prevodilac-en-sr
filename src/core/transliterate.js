// Preslovljavanje srpske ćirilice u latinicu.
// Prevod na srpski uvek prikazujemo latinicom, pa ovim osiguravamo izlaz
// čak i kad model omaškom vrati ćirilicu.

const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z',
  и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c',
  ч: 'č', џ: 'dž', ш: 'š',
};

const CYRILLIC = /[Ѐ-ӿ]/;

function isUpperLetter(ch) {
  return ch !== undefined && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function isLetter(ch) {
  return ch !== undefined && ch.toLowerCase() !== ch.toUpperCase();
}

/** Da li tekst sadrži bar jedno ćirilično slovo. */
export function hasCyrillic(text) {
  return CYRILLIC.test(text);
}

/**
 * Pretvara srpsku ćirilicu u latinicu; sve ostalo ostaje netaknuto.
 * Velika dvoslovna slova (Љ, Њ, Џ) daju "LJ"/"NJ"/"DŽ" u rečima pisanim
 * velikim slovima ("ЉУБАВ" -> "LJUBAV"), a inače "Lj"/"Nj"/"Dž" ("Љубав" -> "Ljubav").
 */
export function toLatin(text) {
  if (!text || !hasCyrillic(text)) return text;
  const chars = Array.from(text);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const latin = MAP[lower];
    if (latin === undefined) {
      out += ch;
      continue;
    }
    if (ch === lower) {
      out += latin;
      continue;
    }
    if (latin.length === 1) {
      out += latin.toUpperCase();
      continue;
    }
    // Veliko dvoslovno slovo: sva velika ako je susedno slovo u reči veliko.
    const next = chars[i + 1];
    const prev = chars[i - 1];
    const allCaps = isLetter(next) ? isUpperLetter(next) : isUpperLetter(prev);
    out += allCaps ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
  }
  return out;
}
