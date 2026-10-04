// Spisak za pregled od maternjeg govornika srpskog koji vozi u SAD.
// Pravi se iz koda (phrases.js, prompt.js), pa se ne može razići sa onim što aplikacija govori.

import { PHRASES, PHRASE_GROUPS } from './phrases.js';
import { TRUCKING_TERMS } from './prompt.js';

const cell = (t) => String(t).replace(/\|/g, '\\|');

export function buildReviewSheet() {
  const lines = [
    '# Pregled za maternjeg govornika',
    '',
    'Ovo je spisak onoga što aplikacija izgovara vozačima. Napravljen je automatski iz koda',
    '(`npm run review-sheet`), pa uvek odgovara trenutnoj verziji.',
    '',
    '**Zadatak:** pročitajte svaku frazu naglas, kao da je govorite vozaču. Ako zvuči prirodno i tačno,',
    'upišite "da" u kolonu *U redu?*. Ako vozači to govore drugačije, upišite kako, u kolonu *Ispravka*.',
    'Posebno pazite na: oblik obraćanja (ti), engleske izraze koje vozači zaista koriste, i da li je smisao tačan.',
    '',
  ];
  for (const g of PHRASE_GROUPS) {
    lines.push(`## ${g.label}`, '', '| Engleski (dispečer) | Srpski (sada) | U redu? | Ispravka |', '| --- | --- | --- | --- |');
    for (const p of PHRASES.filter((x) => x.group === g.id)) {
      lines.push(`| ${cell(p.en)} | ${cell(p.sr)} |  |  |`);
    }
    lines.push('');
  }
  lines.push(
    '## Izrazi koji ostaju na engleskom',
    '',
    'Aplikacija ove izraze ne prevodi, nego ih ostavlja na engleskom i u srpskoj rečenici. Označite one koje',
    'vozači u SAD zaista tako govore, i dopišite izraze koji nedostaju.',
    '',
    '| Izraz | Tako se govori? | Dopuna |',
    '| --- | --- | --- |',
    ...TRUCKING_TERMS.map((t) => `| ${cell(t)} |  |  |`),
    '',
    '## Izrazi koji nedostaju',
    '',
    '(upišite)',
    '',
  );
  return lines.join('\n');
}
