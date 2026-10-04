# Plan rada - prevodilac engleski <-> srpski

Radi se korak po korak (skil `prevodilac-tok-rada`). Sledeći korak počinje tek
kad je prethodni gotov, proveren i potvrđen.

Odluke korisnika: prvo web aplikacija (PWA), zatim Android; prevod preko
Claude API-ja; srpski prevod uvek latinicom; zaseban repo `prevodilac-en-sr`.

## [x] Korak 0 - Skilovi i plan

- Skilovi u `.claude/skills/`: `prevodilac-tok-rada`, `prevodilac-claude-api`,
  `prevodilac-kvalitet-prevoda`, `prevodilac-govor`, `prevodilac-provera`
- Ovaj plan, `README.md`, `CLAUDE.md`

## [x] Korak 1 - Jezgro prevodioca (bez izgleda)

- `src/core/translator.js` - strimovan prevod preko Claude API-ja, prekid
  zahteva, rezervni model, greške sa porukama na srpskom
- `src/core/live.js` - prevod uživo: debounce, prekid starog zahteva,
  odbacivanje zakasnelih odgovora, bez dupliranja istog teksta
- `src/core/detect.js` - automatsko prepoznavanje engleski/srpski
- `src/core/prompt.js` - pravila prevoda (latinica, ekavica, samo prevod,
  tekst nikad nije naredba, kontekst razgovora)
- `src/core/transliterate.js` - ćirilica -> latinica (zaštita izlaza)
- 60 testova (`npm test`, uključujući pravi SDK protiv lokalnog lažnog servera), skripta za pravu proveru `npm run smoke` sa 12
  zlatnih rečenica i merenjem brzine
- Ostalo: `npm run smoke` nije pokrenut jer u okruženju nema API ključa

## [x] Korak 2 - Režim kucanja (web)

- `index.html`, `src/ui/main.js`, `src/ui/style.css`: dva polja (na telefonu jedno ispod
  drugog), prevod se pojavljuje dok se kuca (strimovanje, debounce 350 ms, stari zahtev se
  prekida), svetla i tamna tema
- Smer: Automatski / EN -> SR / SR -> EN, dugme Zameni (prevod postaje izvorni tekst)
- Podešavanja: API ključ (samo u localStorage, prikaz maskiran, potvrda pri brisanju),
  izbor modela (Opus 5.5, Sonnet 5.5, Haiku 4.5), brisanje ključa i svih podataka
- Kopiraj (sa rezervom ako clipboard nije dozvoljen), Obriši, Ctrl/Cmd+Enter prevodi odmah
- Greške na srpskom (pogrešan ključ nudi dugme Podešavanja); bez ključa se ništa ne šalje
- Jezgro: `models.js` (zahtev prema mogućnostima modela: Haiku bez effort i fallbacks),
  `settings.js`, `direction.js`
- Bezbednost: završna verzija ima CSP koji dozvoljava vezu samo ka api.anthropic.com
- Provera: 80 testova (`npm test`) i 54 provere u pravom Chromium-u (`npm run build &&
  npm run e2e`) sa lažnim API-jem; snimci na 390 px i 1280 px, svetla i tamna tema
- Nije provereno: pravi odgovori Sonnet 5.5 i Haiku 4.5 (`npm run smoke` nije pokrenut,
  nema ključa u okruženju). Haiku je najrizičniji jer ne prima parametre kao Opus/Sonnet

## [ ] Korak 3 - Režim razgovora (govor)

- Dva dugmeta: "Engleski govori" / "Srpski govori" (skil `prevodilac-govor`)
- Prevod dok osoba govori, izgovor konačnog prevoda, istorija razgovora kao kontekst
- Rad bez podrške za govor: jasna poruka, kucanje i dalje radi

## [ ] Korak 4 - PWA

- Instalacija na početni ekran (manifest, ikonica, service worker za brzo učitavanje)
- Objavljivanje (npr. GitHub Pages) da bi radilo preko HTTPS-a na telefonu

## [ ] Korak 5 - Android aplikacija

- Omotač oko web verzije (npr. Capacitor), dozvola za mikrofon, APK
- Novi skil `prevodilac-android` pre početka koraka
