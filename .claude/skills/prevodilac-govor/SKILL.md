---
name: prevodilac-govor
description: Govorni režim prevodioca - prepoznavanje govora (Web Speech API, sr-RS i en-US), izgovor prevoda (speechSynthesis), dozvole za mikrofon i podrška pregledača. Koristi pri radu na razgovornom režimu (korak 3 u ROADMAP.md) i pri svakoj prijavi problema sa mikrofonom ili izgovorom.
---

# Govor: slušanje i izgovor

## Model razgovora

Kao kod tumača: dva dugmeta - **"Engleski govori"** i **"Srpski govori"**.
Smer je zadat dugmetom (ne pogađa se), pa su jezik prepoznavanja i jezik
izgovora uvek poznati. Pritisak drugog dugmeta zaustavlja prvo slušanje.

## Prepoznavanje (`SpeechRecognition` / `webkitSpeechRecognition`)

- `lang`: `'en-US'` za engleski, `'sr-RS'` za srpski.
- `interimResults = true` - delimičan tekst ide u `live.update()` (debounce),
  pa se prevod pojavljuje dok osoba još govori.
- Konačan rezultat (`isFinal`) -> `live.flush()` odmah, i rečenica se dodaje u
  istoriju razgovora (kontekst za sledeće prevode, poslednjih ~6 izjava).
- `continuous = true`, ali Chrome ipak prekida posle tišine: na `onend`, ako
  korisnik nije zaustavio slušanje, pokreni ponovo.
- Greške (`onerror`): `not-allowed` / `service-not-allowed` -> poruka da treba
  dozvoliti mikrofon; `no-speech` -> tiho nastavi; `network` -> poruka o vezi;
  `language-not-supported` -> poruka da pregledač ne podržava jezik.
- Prepoznavanje radi samo na HTTPS (ili `localhost`) i traži dozvolu za mikrofon.
- Podrška: Chrome/Edge (desktop i Android) - da; Safari - delimično; Firefox - ne.
  Ako API ne postoji, sakrij govorni režim i objasni zašto; kucanje radi svuda.

## Izgovor (`speechSynthesis`)

- Izgovori **konačan** prevod (ne delimičan) na jeziku cilja.
- Glas: prvi iz `speechSynthesis.getVoices()` čiji `lang` počinje sa `sr`
  (ili `hr`/`bs` kao rezerva za srpsku latinicu), odnosno `en`. Glasovi se
  učitavaju asinhrono - sačekaj `voiceschanged`.
- Ako nema srpskog glasa: prevod se samo prikazuje, uz jednu napomenu korisniku.
- Dok traje izgovor, pauziraj prepoznavanje da aplikacija ne bi "čula" sebe.
- Prekidač "Izgovaraj prevod" u podešavanjima (podrazumevano uključen u
  razgovoru, isključen pri kucanju).

## Testiranje

- Logika (stanja slušanja, ponovno pokretanje, izbor glasa) ide u
  `src/core/` sa ubačenim (inject) lažnim `SpeechRecognition`/`speechSynthesis`
  objektima i testira se u `test/`.
- Pravi mikrofon se ne može testirati automatski - na kraju koraka korisniku
  daj kratku listu za ručnu proveru na telefonu.
