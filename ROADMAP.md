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

## [x] Korak 3 - Režim razgovora (govor)

- Pogled "Razgovor" pored "Kucanje" (`src/ui/talk.js`): dugmad "Engleski govori" / "Srpski govori",
  smer je zadat dugmetom, pritisak drugog dugmeta menja govornika, ponovni pritisak zaustavlja
- Prevod uživo dok osoba govori (isprekidan okvir), završena rečenica postaje stavka razgovora;
  istorija (poslednjih 6 rečenica) ide modelu kao kontekst za rod i izraze
- Izgovor prevoda na jeziku sagovornika (srpski glas, uz hrvatski/bosanski kao rezervu);
  mikrofon je pauziran dok se izgovara, pa se sam vraća; prekidač "Izgovaraj prevod" je zapamćen
- Srpski govor se uvek prikazuje latinicom (i kad pregledač vrati ćirilicu)
- Mikrofon se gasi pri prelasku na kucanje i kad stranica nije vidljiva
- Jasne poruke: mikrofon nije dozvoljen / nije pronađen, nema mreže, pregledač bez govora
  (kucanje i dalje radi), nema srpskog glasa (prevod se samo prikazuje)
- Jezgro bez DOM-a: `speech-recognizer.js` (ponovno pokretanje, zaštita od petlje),
  `speaker.js` (izbor glasa, red izgovora), `conversation.js` (tok razgovora)
- Provera: 135 testova (lažni SpeechRecognition i speechSynthesis) i 98 provera u Chromium-u
  (`npm run e2e`), uključujući lažni mikrofon; snimci razgovora na 390 i 1280 px
- Nije provereno (ne može automatski): pravi mikrofon i pravi glasovi. Pogledati listu u
  skilu `prevodilac-govor` ("Ručna provera na telefonu"). Pravi odgovori Claude-a (`npm run smoke`)
  još nisu pokrenuti, nema ključa u okruženju
- Poznata ograničenja: Firefox nema prepoznavanje govora; Chrome šalje zvuk svom servisu za
  prepoznavanje; na nekim telefonima nema srpskog glasa

## [x] Korak 4 - Dispečerski režim i instalacija (PWA)

Odluke korisnika: dispečer kamiona u SAD (logistika), samo mikrofon, mali prozor koji stoji
iznad ostalih programa, podaci smeju van firme. Detalji i pravila: skil `prevodilac-dispecer`.

- Tačnost: oblast "Kamionski transport i logistika (SAD)" (podrazumevana) dodaje rečnik i pravila
  u prompt (brojevi, adrese i jedinice tačno, engleski stručni izrazi, vozački žargon); mašinska
  provera brojeva (`numbers.js`) sa crvenim upozorenjem i istaknutim ciframa; dugme "Proveri
  prevodom nazad"
- Brzina: gotove fraze (`phrases.js`, 30 fraza u 5 grupa) se izgovaraju odmah bez mreže;
  prevod koji je stigao uživo koristi se bez novog zahteva; rok 20 s i jedan ponovni pokušaj;
  prečice 1 / 2 / Esc; ekran ostaje budan dok se sluša
- Mali prozor: Document Picture-in-Picture (`mini-window.js`), razgovor se prebacuje u
  plutajući prozor iznad ostalih programa; mikrofon radi dok je otvoren
- PWA: manifest, ikone, servisni radnik (pravi ga `vite.config.js`), otvara se bez interneta,
  oznaka "Bez interneta"
- Objava: `.github/workflows/pages.yml` (GitHub Pages)
- Provera: 177 testova i 138 provera u Chromium-u, uključujući mali prozor (lažni PiP), PWA i rad
  bez interneta
- Nije provereno: pravi odgovori Claude-a (`npm run smoke`, 19 slučajeva od kojih 7 kamionskih,
  nema ključa u okruženju), pravi Picture-in-Picture prozor, pravi mikrofon i glasovi
- Za pregled od strane maternjeg govornika: srpski tekst brzih fraza (`phrases.js`) i rečnik u
  promptu (`prompt.js`)
- Ograničenja: mikrofon se čuje samo dok je aplikacija (ili mali prozor) otvorena; ne hvata glas
  pozivaoca iz slušalica (za to treba virtuelni audio kabl i plaćeno prepoznavanje govora);
  Firefox nema prepoznavanje govora ni mali prozor

## [ ] Korak 5 - Objava i prva upotreba u poslu

- Uključiti GitHub Pages (Settings -> Pages -> Source: GitHub Actions) i otvoriti HTTPS adresu
- Pregled fraza i rečnika od strane maternjeg govornika koji vozi u SAD
- `npm run smoke` sa pravim ključem; izmeriti vreme do prvog dela prevoda; po potrebi Sonnet 5.5
- Pilot u pravom poslu, beleženje grešaka koje dispečer primeti (svaka ide u `smoke-cases.js`)

## [ ] Korak 6 - Android aplikacija (po potrebi)

- Omotač oko web verzije (npr. Capacitor), dozvola za mikrofon, APK
- Novi skil `prevodilac-android` pre početka koraka
