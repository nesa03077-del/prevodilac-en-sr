// Modeli koje korisnik može da izabere. Svaki model ima svoja ograničenja
// API-ja, pa zahtev za svaki gradimo prema ovoj tabeli (vidi translator.js).

export const MODELS = [
  {
    id: 'claude-opus-5-5',
    label: 'Opus 5.5',
    hint: 'Najbolji kvalitet prevoda (preporučeno)',
    effort: true, // prima output_config.effort
    fallback: true, // prima server-side fallbacks: 'default'
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Sonnet 5.5',
    hint: 'Brži i jeftiniji, vrlo dobar kvalitet',
    effort: true,
    fallback: true,
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    hint: 'Najbrži i najjeftiniji, slabiji za idiome',
    effort: false, // effort na Haiku 4.5 vraća grešku
    fallback: false,
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

/** Vraća opis modela; nepoznat ID tretira kao model sa svim mogućnostima. */
export function getModelInfo(id) {
  return MODELS.find((m) => m.id === id) ?? { id, label: id, hint: '', effort: true, fallback: true };
}
