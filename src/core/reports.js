// Prijave grešaka u prevodu. Dispečer jednim klikom prijavi loš prevod i upiše kako
// treba da glasi; prijave se čuvaju samo na ovom uređaju i izvoze se kao JSON, pa
// svaka postaje novi slučaj u scripts/smoke-cases.js.

export const REPORTS_KEY = 'prevodilac.prijave.v1';
export const MAX_REPORTS = 200;

export const REPORT_KINDS = [
  { id: 'number', label: 'Pogrešan broj, adresa ili vreme' },
  { id: 'term', label: 'Pogrešan stručni izraz' },
  { id: 'meaning', label: 'Pogrešan smisao' },
  { id: 'unclear', label: 'Nerazumljivo ili neprirodno' },
  { id: 'other', label: 'Drugo' },
];

const isKind = (k) => REPORT_KINDS.some((x) => x.id === k);
const clip = (v, n) => String(v ?? '').slice(0, n);

/** Čisti jednu prijavu; vraća null ako nema osnovnih podataka. */
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const source = clip(raw.source, 2000).trim();
  const translation = clip(raw.translation, 4000).trim();
  if (!source || !translation) return null;
  return {
    id: clip(raw.id, 40) || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: clip(raw.at, 40) || new Date().toISOString(),
    from: raw.from === 'sr' ? 'sr' : 'en',
    to: raw.to === 'en' ? 'en' : 'sr',
    domain: clip(raw.domain, 40) || 'general',
    model: clip(raw.model, 80),
    fixed: Boolean(raw.fixed),
    kind: isKind(raw.kind) ? raw.kind : 'other',
    source,
    translation,
    correction: clip(raw.correction, 4000).trim(),
    note: clip(raw.note, 1000).trim(),
  };
}

/** @param {{getItem:Function,setItem:Function,removeItem:Function}|null|undefined} storage */
export function createReportStore(storage, { max = MAX_REPORTS } = {}) {
  const read = () => {
    try {
      const data = JSON.parse(storage?.getItem(REPORTS_KEY) ?? '[]');
      return Array.isArray(data) ? data.map(normalizeReport).filter(Boolean) : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    try {
      storage.setItem(REPORTS_KEY, JSON.stringify(list.slice(-max)));
      return true;
    } catch {
      return false;
    }
  };

  return {
    /** Dodaje prijavu; vraća sačuvanu prijavu ili null (nema podataka ili upis nije uspeo). */
    add(raw) {
      const report = normalizeReport(raw);
      if (!report) return null;
      return write([...read(), report]) ? report : null;
    },
    list: read,
    get count() {
      return read().length;
    },
    /** JSON tekst za izvoz. */
    exportJson() {
      return JSON.stringify({ app: 'prevodilac-en-sr', exportedAt: new Date().toISOString(), reports: read() }, null, 2);
    },
    clear() {
      try {
        storage.removeItem(REPORTS_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

const quote = (s) => JSON.stringify(s);

/**
 * Pretvara prijave u kostur slučajeva za scripts/smoke-cases.js.
 * `expect` ostaje prazan: čovek bira reči koje ispravan prevod mora da sadrži.
 * @param {object[]} reports
 */
export function reportsToSmokeCaseSource(reports) {
  const cases = reports.map(normalizeReport).filter(Boolean);
  if (!cases.length) return '// nema prijava\n';
  return cases
    .map((r) => {
      const lines = [
        `  // prijava ${r.at.slice(0, 10)}, ${REPORT_KINDS.find((k) => k.id === r.kind)?.label ?? 'Drugo'}`,
        `  // prevod koji je dat: ${quote(r.translation)}`,
      ];
      if (r.correction) lines.push(`  // ispravno prema dispečeru: ${quote(r.correction)}`);
      if (r.note) lines.push(`  // napomena: ${quote(r.note)}`);
      lines.push(
        '  {',
        `    domain: ${quote(r.domain)},`,
        `    text: ${quote(r.source)},`,
        `    from: ${quote(r.from)},`,
        `    to: ${quote(r.to)},`,
        '    expect: [], // TODO: reči koje ispravan prevod mora da sadrži',
        '  },',
      );
      return lines.join('\n');
    })
    .join('\n');
}
