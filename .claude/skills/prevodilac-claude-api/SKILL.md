---
name: prevodilac-claude-api
description: Pravila za poziv Claude API-ja u prevodiocu (src/core/translator.js) - model, effort, strimovanje, prekid zahteva, rezervni model, greške i čuvanje API ključa. Koristi pre svake izmene koja dodiruje Anthropic SDK, model ili način slanja zahteva.
---

# Claude API u prevodiocu

Sav poziv API-ja je u `src/core/translator.js`. UI ga nikad ne
poziva direktno.

## Zahtev (ne menjati bez razloga)

- SDK: `@anthropic-ai/sdk`, poziv `client.beta.messages.stream(...)`.
- Model: `DEFAULT_MODEL = 'claude-opus-5-5'`. Drugi model samo ako ga korisnik
  izabere (podešavanja) - npr. `claude-sonnet-5-5` ili `claude-haiku-4-5` za
  brži/jeftiniji rad. Koristi tačne ID-jeve, bez datuma na kraju.
- `output_config: { effort: 'low' }` - prevod ne traži duboko razmišljanje, a
  `low` daje najkraće čekanje. Na `claude-opus-5-5` razmišljanje ne može da se
  isključi: **ne šalji `thinking`** (`{type:'disabled'}` i `budget_tokens` daju 400).
  Za `claude-haiku-4-5` ne šalji ni `output_config.effort` (vraća grešku) - ako
  se doda izbor modela, effort se šalje samo modelima koji ga podržavaju.
- Rezervni model: `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`.
  Ako model odbije zahtev, server ga ponovi na preporučenom modelu. Uvek proveri
  `stop_reason === 'refusal'` pre čitanja teksta.
- `max_tokens: 16000` - ne smanjivati; preduga granica ne košta ništa, prekratka
  seče prevod.
- Bez prefill-a (poslednja poruka asistenta) - daje 400 na ovim modelima.
- Sistemski prompt mora biti isti bajt-po-bajt za isti smer (bez datuma,
  nasumičnih ID-jeva) - vidi `prevodilac-kvalitet-prevoda`.

## Strimovanje i realno vreme

- Tekst se skuplja iz `content_block_delta` / `text_delta` i šalje kroz `onText`
  posle svakog dela (već očišćen i preslovljen u latinicu).
- Svaki zahtev prima `signal` (AbortController). `src/core/live.js` prekida stari
  zahtev čim stigne nov tekst i odbacuje zakasnele odgovore (redni broj `seq`).
  Ova dva mehanizma se ne uklanjaju - bez njih se na ekranu mešaju prevodi.
- Debounce za kucanje: `DEFAULT_DEBOUNCE_MS = 350`. Za govor se koristi `flush()`
  kad prepoznavanje javi kraj rečenice.
- Posle server-side fallback-a usred strima delimičan tekst ostaje i nastavlja se
  - zato se tekst samo nadovezuje, ništa se ne briše.

## Greške

`toTranslationError` pretvara SDK greške u kodove (od najužeg ka najširem):
`aborted`, `auth`, `permission`, `rate_limit`, `bad_request`, `overloaded`,
`network`, `unknown`, plus `refusal` i `empty`. Svaki kod ima poruku u
`ERROR_MESSAGES`. Ne hvataj greške poređenjem teksta poruke - samo klase SDK-a.
Novi kod greške = nova poruka + test u `test/translator.test.js`.

## API ključ

- Web verzija nema server: korisnik unosi svoj ključ, čuva se samo na
  njegovom uređaju (`localStorage`), šalje se samo na `api.anthropic.com`.
  Klijent se pravi sa `dangerouslyAllowBrowser: true` (`createClient`).
- Ključ se nikad ne upisuje u kod, test, commit, log ili poruku o grešci.
- U UI-u ključ se prikazuje maskirano i može se obrisati.
- Za testove se koristi lažni klijent `test/fake-client.js`, ne pravi ključ.
