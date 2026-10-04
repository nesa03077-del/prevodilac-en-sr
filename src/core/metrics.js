// Merenje brzine prevoda u pravoj upotrebi. Brojke se čuvaju samo na ovom uređaju
// i pokazuju se u podešavanjima, da se vidi koliko je prevod zaista brz.

export const METRICS_KEY = 'prevodilac.brzina.v1';
export const MAX_METRICS = 200;

/** Percentil po metodi "najbliži rang" (p u 0..100); null za prazan niz. */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** @param {{getItem:Function,setItem:Function,removeItem:Function}|null|undefined} storage */
export function createMetricsStore(storage, { max = MAX_METRICS } = {}) {
  const read = () => {
    try {
      const data = JSON.parse(storage?.getItem(METRICS_KEY) ?? '[]');
      return Array.isArray(data) ? data.filter((m) => m && isNum(m.totalMs)) : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    try {
      storage.setItem(METRICS_KEY, JSON.stringify(list.slice(-max)));
      return true;
    } catch {
      return false;
    }
  };

  return {
    /** Beleži jedan prevod: { firstTokenMs, totalMs, model, reused }. */
    add(entry) {
      if (!entry || !isNum(entry.totalMs)) return false;
      const item = {
        at: new Date().toISOString(),
        firstTokenMs: isNum(entry.firstTokenMs) ? Math.round(entry.firstTokenMs) : null,
        totalMs: Math.round(entry.totalMs),
        model: String(entry.model ?? ''),
        reused: Boolean(entry.reused),
      };
      return write([...read(), item]);
    },

    list: read,

    /** Zbir: broj prevoda, medijana i 90. percentil, udeo ponovo iskorišćenih prevoda. */
    summary() {
      const all = read();
      const fresh = all.filter((m) => !m.reused);
      const first = fresh.map((m) => m.firstTokenMs).filter(isNum);
      const total = fresh.map((m) => m.totalMs);
      return {
        count: all.length,
        fresh: fresh.length,
        reusedShare: all.length ? all.filter((m) => m.reused).length / all.length : 0,
        first: { median: percentile(first, 50), p90: percentile(first, 90) },
        total: { median: percentile(total, 50), p90: percentile(total, 90) },
      };
    },

    clear() {
      try {
        storage.removeItem(METRICS_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Tekst za podešavanja: "37 prevoda. Prvi deo: medijana 820 ms (90%: 1400 ms)..." */
export function describeMetrics(summary) {
  if (!summary.count) return 'Još nema izmerenih prevoda. Brojke se pojavljuju posle prvog razgovora.';
  const ms = (n) => (n === null ? '-' : `${n} ms`);
  const reused = summary.reusedShare > 0 ? ` ${Math.round(summary.reusedShare * 100)}% rečenica je preuzeto iz prevoda uživo (bez čekanja).` : '';
  if (!summary.fresh) return `${summary.count} prevoda, svi preuzeti iz prevoda uživo.`;
  return (
    `${summary.count} prevoda. Prvi deo: medijana ${ms(summary.first.median)} (90% ispod ${ms(summary.first.p90)}). ` +
    `Ceo prevod: medijana ${ms(summary.total.median)} (90% ispod ${ms(summary.total.p90)}).${reused}`
  );
}
