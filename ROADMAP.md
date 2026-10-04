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

## [ ] Korak 2 - Režim kucanja (web)

- Stranica sa dva polja: tekst levo, prevod desno (na telefonu jedno ispod drugog)
- Prevod se pojavljuje dok se kuca; smer: Automatski / EN->SR / SR->EN, dugme za zamenu
- Unos API ključa (čuva se samo na uređaju), izbor modela, brisanje ključa
- Dugmad: kopiraj prevod, obriši; prikaz grešaka na srpskom
- Provera: build, Playwright snimci na 390 px i 1280 px

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
