---
name: prevodilac-uzivo
description: Režim "Uživo" (probna verzija) - prevođenje bez pritiskanja dugmadi, preko Azure servisa za govor; hvatanje mikrofona i zvuka poziva, izgovor prevoda, utišavanje hvatanja dok se govori, Windows (Electron) i Android (Capacitor). Koristi pri radu na src/core/live-interpreter.js, azure-speech.js, audio-capture.js, media-streams.js i src/ui/live-view.js.
---

# Uživo: prevođenje bez dugmadi

## Zašto Azure, a ne Web Speech API

Web Speech API ne prima gotov `MediaStream` (ne može da sluša zvuk poziva) i ne prepoznaje
jezik izjave. Azure Speech prima strimovan PCM (16 kHz, mono) i ume da odredi jezik
(`['sr-RS','en-US']`, v2 endpoint). Zato jezgro hvata zvuk samo (`audio-capture.js`) i šalje ga
kao push stream (`azure-speech.js`).

## Dva načina

- `two-streams`: moj mikrofon (moj jezik) + zvuk poziva (drugi jezik), dva prepoznavača, bez
  pogađanja ko govori. Zvuk poziva: `getDisplayMedia` sa zvukom (Chrome/Edge računar; Electron
  hvata zvuk celog računara). Android nema `getDisplayMedia`: samo `single-mic`.
- `single-mic`: jedan mikrofon (sagovornik na zvučniku), jezik izjave određuje Azure.

## Pravila

1. **Polu-dupleks**: dok se izgovara prevod, hvatanje se utišava (šalje se tišina iste dužine).
   Bez toga aplikacija sluša sama sebe. Provereno u e2e (`__playingNonzero === 0`).
2. Engleski glas za sagovornika ide na izabrani izlaz (`setSinkId`, npr. virtuelni kabl);
   glas za mene na podrazumevani. Izgovor je po podrazumevanom samo prema sagovorniku.
3. Prevod stigao uživo (delimičan tekst) preuzima se za konačnu rečenicu; brojevi se
   uvek upoređuju (`numbers.js`).
4. Greške na srpskom (`LIVE_MESSAGES`), greška servisa zaustavlja prevođenje i gasi mikrofon.
5. Napuštanje pogleda "Uživo" gasi sve tokove. Skrivena kartica NE gasi prevođenje (poziv radi
   u drugom prozoru).
6. Test seam: `globalThis.__PREVODILAC_FAKE_AZURE__` zamenjuje SDK (unit i e2e). Pravi Azure,
   pravi zvuk poziva i pravi uređaji se ne mogu proveriti automatski.
7. CSP (`vite.config.js`) dozvoljava samo Anthropic i Azure hostove (`*.stt/tts.speech.microsoft.com`,
   `*.cognitiveservices.azure.com`) i `media-src blob:`.

## Ručna provera (obavezno pre pouzdanja)

- Ključ i region: "Proveri uređaj" -> red Azure "U redu".
- Dva toka: pokrenuti, izabrati ceo ekran sa zvukom, pustiti engleski govor iz drugog prozora:
  prevod na srpskom se pojavljuje; reći srpsku rečenicu: engleski prevod se izgovara.
- Provera "sluša sebe": uključiti izgovor za mene i zvučnike; ne sme da nastane petlja.
- Kašnjenje: izmeriti od kraja izjave do početka glasa (cilj ispod ~2 s).

## Windows (desktop/)

Electron omotač oko `dist/`. `npm run build`, pa u `desktop/`: `npm ci`, `npx electron . --smoke --no-sandbox`
(Linux: `xvfb-run -a`). Loopback zvuk (`audio: 'loopback'` u `setDisplayMediaRequestHandler`) radi samo na
Windows-u i ne može da se proveri ovde. Gradnja: GitHub Actions "Windows aplikacija".

## Android (mobile/)

Capacitor 8, Java 21, Android SDK 36. Gradnja: `npm run build`, u `mobile/`: `npm ci && npx cap sync android`, u
`mobile/android/`: `ANDROID_HOME=... ./gradlew assembleDebug`. Dozvole su u `AndroidManifest.xml`. WebView nema
`getDisplayMedia`, pa je jedini režim `single-mic`. Nikad ne dodavati `allowBackup=true` (čuvaju se ključevi).
Provera na telefonu je obavezna ručna lista (mikrofon, Azure, glas, kašnjenje).
