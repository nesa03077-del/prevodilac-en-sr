// Natpisi i pravila za smer prevoda koja ekran koristi (bez DOM-a, da se testiraju).

export const LANG_LABELS = { en: 'Engleski', sr: 'Srpski' };
export const MODE_LABELS = { auto: 'Automatski', 'en-sr': 'Engleski → Srpski', 'sr-en': 'Srpski → Engleski' };

/**
 * Natpisi iznad polja za tekst i za prevod.
 * Dok u automatskom režimu nema teksta, jezik još nije poznat.
 * @param {'auto'|'en-sr'|'sr-en'} mode
 * @param {{from:'en'|'sr', to:'en'|'sr'}} direction
 * @param {boolean} hasText
 */
export function describeDirection(mode, direction, hasText) {
  if (mode === 'auto' && !hasText) {
    return { source: 'Engleski ili srpski', target: 'Prevod', auto: true };
  }
  return {
    source: LANG_LABELS[direction.from],
    target: LANG_LABELS[direction.to],
    auto: mode === 'auto',
  };
}

/** Ručni režim koji odgovara suprotnom smeru od trenutnog. */
export function oppositeMode(direction) {
  return direction.from === 'en' ? 'sr-en' : 'en-sr';
}
