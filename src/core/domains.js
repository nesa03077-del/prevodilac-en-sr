// Oblasti rada. Svaka oblast dodaje rečnik i pravila u uputstvo za model
// (vidi prompt.js), pa prevod u poslu zvuči kao ljudi iz tog posla.

export const DOMAINS = [
  {
    id: 'trucking',
    label: 'Kamionski transport i logistika (SAD)',
    hint: 'Dispečer govori engleski, vozač srpski. Stručni izrazi, brojevi i adrese ostaju tačni.',
  },
  {
    id: 'general',
    label: 'Opšti razgovor',
    hint: 'Bez posebnog rečnika.',
  },
];

export const DEFAULT_DOMAIN_ID = DOMAINS[0].id;

export const isDomain = (id) => DOMAINS.some((d) => d.id === id);
