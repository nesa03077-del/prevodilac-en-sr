// Drži ekran budnim dok se sluša, da računar ne ode u spavanje usred smene.
// Ako pregledač ne podržava, ništa se ne dešava.

export function createWakeLock(nav = navigator) {
  let sentinel = null;
  let wanted = false;

  async function acquire() {
    wanted = true;
    if (sentinel || !nav?.wakeLock) return;
    try {
      const s = await nav.wakeLock.request('screen');
      if (!wanted) {
        s.release().catch(() => {});
        return;
      }
      sentinel = s;
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      /* odbijeno ili nedostupno */
    }
  }

  function release() {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    s?.release().catch(() => {});
  }

  // Pregledač pušta zaključavanje kad stranica nije vidljiva; vraćamo ga kad se vrati.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && wanted && !sentinel) acquire();
    });
  }

  return { acquire, release, get active() { return sentinel !== null; } };
}
