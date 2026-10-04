---
name: prevodilac-tok-rada
description: Tok rada na projektu prevodioca engleski <-> srpski (repo prevodilac-en-sr). Koristi na početku svakog zadatka u ovom projektu - pre planiranja, pisanja koda ili commit-a - da bi se radilo korak po korak prema ROADMAP.md, bez preskakanja provera.
---

# Tok rada: prevodilac EN <-> SR

Projekat je zaseban repo `prevodilac-en-sr`. Cilj: prevod engleski <-> srpski u realnom vremenu,
za kucanje i za razgovor (govor), prvo kao web aplikacija (PWA), zatim Android.

## Pravila

1. **Jedan korak odjednom.** Plan je u `ROADMAP.md`. Radi samo prvi
   nezavršeni korak. Ne počinji sledeći dok tekući nije gotov i proveren.
2. **Pre koda pročitaj** `ROADMAP.md` i skil koji pokriva oblast:
   - Claude API, model, strimovanje, greške -> `prevodilac-claude-api`
   - kvalitet prevoda, sistemski prompt, latinica -> `prevodilac-kvalitet-prevoda`
   - mikrofon, prepoznavanje govora, izgovor -> `prevodilac-govor`
   - dispečerski režim, tačnost brojeva, brze fraze, mali prozor, PWA -> `prevodilac-dispecer`
   - provera pre commit-a -> `prevodilac-provera` (uvek, na kraju svakog koraka)
3. **Jezgro je čist JavaScript bez DOM-a** (`src/core/`). UI (`src/ui/`) samo
   poziva jezgro. Logika koju je moguće testirati ide u jezgro, ne u UI.
4. **Svaka izmena ponašanja ima test** u `test/`. Ispravka greške
   počinje testom koji tu grešku pokazuje.
5. **Nema tihih grešaka.** Svaka greška korisniku daje poruku na srpskom
   (`ERROR_MESSAGES` u `src/core/translator.js`); prekid (`aborted`) se ne prikazuje.
6. **Tekst za korisnika je na srpskom latinicom**, sa dijakriticima (č, ć, š, ž, đ).
   Komentari u kodu takođe na srpskom; imena funkcija i promenljivih na engleskom.
7. **Bez novih zavisnosti** bez jasnog razloga. Trenutno: `@anthropic-ai/sdk`,
   `vite`, `vitest`.

## Završetak koraka (Definicija "gotovo")

- [ ] `prevodilac-provera` prošao (testovi, build ako postoji UI, pregled diff-a)
- [ ] Ako je menjan prompt ili model: `npm run smoke` sa pravim ključem, ili jasno
      napisano korisniku da nije pokrenut i zašto
- [ ] `ROADMAP.md`: korak označen sa `[x]`, upisano šta je urađeno i šta je ostalo
- [ ] Commit sa jasnom porukom na srpskom (`Prevodilac: korak N - ...`), push na
      radnu granu
- [ ] Korisniku kratak izveštaj: šta radi, kako da proba, šta je sledeći korak

## Ako nešto nije jasno

Odluke koje menjaju proizvod (platforma, plaćeni servisi, izgled, ponašanje
koje korisnik vidi) pitaj korisnika. Tehničke sitnice odluči sam i navedi ih
u izveštaju.
