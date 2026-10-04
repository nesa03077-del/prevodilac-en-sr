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

## [x] Korak 5a - Alati za prvu upotrebu u poslu

- Provera uređaja (Podešavanja): HTTPS, internet, prepoznavanje govora, dozvola i uređaj za
  mikrofon, srpski i engleski glas, mali prozor, ekran budan, instalacija i probni prevod sa
  merenjem; svaka stavka ima objašnjenje šta da se uradi (`diagnostics.js`)
- Merenje brzine u pravoj upotrebi: medijana i 90. percentil za prvi deo i ceo prevod, udeo
  preuzetih prevoda (`metrics.js`); prikazuje se u Podešavanjima
- Prijava greške jednim klikom ispod svakog prevoda (vrsta greške, kako treba da glasi, napomena),
  čuva se samo na uređaju, izvoz u JSON; `scripts/reports-to-cases.mjs` pravi kostur novog
  slučaja za `smoke-cases.js` (`reports.js`)
- `PILOT.md`: uputstvo za dispečera (pre smene, tokom smene, prijavljivanje grešaka, šta ne radi)
- `docs/pregled-za-govornika.md`: spisak fraza i izraza za maternjeg govornika, pravi se iz koda
  (`npm run review-sheet`), test proverava da se ne razilazi sa kodom
- Provera: 214 testova i 162 provere u Chromium-u
- GitHub Actions: instalacija, testovi i gradnja prolaze u CI; korak `configure-pages` pada jer
  GitHub Pages nije uključen u repou (vidi 5b)

## [ ] Korak 5b - Pilot (traži ljude)

Ovo ne može da uradi program, nego vlasnik repoa, dispečer i maternji govornik:

- Uključiti GitHub Pages: Settings -> Pages -> Source: GitHub Actions, pa pokrenuti workflow
  "Objavi aplikaciju" (Actions -> Run workflow); adresa: https://nesa03077-del.github.io/prevodilac-en-sr/
- Maternji govornik popunjava `docs/pregled-za-govornika.md`; ispravke se unose u `phrases.js` i `prompt.js`
- `ANTHROPIC_API_KEY=... npm run smoke` (19 slučajeva, 7 kamionskih); proveriti vreme do prvog dela
- Dispečer radi po `PILOT.md` nekoliko smena; izvozi prijave; svaka prijava postaje test, pa tek onda
  izmena prompta
- Odluka posle pilota: da li je potrebno i prepoznavanje glasa pozivaoca iz slušalica (virtuelni audio
  kabl i plaćeno prepoznavanje govora) ili je mikrofon dovoljan

## [x] Korak 6 - Prevođenje uživo, web (probna verzija)

Zahtev korisnika: da govori u mikrofon i da se prevodi odmah, i da sluša engleski i da se odmah
prevodi na srpski, u realnom vremenu, bez dugmadi. Skil: `prevodilac-uzivo`.

- Pogled "Uživo": Pokreni/Zaustavi, dva načina (zvuk poziva + moj mikrofon, ili jedan mikrofon sa
  automatskim prepoznavanjem jezika), moj jezik srpski/engleski, izgovor prevoda sagovorniku i/ili
  meni, izbor izlaznog uređaja (virtuelni kabl), merač nivoa
- Jezgro: `pcm.js`, `audio-capture.js` (16 kHz PCM), `azure-speech.js` (prepoznavanje i glas),
  `audio-player.js`, `live-voice.js`, `media-streams.js`, `live-interpreter.js`; podešavanja za Azure
  ključ i region, red "Azure govor" u proveri uređaja, `docs/azure-govor.md`
- Hvatanje se utišava dok se izgovara prevod (nema slušanja samog sebe)
- Provera: 313 testova i 224 provere u Chromium-u sa lažnim Azure SDK-om i lažnim zvukom
- NIJE provereno: pravi Azure servis (potreban ključ i region), pravi zvuk poziva, pravi uređaji,
  kašnjenje u pravoj upotrebi, jezik sr-RS u Azure prepoznavanju (kvalitet), cene i kvota

## [x] Korak 7 - Windows aplikacija (Electron)

- Folder `desktop/` (zaseban `package.json`, ne dira web aplikaciju): `main.js`, `preload.js`,
  `electron-builder.yml`; stranica se služi preko `app://` (bezbedan kontekst), mikrofon se dozvoljava
  samo našoj stranici, spoljni linkovi idu u pregledač
- Zvuk poziva: `getDisplayMedia` se u aplikaciji rešava bez pitanja, hvata zvuk celog računara
  (loopback, Windows); prečice Ctrl+Alt+P (iznad ostalih programa) i Ctrl+Alt+L (pokreni/zaustavi uživo)
- GitHub Actions `windows.yml` (ručno pokretanje): testovi, gradnja, provera otvaranja, pakovanje
  (instalacija i prenosiva verzija); fajlovi su u Artifacts
- Provera: `npm run smoke` u `desktop/` otvara pravi Electron (Linux, xvfb): stranica se učitava preko
  `app://` sa CSP-om, skripte rade, pogled Uživo postoji, preload radi
- NIJE provereno: rad na Windows-u (instalacija, loopback zvuk, prečice, iznad ostalih programa),
  Actions gradnja, potpisivanje (aplikacija nije potpisana: Windows SmartScreen će upozoriti)

## [x] Korak 8 - Android aplikacija (Capacitor), probna

- Folder `mobile/` (zaseban `package.json`): Capacitor 8 omotač oko `dist/`, aplikacija `rs.prevodilac.mobile`,
  dozvole INTERNET, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, WAKE_LOCK; bez cloud rezervne kopije
  (`allowBackup=false`, da API ključevi ne idu u rezervnu kopiju)
- Android WebView nema hvatanje zvuka poziva ni Web Speech: pogled "Uživo" sam bira "Isti mikrofon"
  (sagovornik na zvučniku) i radi preko Azure-a; "Razgovor" objašnjava da nije podržan
- Gradnja: `npm run build`, pa u `mobile/`: `npm ci`, `npx cap sync android`, u `android/` `./gradlew assembleDebug`
  (Java 21, Android SDK 36); GitHub Actions `android.yml` (ručno pokretanje), APK u Artifacts
- Provera: debug APK je napravljen ovde (4,3 MB), pregledan sa `aapt2` (paket, dozvole, web fajlovi unutra)
- NIJE provereno: instalacija i rad na telefonu (mikrofon u WebView-u, Azure, glas, kašnjenje, ekran budan),
  jer ovde nema telefona ni emulatora. APK je debug (nije potpisan za Play prodavnicu), ikona je podrazumevana
  Capacitor ikona
- Ograničenje: Android ne dozvoljava običnoj aplikaciji da uhvati zvuk poziva; za poziv se koristi zvučnik
