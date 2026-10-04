# Prevodilac engleski <-> srpski

Prevod u realnom vremenu, za kucanje i razgovor. Prevodi Claude (Anthropic API);
srpski prevod je uvek latinicom. Plan i stanje rada: [ROADMAP.md](ROADMAP.md).

## Pokretanje

```bash
git clone https://github.com/nesa03077-del/prevodilac-en-sr.git
cd prevodilac-en-sr
npm install
npm test                                  # automatski testovi (bez interneta i ključa)
ANTHROPIC_API_KEY=sk-ant-... npm run smoke  # prava provera prevoda i brzine
```

`npm run smoke` troši malo kredita sa naloga (12 kratkih rečenica). Drugi model
ili effort: `MODEL=claude-sonnet-5-5 EFFORT=low npm run smoke`.

## Struktura

| Putanja | Šta radi |
|---|---|
| `src/core/translator.js` | Poziv Claude API-ja, strimovanje, greške |
| `src/core/live.js` | Prevod dok se kuca/govori (debounce, prekid starih zahteva) |
| `src/core/detect.js` | Prepoznaje da li je tekst engleski ili srpski |
| `src/core/prompt.js` | Pravila prevoda za model |
| `src/core/transliterate.js` | Ćirilica -> latinica |
| `test/` | Testovi (vitest) |
| `scripts/smoke.js`, `scripts/smoke-cases.js` | Provera sa pravim API-jem |

Pravila rada su u skilovima u `.claude/skills/prevodilac-*`.
