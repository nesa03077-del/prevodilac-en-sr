---
name: prevodilac-dispecer
description: Dispečerski režim prevodioca (kamionski transport u SAD) - tačnost brojeva i adresa, rečnik oblasti, unapred proverene fraze, provera prevodom nazad, brzina odgovora, mali plutajući prozor i instalacija (PWA). Koristi pri svakoj izmeni koja utiče na tačnost ili brzinu prevoda u poslu, i pri radu na fajlovima numbers.js, phrases.js, domains.js, mini-window.js, vite.config.js (servisni radnik).
---

# Dispečerski režim

Korisnik: dispečer kamiona u SAD (govori engleski) i vozač iz Srbije (govori srpski, često
sa engleskim izrazima). Odluke korisnika: samo mikrofon, mali prozor iznad ostalih
programa, podaci smeju da idu Anthropic-u i Chrome-ovom servisu za govor.

**Načelo: brzo je važno, ali tačno je važnije. Aplikacija je pomoć, ne zamena za proveru.**
Zato se uvek vidi i izvorni tekst, brojevi su istaknuti, a razlike se prijavljuju.

## Tačnost (mašinske zaštite koje ne zavise od modela)

- `src/core/numbers.js`: `compareNumbers(izvor, prevod)` poredi cifre (broj tovara, ZIP, sat,
  težina). Razlika daje crveno upozorenje na stavci. Proverava se samo kad izvor ima cifre.
  Format zapisa ne smeta (`1,200` = `1.200`, `14:30` = `14.30`), redosled reči ne smeta.
- Brojevi su istaknuti (`mark.num`) u izvornom tekstu, prevodu i prevodu nazad.
- "Proveri prevodom nazad" (`conversation.verify`): prevod se vraća na jezik govornika i
  ponovo poredi sa originalom. Ne radi za gotove fraze.
- Prompt oblasti `trucking` (`src/core/prompt.js`): rečnik (BOL, POD, detention, lumper, reefer,
  HOS...), vozački žargon ("pikap", "lod"), brojevi/adrese/jedinice se prepisuju tačno, bez
  konverzije jedinica, bez dodate učtivosti.
- `scripts/smoke-cases.js` ima slučajeve sa `domain: 'trucking'`; svaka nova greška koju
  dispečer prijavi postaje novi slučaj pre ispravke prompta.

## Brzina

- Gotove fraze (`src/core/phrases.js`) se izgovaraju odmah, bez mreže i bez modela.
  **Fraze mora da pregleda maternji govornik srpskog koji vozi u SAD** pre prave upotrebe.
  Ograničenja: srpski latinica, najviše 80 znakova, isti brojevi u engleskom i srpskom tekstu
  (test to proverava).
- Prevod koji je stigao dok je osoba još govorila koristi se odmah kad stigne konačna
  rečenica (`live.lastResult` + poređenje bez interpunkcije), pa nema novog zahteva.
- Klijent ima rok 20 s i jedan ponovni pokušaj (`createClient`): bolje brza poruka o grešci
  nego duga tišina. Rezervni model (`fallbacks`) je uključen gde ga model podržava.
- `preconnect` ka api.anthropic.com u `index.html`.
- Cilj za prvi deo prevoda je ispod ~1,5 s; meri se sa `npm run smoke` (traži pravi ključ).
  Ako je sporo: probati Sonnet 5.5 u podešavanjima pre menjanja koda.

## Mali prozor i instalacija

- `src/ui/mini-window.js`: Document Picture-in-Picture (Chrome/Edge 116+, računar). Ceo ekran
  razgovora (`#talking`) se prebacuje u plutajući prozor koji stoji iznad ostalih programa; u
  glavnom prozoru ostaje oznaka sa dugmetom "Vrati ovde". Mikrofon i izgovor rade u glavnom
  prozoru, pa se on ne sme zatvarati. Prečice 1, 2 i Esc rade i u malom prozoru.
- Dok je mali prozor otvoren, promena pogleda u glavnom prozoru ne gasi mikrofon.
- Mikrofon se inače gasi kad stranica nije vidljiva (ograničenje Web Speech API-ja), pa
  mali prozor je način za rad "u pozadini" bez prave desktop aplikacije.
- PWA: `public/manifest.webmanifest`, ikone (`scripts/make-icons.mjs`), servisni radnik koji
  `vite.config.js` pravi pri gradnji (spisak fajlova + hash verzije). Aplikacija se otvara bez
  interneta, ali prevod i govor traže mrežu. Servisni radnik nikad ne dira zahteve ka drugim
  adresama (API ide direktno).
- Sigurnosna politika (CSP) u završnoj verziji dozvoljava vezu samo ka api.anthropic.com. Zato
  stranica ne sme sama da `fetch`-uje svoje fajlove; test to čita spolja.

## Prvi dani u poslu (pilot)

- `PILOT.md` je uputstvo za dispečera; menja se zajedno sa ponašanjem aplikacije.
- Provera uređaja (`src/core/diagnostics.js`): nova mogućnost od koje aplikacija zavisi dobija
  svoju stavku u proveri, sa objašnjenjem šta korisnik da uradi.
- Merenje brzine (`src/core/metrics.js`): koristiti stvarne brojke iz Podešavanja pre nego što se
  menja model ili prompt zbog brzine.
- Prijava greške (`src/core/reports.js`): **svaka prijavljena greška postaje slučaj u
  `scripts/smoke-cases.js` pre izmene prompta** (`node scripts/reports-to-cases.mjs prijave.json`).
- `docs/pregled-za-govornika.md` se pravi komandom `npm run review-sheet`; test pada ako se fajl
  razilazi sa `phrases.js` ili `TRUCKING_TERMS` u `prompt.js`, pa ga posle izmene fraza ili izraza
  treba osvežiti.
- Podaci (prijave, merenja) ostaju samo u localStorage uređaja, nikad se ne šalju sami.

## Objava

`.github/workflows/pages.yml` gradi i objavljuje na GitHub Pages (HTTPS, potreban za mikrofon
na telefonu i na računaru van localhost-a). Vlasnik repoa mora jednom da uključi
Settings -> Pages -> Source: GitHub Actions.

## Provera

`npm test`, `npm run build && npm run e2e`. E2E ima proveru za prečice, fraze, upozorenje za
brojeve, prevod nazad, ponovnu upotrebu prevoda, oblast, mali prozor (lažni Picture-in-Picture)
i rad bez interneta. Pravi mikrofon, pravi glasovi i pravi Picture-in-Picture prozor mogu samo
ručno: vidi listu u `prevodilac-govor` i dodatak ispod.

### Ručna provera za dispečera (Chrome na računaru)

1. Otvorite adresu aplikacije, instalirajte je (ikona u adresnoj liniji) i otvorite instaliranu.
2. Razgovor -> "Mali prozor": prozor treba da stoji iznad programa u kom radite.
3. Pritisnite 1 (engleski govori), recite "Pick up load 48213 in Joliet at 14:30". Brojevi
   moraju biti isti u prevodu; ako nisu, mora da se pojavi crveno upozorenje.
4. "Proveri prevodom nazad" mora da vrati razumljiv engleski.
5. Brza fraza "Where are you right now?" se čuje odmah srpskim glasom.
6. Isključite mrežu: aplikacija se i dalje otvara, a prikazuje se oznaka "Bez interneta".
