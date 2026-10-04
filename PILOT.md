# Prva upotreba u poslu (pilot)

Za dispečera kamiona koji govori engleski i vozače koji govore srpski. Aplikacija je pomoć, ne zamena
za proveru: uvek se vidi i izgovoreni tekst, a važne stvari (adresa, vreme, cena, broj tovara) se
potvrđuju.

## Pre prve smene (jednom, oko 10 minuta)

1. **Otvorite aplikaciju u Chrome-u ili Edge-u** na računaru, na objavljenoj adresi
   (`https://nesa03077-del.github.io/prevodilac-en-sr/`, kad se uključi GitHub Pages).
   Kliknite ikonu za instalaciju pored adrese, da se otvara kao posebna aplikacija.
2. **Unesite Anthropic API ključ** (Podešavanja). Ključ ostaje samo na ovom računaru.
3. **Podešavanja → Proveri uređaj.** Sve treba da bude "U redu". Šta znače poruke:
   - *Dozvola za mikrofon / Mikrofon:* dozvolite mikrofon kad pregledač pita; proverite da je slušalica povezana.
   - *Srpski glas:* ako ga nema, prevod na srpski se samo prikazuje. Dodajte srpski glas u podešavanjima računara.
   - *Probni prevod:* pokazuje koliko traje jedan prevod. Ako je "sporo", probajte model Sonnet 5.5.
4. **Isprobajte:** Razgovor → "Engleski govori" → recite "Where are you right now?". Zatim "Srpski govori".

## Tokom smene

- **Razgovor** (prečice **1** = engleski govori, **2** = srpski govori, **Esc** = stop).
  Prevod se vidi dok osoba govori, a izgovara se kad završi rečenicu. Mikrofon se pauzira dok se
  prevod izgovara.
- **Mali prozor:** plutajući prozor iznad programa u kom radite. Glavni prozor ostaje otvoren (ne zatvarati).
- **Brze fraze:** pritisak izgovara proveren srpski tekst odmah, bez čekanja.
- **Šta uvek proveriti:**
  - brojevi su istaknuti; ako se pojavi **crveno upozorenje**, brojevi se ne poklapaju, ne oslanjajte se na prevod;
  - za adresu, vreme, cenu i brojeve tovara koristite **"Proveri prevodom nazad"**;
  - kritičan broj potvrdite naglas, cifru po cifru.
- Ako nešto nije jasno, ponovite rečenicu kraće i sporije.

## Prijavljivanje grešaka (najvažnije za pilot)

Svaki loš prevod: **"Prijavi grešku"** ispod prevoda → izaberite vrstu greške → upišite kako treba da
glasi → Sačuvaj. Prijave ostaju samo na ovom računaru.

Na kraju svakog dana ili nedelje: **Podešavanja → Prijave grešaka → Izvezi (JSON)** i pošaljite fajl
programeru. Svaka prijava postaje novi test, pa ista greška ne može da se vrati.

## Šta aplikacija ne radi

- Ne čuje glas pozivaoca iz slušalica, samo ono što uhvati mikrofon.
- Radi samo dok je aplikacija (ili mali prozor) otvorena; bez interneta ne prevodi.
- Mikrofon i prepoznavanje govora rade u Chrome-u i Edge-u (zvuk se šalje Google-ovom servisu za
  prepoznavanje); tekst se šalje Anthropic-u radi prevoda.
- Prevod mašine može da pogreši, naročito kod brojeva, imena i žargona.

## Za programera

1. Pregled od maternjeg govornika: `docs/pregled-za-govornika.md` (`npm run review-sheet` ga osvežava).
2. Prijave u testove: `node scripts/reports-to-cases.mjs prijave.json`, rezultat u `scripts/smoke-cases.js`,
   popuniti `expect`, pa `ANTHROPIC_API_KEY=... npm run smoke` pre i posle izmene prompta.
3. Brzina: Podešavanja → Brzina prevoda (medijana i 90. percentil iz stvarne upotrebe).
