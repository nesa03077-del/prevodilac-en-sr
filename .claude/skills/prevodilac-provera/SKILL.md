---
name: prevodilac-provera
description: Obavezna provera pre svakog commit-a u projektu prevodioca - testovi, build, pregled izmena, provera u pregledaču i ručna lista za korisnika. Koristi na kraju svakog koraka i pre svakog push-a.
---

# Provera pre commit-a

Sve komande se pokreću iz korena projekta. Ako bilo šta padne - popravi, pa
ponovi celu listu. Nikad ne preskači, ne isključuj i ne briši test da bi
prošlo.

## 1. Automatske provere

```bash
npm test              # svi testovi moraju proći
npm run build         # od koraka 2 (kad postoji UI); bez upozorenja o greškama
```

## 2. Pregled izmena

```bash
git status
git diff --stat
git diff
```

Proveri:
- nema API ključeva, `.env` fajlova, `node_modules/` ni `dist/` u commit-u
- nema zaostalih `console.log` za debagovanje, zakomentarisanog koda, TODO bez objašnjenja
- svaka nova funkcija u `src/core/` ima test
- tekst za korisnika je na srpskom latinicom sa dijakriticima
- `package-lock.json` je ažuriran ako je menjan `package.json`

## 3. Provera u pregledaču (od koraka 2)

```bash
npm run build && npm run e2e
```

`scripts/e2e.mjs` pokreće izgrađenu stranicu u Chromium-u (Playwright je već u
okruženju; ne dodaje se u projekat i ne pokreće se `playwright install`), laže
Anthropic API na mrežnom nivou i proverava ceo put kroz pravi SDK. Svaka nova
mogućnost ekrana dobija novu proveru u tom fajlu. Posle toga **pogledaj snimke**
iz `e2e-shots/` (telefon 390 px i računar 1280 px, svetla i tamna tema); brojevi
ne otkrivaju loš izgled.

## 4. Pravi API (kad je menjan prompt, model ili zahtev)

```bash
ANTHROPIC_API_KEY=... npm run smoke
```

Ako ključ nije dostupan u okruženju, jasno to napiši korisniku i zamoli ga da
pokrene `npm run smoke` kod sebe.

## 5. Ručna lista za korisnika

Na kraju koraka daj korisniku 3-6 konkretnih stvari da proba (npr. "ukucaj
'Where is the station?' - prevod treba da se pojavi dok kucaš"). Govor i
mikrofon se uvek proveravaju ručno na telefonu.
