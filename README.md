# Prevodilac engleski <-> srpski

Prevod u realnom vremenu, za kucanje i razgovor. Prevodi Claude (Anthropic API);
srpski prevod je uvek latinicom. Plan i stanje rada: [ROADMAP.md](ROADMAP.md).

## Pokretanje

```bash
git clone https://github.com/nesa03077-del/prevodilac-en-sr.git
cd prevodilac-en-sr
npm install
npm run dev                               # aplikacija na http://localhost:5173
npm test                                  # automatski testovi (bez interneta i ključa)
npm run build && npm run e2e              # provera u pravom pregledaču (lažni API)
ANTHROPIC_API_KEY=sk-ant-... npm run smoke  # prava provera prevoda i brzine
```

Pogled "Razgovor" radi u Chrome-u i Edge-u (potreban je mikrofon). Namenjen je dispečerima kamiona u SAD: proverene fraze, provera brojeva, mali prozor iznad ostalih programa i instalacija kao aplikacija (PWA).

Za prvu upotrebu u poslu pogledajte [PILOT.md](PILOT.md).

Pri prvom otvaranju aplikacija traži Anthropic API ključ. Ključ ostaje samo u vašem
pregledaču (localStorage) i šalje se samo na api.anthropic.com.

`npm run smoke` troši malo kredita sa naloga (12 kratkih rečenica). Drugi model
ili effort: `MODEL=claude-sonnet-5-5 EFFORT=low npm run smoke`.

## Struktura

| Putanja | Šta radi |
|---|---|
| `index.html`, `src/ui/` | Ekran (stranica, stilovi, povezivanje sa jezgrom) |
| `src/core/models.js`, `settings.js`, `direction.js` | Modeli, podešavanja, natpisi smera |
| `src/core/speech-recognizer.js`, `speaker.js`, `conversation.js` | Razgovor govorom: prepoznavanje, izgovor, tok razgovora |
| `src/core/numbers.js`, `phrases.js`, `domains.js` | Provera brojeva, gotove fraze, oblasti (rečnik) |
| `src/core/diagnostics.js`, `metrics.js`, `reports.js` | Provera uređaja, merenje brzine, prijave grešaka |
| `PILOT.md`, `docs/pregled-za-govornika.md` | Uputstvo za pilot, spisak za maternjeg govornika |
| `src/ui/mini-window.js`, `wakelock.js` | Mali prozor iznad ostalih programa, ekran ostaje budan |
| `public/`, `vite.config.js` | Manifest, ikone, servisni radnik (pravi se pri gradnji) |
| `src/core/translator.js` | Poziv Claude API-ja, strimovanje, greške |
| `src/core/live.js` | Prevod dok se kuca/govori (debounce, prekid starih zahteva) |
| `src/core/detect.js` | Prepoznaje da li je tekst engleski ili srpski |
| `src/core/prompt.js` | Pravila prevoda za model |
| `src/core/transliterate.js` | Ćirilica -> latinica |
| `test/` | Testovi (vitest) |
| `scripts/smoke.js`, `scripts/smoke-cases.js` | Provera sa pravim API-jem |
| `scripts/e2e.mjs` | Provera ekrana u Chromium-u, snimci u `e2e-shots/` |

Pravila rada su u skilovima u `.claude/skills/prevodilac-*`.
