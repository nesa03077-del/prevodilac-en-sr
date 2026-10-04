// Provera ekrana u pravom pregledaču (Chromium preko Playwright-a).
// Anthropic API je lažiran na mrežnom nivou, pa se ne troše krediti, a ceo put
// (stranica -> jezgro -> pravi SDK u pregledaču -> odgovor) je stvaran.
//
// Pokretanje:  npm run build && npm run e2e
// Snimci ekrana idu u folder e2e-shots/ (ili SHOTS_DIR).

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
const shotsDir = path.resolve(process.env.SHOTS_DIR || path.join(here, '../e2e-shots'));

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright'];
  for (const c of candidates.filter(Boolean)) {
    try {
      return require(c);
    } catch {
      /* sledeći */
    }
  }
  throw new Error('Playwright nije pronađen. Postavite PLAYWRIGHT_MODULE na putanju do modula.');
}

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('Nema dist/. Prvo pokrenite: npm run build');
  process.exit(2);
}

// ---------- mali statički server za dist/ ----------

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nema');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------- lažni Anthropic API ----------

const FAKE_KEY = 'sk-ant-api03-' + 'a1B2c3D4'.repeat(4);
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const apiCalls = [];

function sse(chunks) {
  const ev = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...chunks.map((text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  return ev.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

async function fakeApi(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const body = JSON.parse(req.postData() || '{}');
  const user = body.messages?.[0]?.content ?? '';
  const source = /<source>\n([\s\S]*)\n<\/source>/.exec(user)?.[1] ?? '';
  apiCalls.push({ body, source, headers: req.headers() });
  const err = (status, type) =>
    route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type, message: 'x' } }) });
  if (source.includes('trigger-auth')) return err(401, 'authentication_error');
  if (source.includes('trigger-limit')) return err(429, 'rate_limit_error');
  const toSerbian = body.system.includes('into Serbian');
  // Namerno pogrešan broj (48213 -> 48231) da bi se videlo upozorenje, i prevod nazad.
  if (source.includes('48213')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(['Tovar 48231 ', 'u 14:30']) });
  if (source.includes('Tovar 48231')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(['Load 48231 ', 'at 14:30']) });
  let chunks = toSerbian ? ['Zdravo ', 'svete'] : ['Hello ', 'world'];
  if (source.includes('Good day')) chunks = ['Добар ', 'дан'];
  return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(chunks) });
}


// ---------- lažni govor (pravi mikrofon se ne može automatski testirati) ----------

const FAKE_SPEECH = `
(() => {
  const recs = [];
  window.__recs = recs;
  class FakeRec {
    constructor() { recs.push(this); this.started = false; this.aborted = false; this.stopped = false; }
    start() { this.started = true; }
    stop() { this.stopped = true; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.aborted = true; }
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
  const active = () => recs.filter((r) => r.started && !r.aborted && !r.stopped);
  window.__active = () => active().length;
  window.__emit = (results, idx = 0) => {
    const r = active().at(-1);
    r.onresult({ resultIndex: idx, results: results.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });
  };
  window.__fail = (error) => { active().at(-1).onerror({ error }); };
  const spoken = [];
  window.__spoken = spoken;
  window.__speaking = false;
  const synth = {
    getVoices: () => [{ lang: 'en-US', name: 'E' }, { lang: 'sr-RS', name: 'S' }],
    speak(u) { spoken.push({ text: u.text, lang: u.lang }); window.__speaking = true; setTimeout(() => { window.__speaking = false; u.onend && u.onend(); }, 400); },
    cancel() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
})();
`;

// Lažni Document Picture-in-Picture: pravi običan mali prozor (popup).
const FAKE_PIP = `
window.documentPictureInPicture = {
  requestWindow: async ({ width, height }) => window.open('', 'mini', 'popup,width=' + width + ',height=' + height),
};
`;

// Lažni odgovor API-ja bez Playwright presretanja mreže (kad ono smeta, npr. kod skočnog prozora).
const FAKE_FETCH = `
(() => {
  const real = window.fetch.bind(window);
  const ev = (o) => 'event: ' + o.type + '\\ndata: ' + JSON.stringify(o) + '\\n\\n';
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('https://api.anthropic.com/')) return real(input, init);
    const body = [
      { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Zdravo svete' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ].map(ev).join('');
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  };
})();
`;

const NO_SPEECH = `
delete window.SpeechRecognition;
delete window.webkitSpeechRecognition;
`;

const seedSettings = (overrides = {}) => {
  const value = { apiKey: FAKE_KEY, model: 'claude-opus-5-5', mode: 'auto', view: 'type', speak: true, ...overrides };
  return `localStorage.setItem('prevodilac.podesavanja.v1', ${JSON.stringify(JSON.stringify(value))});`;
};

async function talkPage(opts = {}, { speech = FAKE_SPEECH, view = 'type', key = true } = {}) {
  const t = await newPage(opts);
  await t.context.addInitScript(speech);
  if (key) await t.context.addInitScript(seedSettings({ view }));
  await t.page.goto(origin);
  return t;
}


// ---------- lažni Azure govor, mikrofon i zvuk poziva (za režim "Uživo") ----------

const FAKE_AZURE_KEY = 'AzKey0123456789abcdefABCDEF0123456789xy';

const FAKE_LIVE = `
(() => {
  const log = { recognizers: [], synths: [], pushes: [] };
  window.__azure = log;
  window.__playingNonzero = 0;
  window.__nonzeroChunks = 0;
  window.__playing = false;
  window.__played = [];

  const ResultReason = { NoMatch: 0, RecognizedSpeech: 3, SynthesizingAudioCompleted: 9, Canceled: 1 };
  const CancellationReason = { Error: 1, EndOfStream: 2 };
  const CancellationErrorCode = { NoError: 0, AuthenticationFailure: 1, BadRequest: 2, TooManyRequests: 3, Forbidden: 4, ConnectionFailure: 5, ServiceTimeout: 6, ServiceError: 7, ServiceUnavailable: 8, RuntimeError: 9 };
  class SpeechConfig {
    constructor(key, region) { this.key = key; this.region = region; this.props = {}; }
    static fromSubscription(key, region) { return new SpeechConfig(key, region); }
    setProperty(id, value) { this.props[id] = value; }
    setProfanity() {}
  }
  const AudioInputStream = {
    createPushStream() {
      const push = {
        closed: false,
        write(b) {
          const nonzero = new Int16Array(b).some((x) => x !== 0);
          if (nonzero) { window.__nonzeroChunks++; if (window.__playing) window.__playingNonzero++; }
        },
        close() { this.closed = true; },
      };
      log.pushes.push(push);
      return push;
    },
  };
  class SpeechRecognizer {
    constructor(config, audio) { this.config = config; this.audio = audio; this.auto = null; this.started = false; this.stopped = false; log.recognizers.push(this); }
    static FromConfig(config, auto, audio) { const r = new SpeechRecognizer(config, audio); r.auto = auto; return r; }
    startContinuousRecognitionAsync(ok) { this.started = true; ok && ok(); }
    stopContinuousRecognitionAsync(ok) { this.stopped = true; ok && ok(); }
    close() {}
  }
  class SpeechSynthesizer {
    constructor(config) { this.config = config; this.texts = []; log.synths.push(this); }
    speakTextAsync(text, ok) {
      this.texts.push(text);
      ok({ reason: ResultReason.SynthesizingAudioCompleted, audioData: new TextEncoder().encode('mp3:' + text).buffer });
    }
    close() {}
  }
  window.__PREVODILAC_FAKE_AZURE__ = {
    SpeechConfig, AudioInputStream, SpeechRecognizer, SpeechSynthesizer,
    AudioConfig: { fromStreamInput: (push) => ({ push }) },
    AutoDetectSourceLanguageConfig: { fromLanguages: (languages) => ({ languages }) },
    AutoDetectSourceLanguageResult: { fromResult: (result) => ({ language: result.detectedLanguage }) },
    ResultReason, CancellationReason, CancellationErrorCode,
    PropertyId: { SpeechServiceConnection_LanguageIdMode: 37, SpeechServiceConnection_Endpoint: 1 },
    SpeechSynthesisOutputFormat: { Audio24Khz48KBitRateMonoMp3: 6 },
    ProfanityOption: { Raw: 2 },
  };
  // pomoć za proveru: govori recognizer (po jeziku, a u režimu jednog mikrofona prvi)
  const rec = (lang) => log.recognizers.filter((r) => !r.stopped && (!lang || r.config.speechRecognitionLanguage === lang)).at(-1);
  window.__say = (lang, text, final = true, detected) => {
    const r = rec(lang);
    const reason = final ? ResultReason.RecognizedSpeech : 2;
    const result = { text, detectedLanguage: detected, reason };
    final ? r.recognized(r, { result }) : r.recognizing(r, { result });
  };
  window.__azureError = (lang, code) => { const r = rec(lang); r.canceled(r, { reason: CancellationReason.Error, errorCode: CancellationErrorCode[code], errorDetails: code }); };

  // Lažni zvuk: dva tona (moj mikrofon i zvuk poziva), pravi MediaStream-ovi.
  const tracks = [];
  const tone = (hz) => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    const stream = dest.stream;
    tracks.push(...stream.getAudioTracks());
    return stream;
  };
  window.__tracksLive = () => tracks.filter((t) => t.readyState === 'live').length;
  window.__shareFail = null;
  window.__shareNoAudio = false;
  const md = navigator.mediaDevices;
  md.getUserMedia = async () => tone(220);
  md.getDisplayMedia = async () => {
    if (window.__shareFail) throw Object.assign(new Error('x'), { name: window.__shareFail });
    const stream = window.__shareNoAudio ? new MediaStream() : tone(440);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    canvas.getContext('2d').fillRect(0, 0, 8, 8);
    for (const t of canvas.captureStream().getVideoTracks()) stream.addTrack(t);
    return stream;
  };
  md.enumerateDevices = async () => [{ kind: 'audiooutput', deviceId: 'cable1', label: 'CABLE Input (VB-Audio)' }, { kind: 'audiooutput', deviceId: 'spk1', label: 'Zvučnici' }];

  // Lažno puštanje glasa: beleži izlazni uređaj i traje 400 ms.
  window.Audio = class {
    constructor(url) { this.url = url; this.entry = { url, sink: '' }; window.__played.push(this.entry); }
    async setSinkId(id) { this.entry.sink = id; }
    async play() { window.__playing = true; setTimeout(() => { window.__playing = false; this.onended && this.onended(); }, 400); }
  };
})();
`;

// ---------- mali okvir za provere ----------

let failed = 0;
let passed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  NE   ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
fs.mkdirSync(shotsDir, { recursive: true });

async function newPage({ noRoute = false, ...opts } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
    ...opts,
  });
  if (!noRoute) await context.route('https://api.anthropic.com/**', fakeApi);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Namerno izazvani odgovori 401 i 429 pregledač prijavljuje kao greške mreže.
    if (m.type() === 'error' && !/status of (401|429)/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return { context, page, problems };
}

const out = (page) => page.locator('#output').innerText();
const text = (page, sel) => page.locator(sel).textContent();
const waitOutput = (page, text) =>
  page.waitForFunction((t) => document.getElementById('output').textContent === t, text, { timeout: 5000 }).then(() => true, () => false);
const waitCalls = (n) => new Promise((resolve) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (apiCalls.length >= n || Date.now() - t0 > 5000) {
      clearInterval(iv);
      resolve(apiCalls.length >= n);
    }
  }, 20);
});

try {
  // ===== 1. Prvo pokretanje, unos ključa =====
  console.log('1. Prvo pokretanje i ključ');
  let { context, page, problems } = await newPage();
  await page.goto(origin);
  check('dijalog sa podešavanjima je otvoren bez ključa', await page.locator('#settings').evaluate((d) => d.open));
  check('obaveštenje traži ključ', (await page.locator('#notice-text').innerText()).includes('API ključ'));

  await page.fill('#api-key', 'nije-kljuc');
  await page.click('#settings-form button[type=submit]');
  check('pogrešan oblik ključa daje grešku', await page.locator('#key-error').isVisible());
  check('dijalog ostaje otvoren posle greške', await page.locator('#settings').evaluate((d) => d.open));

  await page.fill('#api-key', FAKE_KEY);
  await page.check('input[name=model][value=claude-sonnet-5-5]');
  await page.click('#settings-form button[type=submit]');
  check('dijalog se zatvara posle čuvanja', !(await page.locator('#settings').evaluate((d) => d.open)));
  check('obaveštenje nestaje', await page.locator('#notice').isHidden());

  // ===== 2. Engleski -> srpski uživo =====
  console.log('2. Prevod uživo');
  apiCalls.length = 0;
  await page.fill('#source', 'Hello, how are you?');
  check('prevod stiže u polje', await waitOutput(page, 'Zdravo svete'));
  check('poslat je tačan model', apiCalls.at(-1)?.body.model === 'claude-sonnet-5-5');
  check('poslat je effort low i fallbacks', apiCalls.at(-1)?.body.output_config?.effort === 'low' && apiCalls.at(-1)?.body.fallbacks === 'default');
  check('ključ ide u zaglavlje x-api-key', apiCalls.at(-1)?.headers['x-api-key'] === FAKE_KEY);
  check('smer je engleski -> srpski', apiCalls.at(-1)?.body.system.includes('from English into Serbian'));
  check('natpisi: Engleski / Srpski', (await text(page, '#source-lang')) === 'Engleski' && (await text(page, '#target-lang')) === 'Srpski');
  check('oznaka "automatski" je vidljiva', await page.locator('#auto-tag').isVisible());
  check('dugme Kopiraj je uključeno', await page.locator('#copy').isEnabled());
  check('traka napretka se gasi', await page.locator('#progress').isHidden());

  // ===== 3. Srpski -> engleski, automatski =====
  console.log('3. Automatsko prepoznavanje');
  apiCalls.length = 0;
  await page.fill('#source', 'Gde je železnička stanica?');
  check('stiže engleski prevod', await waitOutput(page, 'Hello world'));
  check('smer je srpski -> engleski', apiCalls.at(-1)?.body.system.includes('from Serbian into English'));
  check('natpisi: Srpski / Engleski', (await text(page, '#source-lang')) === 'Srpski' && (await text(page, '#target-lang')) === 'Engleski');

  // ===== 4. Kucanje slovo po slovo šalje jedan zahtev =====
  console.log('4. Debounce');
  await page.fill('#source', '');
  apiCalls.length = 0;
  await page.locator('#source').pressSequentially('Good morning everyone', { delay: 25 });
  await waitCalls(1);
  await page.waitForTimeout(700);
  check('jedan zahtev za ceo ukucani tekst', apiCalls.length === 1, `zahteva: ${apiCalls.length}`);
  check('zahtev sadrži ceo tekst', apiCalls[0]?.source === 'Good morning everyone');

  // ===== 5. Ćirilica u prevodu postaje latinica =====
  console.log('5. Latinica');
  await page.fill('#source', 'Good day');
  check('ćirilični odgovor se prikazuje latinicom', await waitOutput(page, 'Dobar dan'));

  // ===== 6. Kopiranje =====
  console.log('6. Kopiranje');
  await page.click('#copy');
  check('dugme javlja "Kopirano"', await page.waitForFunction(() => document.getElementById('copy').textContent === 'Kopirano', null, { timeout: 3000 }).then(() => true, () => false));
  check('u clipboard-u je prevod', (await page.evaluate(() => navigator.clipboard.readText())) === 'Dobar dan');

  // ===== 7. Zamena jezika =====
  console.log('7. Zamena jezika');
  await page.click('#swap');
  check('prevod postaje izvorni tekst', (await page.inputValue('#source')) === 'Dobar dan');
  check('režim je srpski -> engleski', await page.locator('#mode-sr-en').isChecked());
  check('natpisi su zamenjeni', (await text(page, '#source-lang')) === 'Srpski');
  check('stiže novi prevod', await waitOutput(page, 'Hello world'));

  // ===== 8. Ručni režim i trajnost =====
  console.log('8. Ručni režim i trajnost');
  await page.click('label[for=mode-en-sr]');
  check('ručni režim sklanja oznaku "automatski"', await page.locator('#auto-tag').isHidden());
  await page.reload();
  check('posle ponovnog učitavanja nema dijaloga (ključ je sačuvan)', !(await page.locator('#settings').evaluate((d) => d.open)));
  check('režim je zapamćen', await page.locator('#mode-en-sr').isChecked());
  await page.click('#settings-btn');
  check('model je zapamćen', await page.locator('input[name=model][value=claude-sonnet-5-5]').isChecked());
  check('ključ se prikazuje maskiran', ((await page.locator('#api-key').getAttribute('placeholder')) || '').includes('sk-ant-…'));
  check('pun ključ se ne vidi nigde na stranici', !(await page.content()).includes(FAKE_KEY));
  await page.click('#settings-cancel');

  // ===== 9. Brisanje =====
  console.log('9. Brisanje teksta');
  await page.fill('#source', 'Something to clear');
  await waitOutput(page, 'Zdravo svete');
  await page.click('#clear');
  check('polje je prazno', (await page.inputValue('#source')) === '');
  check('prevod je prazan', (await out(page)).trim() === '' || (await page.locator('#output').getAttribute('data-empty')) === 'true');
  check('Kopiraj i Obriši su isključeni', (await page.locator('#copy').isDisabled()) && (await page.locator('#clear').isDisabled()));

  // ===== 10. Greške =====
  console.log('10. Greške');
  await page.fill('#source', 'trigger-auth');
  await page.waitForSelector('#notice:not([hidden])');
  check('401 daje poruku o ključu', (await page.locator('#notice-text').innerText()).includes('API ključ nije ispravan'));
  check('401 nudi dugme Podešavanja', await page.locator('#notice-action').isVisible());
  await page.fill('#source', 'trigger-limit');
  await page.waitForFunction(() => document.getElementById('notice-text').textContent.includes('Previše'), null, { timeout: 5000 }).catch(() => {});
  check('429 daje poruku o previše zahteva', (await page.locator('#notice-text').innerText()).includes('Previše zahteva'));
  await page.fill('#source', 'Hello again');
  check('uspešan prevod sklanja grešku', await waitOutput(page, 'Zdravo svete') && (await page.locator('#notice').isHidden()));

  // ===== 11. Brisanje ključa =====
  console.log('11. Brisanje ključa');
  await page.click('#settings-btn');
  await page.click('#forget');
  check('prvi klik traži potvrdu', (await page.locator('#forget').innerText()) === 'Potvrdite brisanje');
  await page.click('#forget');
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('prevodilac')));
  check('podaci su obrisani iz pregledača', stored.length === 0, JSON.stringify(stored));
  check('prikazano je obaveštenje o brisanju', (await page.locator('#notice-text').innerText()).includes('obrisani'));
  apiCalls.length = 0;
  await page.fill('#source', 'No key now');
  await page.waitForTimeout(600);
  check('bez ključa se ništa ne šalje', apiCalls.length === 0);
  check('bez ključa se traži ključ', (await page.locator('#notice-text').innerText()).includes('API ključ'));

  check('nema grešaka u konzoli (uključujući CSP)', problems.length === 0, problems.join(' | '));
  await context.close();


  // ===== 13. Razgovor govorom =====
  console.log('13. Razgovor govorom');
  {
    apiCalls.length = 0;
    const t = await talkPage();
    const p = t.page;
    await p.click('label[for=view-talk]');
    check('razgovor je prikazan, kucanje sakriveno', (await p.locator('#talking').isVisible()) && (await p.locator('#typing').isHidden()));
    check('izbor pogleda je zapamćen', (await p.evaluate(() => JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1')).view)) === 'talk');
    check('početni status', (await text(p, '#talk-status')) === 'Pritisnite dugme i govorite.');

    await p.click('.talk-btn[data-lang=en]');
    check('slušanje počinje na engleskom (en-US)', await p.evaluate(() => window.__recs.at(-1).lang === 'en-US' && window.__recs.at(-1).started));
    check('dugme je pritisnuto', (await p.locator('.talk-btn[data-lang=en]').getAttribute('aria-pressed')) === 'true');
    check('status: govorite engleski', (await text(p, '#talk-status')) === 'Slušam: govorite engleski.');

    await p.evaluate(() => window.__emit([['where is the nearest', false]]));
    check('delimičan tekst se odmah vidi', await p.waitForFunction(() => document.querySelector('.turn.live .src')?.textContent === 'where is the nearest', null, { timeout: 3000 }).then(() => true, () => false));
    check('delimičan tekst se prevodi uživo', await p.waitForFunction(() => document.querySelector('.turn.live .tr')?.textContent === 'Zdravo svete', null, { timeout: 4000 }).then(() => true, () => false));

    await p.evaluate(() => window.__emit([['where is the nearest pharmacy', true]]));
    check('konačna rečenica postaje stavka razgovora', await p.waitForFunction(() => document.querySelector('.turn.from-en:not(.live) .tr')?.textContent === 'Zdravo svete', null, { timeout: 4000 }).then(() => true, () => false));
    check('delimični prikaz nestaje', (await p.locator('.turn.live').count()) === 0);
    check('prevod se izgovara srpskim glasom', await p.waitForFunction(() => window.__spoken.length === 1 && window.__spoken[0].lang === 'sr-RS' && window.__spoken[0].text === 'Zdravo svete', null, { timeout: 4000 }).then(() => true, () => false));
    check('dok se izgovara, mikrofon je pauziran', await p.waitForFunction(() => window.__speaking && window.__active() === 0, null, { timeout: 3000 }).then(() => true, () => false));
    check('dok se izgovara, status to kaže', (await text(p, '#talk-status')) === 'Izgovaram prevod…');
    check('posle izgovora mikrofon se vraća', await p.waitForFunction(() => !window.__speaking && window.__active() === 1, null, { timeout: 4000 }).then(() => true, () => false));

    // srpski govornik, ćirilica
    await p.click('.talk-btn[data-lang=sr]');
    check('dugme za srpski prekida engleski i sluša srpski (sr-RS)', await p.evaluate(() => window.__recs.at(-1).lang === 'sr-RS' && window.__active() === 1));
    check('engleski dugme više nije pritisnuto', (await p.locator('.talk-btn[data-lang=en]').getAttribute('aria-pressed')) === 'false');
    apiCalls.length = 0;
    await p.evaluate(() => window.__emit([['Где је апотека?', true]]));
    check('ćirilični govor se prikazuje latinicom', await p.waitForFunction(() => [...document.querySelectorAll('.turn.from-sr .src')].some((e) => e.textContent === 'Gde je apoteka?'), null, { timeout: 4000 }).then(() => true, () => false));
    await waitCalls(1);
    const second = apiCalls.find((c) => c.source === 'Gde je apoteka?');
    check('smer je srpski -> engleski', Boolean(second?.body.system.includes('from Serbian into English')));
    check('prethodna rečenica ide kao kontekst', Boolean(second?.body.messages[0].content.includes('<context>\nwhere is the nearest pharmacy\n</context>')));
    check('prevod se izgovara engleskim glasom', await p.waitForFunction(() => window.__spoken.length === 2 && window.__spoken[1].lang === 'en-US' && window.__spoken[1].text === 'Hello world', null, { timeout: 4000 }).then(() => true, () => false));
    await p.waitForFunction(() => !window.__speaking, null, { timeout: 4000 });

    // isključen izgovor
    await p.uncheck('#speak-toggle');
    check('prekidač izgovora je zapamćen', (await p.evaluate(() => JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1')).speak)) === false);
    await p.evaluate(() => window.__emit([['Hvala', true]]));
    await p.waitForFunction(() => [...document.querySelectorAll('.turn .src')].some((e) => e.textContent === 'Hvala'), null, { timeout: 4000 });
    await p.waitForTimeout(700);
    check('sa isključenim izgovorom ništa se ne izgovara', (await p.evaluate(() => window.__spoken.length)) === 2);
    check('sa isključenim izgovorom mikrofon ostaje uključen', (await p.evaluate(() => window.__active())) === 1);

    // greška mikrofona
    await p.evaluate(() => window.__fail('not-allowed'));
    check('odbijen mikrofon daje poruku', (await text(p, '#talk-alert')).includes('Mikrofon nije dozvoljen'));
    check('slušanje je zaustavljeno', (await p.locator('.talk-btn.on').count()) === 0);

    // brisanje razgovora
    check('Obriši razgovor je uključeno', await p.locator('#talk-clear').isEnabled());
    await p.click('#talk-clear');
    check('razgovor je prazan', (await p.locator('.turn').count()) === 0 && (await p.locator('#talk-clear').isDisabled()));

    // napuštanje pogleda gasi mikrofon
    await p.click('.talk-btn[data-lang=en]');
    check('slušanje ponovo radi posle greške', (await p.evaluate(() => window.__active())) === 1);
    await p.click('label[for=view-type]');
    check('prelazak na kucanje gasi mikrofon', (await p.evaluate(() => window.__active())) === 0);
    check('nema grešaka u konzoli (razgovor)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();
  }

  console.log('14. Razgovor: pregledač bez govora, bez ključa');
  {
    const t = await talkPage({}, { speech: NO_SPEECH, view: 'talk' });
    const p = t.page;
    check('poruka da pregledač ne podržava govor', (await text(p, '#talk-unsupported')).includes('ne podržava prepoznavanje govora'));
    check('dugmad za govor su isključena', (await p.locator('.talk-btn[data-lang=en]').isDisabled()) && (await p.locator('.talk-btn[data-lang=sr]').isDisabled()));
    await p.click('label[for=view-type]');
    await p.fill('#source', 'Hello there');
    check('kucanje radi i bez govora', await waitOutput(p, 'Zdravo svete'));
    check('nema grešaka u konzoli (bez govora)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();

    const k = await talkPage({}, { key: false });
    await k.page.click('#settings-cancel'); // bez ključa se dijalog sam otvara
    await k.page.click('label[for=view-talk]');
    await k.page.click('.talk-btn[data-lang=en]');
    check('bez ključa dugme otvara podešavanja', await k.page.locator('#settings').evaluate((d) => d.open));
    check('bez ključa mikrofon se ne pokreće', (await k.page.evaluate(() => window.__active())) === 0);
    await k.context.close();
  }

  // ===== 15. Dispečerski režim =====
  console.log('15. Dispečerski režim');
  {
    apiCalls.length = 0;
    const t = await talkPage({}, { view: 'talk' });
    const p = t.page;
    const active = () => p.evaluate(() => window.__active());
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 }).then(() => true, () => false);

    // prečice
    await p.keyboard.press('1');
    check('prečica 1: sluša engleski', (await active()) === 1 && (await p.evaluate(() => window.__recs.at(-1).lang)) === 'en-US');
    await p.keyboard.press('2');
    check('prečica 2: prelazi na srpski', (await p.evaluate(() => window.__recs.at(-1).lang)) === 'sr-RS' && (await p.locator('.talk-btn[data-lang=en]').getAttribute('aria-pressed')) === 'false');
    await p.keyboard.press('Escape');
    check('Esc zaustavlja slušanje', (await active()) === 0);

    // brze fraze: izgovaraju se odmah, bez zahteva ka API-ju
    await p.click('.phrase[data-phrase=where]');
    check('fraza ulazi u razgovor kao gotova', await until(() => document.querySelector('.turn.fixed .tr')?.textContent === 'Gde si sada?'));
    check('fraza se izgovara srpskim glasom', await until(() => window.__spoken.some((x) => x.text === 'Gde si sada?' && x.lang === 'sr-RS')));
    check('fraza ne šalje zahtev ka API-ju', apiCalls.length === 0);
    check('gotova fraza nema dugme Proveri', (await p.locator('.turn.fixed .verify').count()) === 0);
    await until(() => !window.__speaking);

    // pogrešan broj u prevodu: upozorenje i istaknuti brojevi
    await p.keyboard.press('1');
    await p.evaluate(() => window.__emit([['Pick up load 48213 at 14:30', true]]));
    check('upozorenje kad se broj razlikuje', await until(() => /48213/.test(document.querySelector('.turn:not(.fixed) .warn')?.textContent ?? '') && /48231/.test(document.querySelector('.turn:not(.fixed) .warn')?.textContent ?? '')));
    check('brojevi su istaknuti', (await p.locator('.turn:not(.fixed) mark.num').count()) >= 4);
    check('prompt sadrži kamionski rečnik', Boolean(apiCalls.at(-1)?.body.system.includes('US trucking and freight dispatch')));
    await until(() => !window.__speaking && window.__active() === 1);

    // provera prevodom nazad
    await p.click('.turn:not(.fixed) .verify');
    check('prevod nazad se prikazuje', await until(() => document.querySelector('.turn .check .back')?.textContent === 'Load 48231 at 14:30'));
    check('prevod nazad takođe upozorava na broj', (await p.locator('.turn .check .warn').count()) === 1);
    const backCall = apiCalls.at(-1);
    check('prevod nazad ide u suprotnom smeru', Boolean(backCall?.body.system.includes('from Serbian into English')));
    await until(() => !window.__speaking && window.__active() === 1);

    // prevod koji je već stigao uživo koristi se bez novog zahteva
    await p.evaluate(() => window.__emit([['Send me the BOL', false]]));
    check('delimičan prevod stiže', await until(() => document.querySelector('.turn.live .tr')?.textContent === 'Zdravo svete'));
    const before = apiCalls.length;
    await p.evaluate(() => window.__emit([['Send me the BOL.', true]]));
    check('konačna rečenica odmah ima prevod', await until(() => [...document.querySelectorAll('.turn:not(.fixed):not(.live) .src')].some((e) => e.textContent === 'Send me the BOL.')));
    await p.waitForTimeout(400);
    check('nema novog zahteva za isti tekst', apiCalls.length === before, `pre: ${before}, posle: ${apiCalls.length}`);
    await until(() => !window.__speaking);

    // oblast u podešavanjima
    await p.click('#settings-btn');
    check('podrazumevana oblast je kamionski transport', await p.locator('input[name=domain][value=trucking]').isChecked());
    await p.check('input[name=domain][value=general]');
    await p.click('#settings-form button[type=submit]');
    check('oblast je zapamćena', (await p.evaluate(() => JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1')).domain)) === 'general');
    apiCalls.length = 0;
    await until(() => window.__active() === 1);
    await p.evaluate(() => window.__emit([['Please repeat that', true]]));
    await waitCalls(1);
    check('opšta oblast nema kamionski rečnik', apiCalls.length > 0 && !apiCalls[0].body.system.includes('trucking'));
    check('nema grešaka u konzoli (dispečer)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();
  }

  console.log('16. Mali prozor');
  {
    // Presretanje mreže u Playwright-u sprečava učitavanje stilova u skočnom prozoru (osobina
    // alata, ne aplikacije), pa ovde API lažiramo unutar stranice, bez presretanja.
    const t = await newPage({ noRoute: true });
    await t.context.addInitScript(FAKE_SPEECH);
    await t.context.addInitScript(FAKE_PIP);
    await t.context.addInitScript(FAKE_FETCH);
    await t.context.addInitScript(seedSettings({ view: 'talk' }));
    await t.page.goto(origin);
    const p = t.page;
    check('dugme Mali prozor je dostupno', await p.locator('#mini-btn').isVisible());
    const popupPromise = t.context.waitForEvent('page');
    await p.click('#mini-btn');
    const mini = await popupPromise;
    await mini.waitForSelector('#talking', { timeout: 5000 });
    check('razgovor je prebačen u mali prozor', await mini.locator('#talking').isVisible());
    check('u glavnom prozoru ostaje oznaka sa dugmetom Vrati', await p.locator('.mini-placeholder').isVisible());
    await mini.waitForTimeout(800);
    const miniStyle = await mini.evaluate(() => {
      const b = document.querySelector('.talk-btn');
      return { radius: getComputedStyle(b).borderRadius, sheets: document.styleSheets.length };
    });
    check('mali prozor ima stilove (dugmad su veliki blokovi)', miniStyle.radius === '14px' && miniStyle.sheets >= 1, JSON.stringify(miniStyle));
    check('mali prozor ima klasu mini', await mini.evaluate(() => document.documentElement.classList.contains('mini')));

    await mini.keyboard.press('1');
    check('prečica radi i u malom prozoru', (await p.evaluate(() => window.__active())) === 1);
    await p.evaluate(() => window.__emit([['Where is the receiver', true]]));
    check('prevod se vidi u malom prozoru', await mini.waitForFunction(() => document.querySelector('.turn .tr')?.textContent === 'Zdravo svete', null, { timeout: 5000, polling: 100 }).then(() => true, () => false));
    await mini.screenshot({ path: path.join(shotsDir, 'mali-prozor.png') });

    // izbor drugog pogleda u glavnom prozoru ne gasi mikrofon dok je mali prozor otvoren
    await p.waitForFunction(() => !window.__speaking && window.__active() === 1, null, { timeout: 5000 });
    await p.click('label[for=view-type]');
    check('mikrofon ostaje dok je mali prozor otvoren', (await p.evaluate(() => window.__active())) >= 1);
    check('mali prozor je i dalje prikazan', await mini.locator('#talking').isVisible());

    // zatvaranje malog prozora vraća razgovor
    await mini.close();
    await p.waitForFunction(() => document.getElementById('talking').ownerDocument === document && !document.querySelector('.mini-placeholder'), null, { timeout: 5000 });
    check('zatvaranje malog prozora vraća razgovor u glavni prozor', await p.evaluate(() => document.getElementById('talking').ownerDocument === document));
    check('nema grešaka u konzoli (mali prozor)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();
  }

  console.log('17. Instalacija i rad bez interneta (PWA)');
  {
    const t = await newPage();
    const p = t.page;
    await p.goto(origin);
    await p.waitForFunction(() => navigator.serviceWorker.ready.then((r) => Boolean(r.active)), null, { timeout: 10000 });
    check('servisni radnik je aktivan', true);
    const cacheNames = await p.evaluate(() => caches.keys());
    check('fajlovi su sačuvani za rad bez mreže', cacheNames.some((n) => n.startsWith('prevodilac-')), JSON.stringify(cacheNames));

    // Stranica ima strogu sigurnosnu politiku (fetch samo ka Anthropic-u), pa fajlove čitamo spolja.
    const manifestHref = await p.evaluate(() => document.querySelector('link[rel=manifest]').href);
    const m = await (await t.context.request.get(manifestHref)).json();
    const iconStatus = await Promise.all(m.icons.map(async (i) => (await t.context.request.get(new URL(i.src, manifestHref).href)).status()));
    const manifest = { name: m.name, display: m.display, icons: iconStatus, purposes: m.icons.map((i) => i.purpose) };
    check('manifest ima ime i standalone prikaz', manifest.name.includes('Prevodilac') && manifest.display === 'standalone');
    check('sve ikone iz manifesta se učitavaju', manifest.icons.every((s) => s === 200), JSON.stringify(manifest.icons));
    check('postoji i maskable ikona', manifest.purposes.includes('maskable'));
    check('nema grešaka u konzoli (PWA)', t.problems.length === 0, t.problems.join(' | '));

    await t.context.setOffline(true);
    await p.reload();
    check('bez interneta stranica se ipak otvara', (await p.title()) === 'Prevodilac' && (await p.locator('#source').isVisible()));
    check('bez interneta se vidi oznaka', await p.locator('#net').isVisible());
    await t.context.setOffline(false);
    await p.waitForFunction(() => document.getElementById('net').hidden, null, { timeout: 5000 }).catch(() => {});
    check('kad se mreža vrati oznaka nestaje', await p.locator('#net').isHidden());
    await t.context.close();
  }

  console.log('18. Provera uređaja, merenje brzine, prijave grešaka');
  {
    const FAKE_MIC = `
      Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => [{ kind: 'audioinput', label: '' }] }, configurable: true });
    `;
    apiCalls.length = 0;
    const t = await talkPage({}, { view: 'talk' });
    await t.context.addInitScript(FAKE_MIC);
    await t.context.grantPermissions(['microphone', 'clipboard-read', 'clipboard-write']);
    await t.page.reload();
    const p = t.page;
    const until = (fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);

    // provera uređaja
    await p.click('#settings-btn');
    check('stavke za proveru, brzinu i prijave su u podešavanjima', (await p.locator('#device-check-btn').isVisible()) && (await p.locator('#metrics-text').isVisible()) && (await p.locator('#reports-text').isVisible()));
    await p.click('#device-check-btn');
    check('provera uređaja daje listu', await until(() => document.querySelectorAll('#device-results .check-row').length >= 10));
    const rows = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#device-results .check-row')].map((r) => [r.querySelector('strong').textContent, r.className.replace('check-row ', '')])));
    check('nijedna stavka nije problem', !Object.values(rows).includes('fail'), JSON.stringify(rows));
    check('srpski glas je pronađen', rows['Srpski glas'] === 'ok', JSON.stringify(rows));
    check('probni prevod radi', rows['Probni prevod'] === 'ok', JSON.stringify(rows));
    check('rezime je napisan', /Sve (radi|bitno radi)/.test(await text(p, '#device-summary')));
    check('dugme nudi ponovnu proveru', (await text(p, '#device-check-btn')) === 'Proveri ponovo');
    await p.locator('#device-check-btn').scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(shotsDir, 'provera-uredjaja.png') });
    await p.click('#settings-cancel');

    // brzina: prazno pa prvi prevod
    await p.click('#settings-btn');
    check('pre prvog razgovora nema merenja', (await text(p, '#metrics-text')).includes('Još nema'));
    check('merenja se ne mogu brisati kad ih nema', await p.locator('#metrics-clear').isDisabled());
    await p.click('#settings-cancel');

    // razgovor: prevod, merenje, prijava
    await p.keyboard.press('1');
    await p.evaluate(() => window.__emit([['Where are you right now', true]]));
    check('prevod stiže', await until(() => document.querySelector('.turn:not(.fixed) .tr')?.textContent === 'Zdravo svete'));
    await until(() => !window.__speaking && window.__active() === 1);
    await p.click('#settings-btn');
    const metricsText = await text(p, '#metrics-text');
    check('brzina prevoda je izmerena', /\d+ prevoda/.test(metricsText) && metricsText.includes('medijana'), metricsText);
    await p.click('#settings-cancel');

    // prijava greške
    await p.click('.turn:not(.fixed) .report');
    check('dijalog za prijavu pokazuje izvorni tekst i prevod', (await p.locator('#report-dialog').evaluate((d) => d.open)) && (await text(p, '#report-source')) === 'Where are you right now' && (await text(p, '#report-translation')) === 'Zdravo svete');
    check('ponuđene su vrste greške', (await p.locator('#report-kinds input').count()) === 5);
    await p.check('#report-kinds input[value=number]');
    await p.screenshot({ path: path.join(shotsDir, 'prijava-greske.png') });
    await p.fill('#report-correction', 'Gde si trenutno?');
    await p.fill('#report-note', 'dispečer je tražio kraće');
    await p.click('#report-form button[type=submit]');
    check('potvrda o prijavi', (await text(p, '#toast')).includes('Prijava je sačuvana (ukupno 1)'));
    check('dijalog se zatvara', !(await p.locator('#report-dialog').evaluate((d) => d.open)));

    // prijava gotove fraze takođe radi
    await p.click('.phrase[data-phrase=where]');
    await until(() => document.querySelector('.turn.fixed .report'));
    check('i gotova fraza može da se prijavi', (await p.locator('.turn.fixed .report').count()) === 1);

    // izvoz
    await p.click('#settings-btn');
    check('podešavanja pokazuju broj prijava', (await text(p, '#reports-text')).includes('Sačuvano prijava: 1'));
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#reports-export')]);
    const fs2 = await import('node:fs');
    const exported = JSON.parse(fs2.readFileSync(await download.path(), 'utf8'));
    check('izvoz ima ime sa datumom', /^prevodilac-prijave-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
    check('izvezena prijava ima sve podatke', exported.reports.length === 1 && exported.reports[0].kind === 'number' && exported.reports[0].correction === 'Gde si trenutno?' && exported.reports[0].source === 'Where are you right now' && exported.reports[0].domain === 'trucking' && exported.reports[0].note === 'dispečer je tražio kraće');
    await p.click('#reports-clear');
    check('brisanje prijava', (await text(p, '#reports-text')).includes('Još nema prijava') && (await p.locator('#reports-export').isDisabled()));
    await p.click('#metrics-clear');
    check('brisanje merenja', (await text(p, '#metrics-text')).includes('Još nema'));
    check('nema grešaka u konzoli (prvi dani)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();

    // loš uređaj: nema govora ni ključa
    const bad = await talkPage({}, { speech: NO_SPEECH, key: false });
    await bad.page.click('#device-check-btn');
    await bad.page.waitForFunction(() => document.querySelectorAll('#device-results .check-row').length >= 10, null, { timeout: 8000 });
    const badRows = await bad.page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#device-results .check-row')].map((r) => [r.querySelector('strong').textContent, r.className.replace('check-row ', '')])));
    check('bez govora i ključa provera prijavljuje probleme', badRows['Prepoznavanje govora'] === 'fail' && badRows['Probni prevod'] === 'fail', JSON.stringify(badRows));
    check('rezime kaže koliko je problema', /problem/.test(await text(bad.page, '#device-summary')));
    await bad.context.close();
  }

  // ===== 12. Snimci ekrana =====
  console.log('12. Snimci ekrana');
  const sizes = [
    ['telefon', { width: 390, height: 844 }],
    ['racunar', { width: 1280, height: 800 }],
  ];
  for (const scheme of ['light', 'dark']) {
    for (const [name, viewport] of sizes) {
      const s = await newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
      await s.page.addInitScript((key) => {
        localStorage.setItem('prevodilac.podesavanja.v1', JSON.stringify({ apiKey: key, model: 'claude-opus-5-5', mode: 'auto' }));
      }, FAKE_KEY);
      await s.page.goto(origin);
      await s.page.fill('#source', 'Where is the nearest pharmacy? My daughter has a fever.');
      await s.page.route('https://api.anthropic.com/**', fakeApi); // već aktivno; za svaki slučaj
      await waitOutput(s.page, 'Zdravo svete');
      const noOverflow = await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      check(`${name}/${scheme}: nema vodoravnog pomeranja`, noOverflow);
      await s.page.screenshot({ path: path.join(shotsDir, `${name}-${scheme}.png`), fullPage: true });
      if (name === 'telefon') {
        await s.page.click('#settings-btn');
        await s.page.screenshot({ path: path.join(shotsDir, `${name}-${scheme}-podesavanja.png`) });
      }
      check(`${name}/${scheme}: nema grešaka u konzoli`, s.problems.length === 0, s.problems.join(' | '));
      await s.context.close();
    }
  }

  // snimci razgovora
  for (const scheme of ['light', 'dark']) {
    for (const [name, viewport] of sizes) {
      const t = await talkPage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 }, { view: 'talk' });
      const p = t.page;
      await p.click('.talk-btn[data-lang=en]');
      await p.evaluate(() => window.__emit([['Where is the nearest pharmacy? My daughter has a fever.', true]]));
      await p.waitForFunction(() => window.__speaking === false && window.__spoken.length === 1, null, { timeout: 4000 });
      await p.waitForFunction(() => !window.__speaking, null, { timeout: 4000 });
      await p.click('.talk-btn[data-lang=sr]');
      await p.evaluate(() => window.__emit([['Gde je apoteka?', true]]));
      await p.waitForFunction(() => window.__spoken.length === 2, null, { timeout: 4000 });
      await p.waitForFunction(() => !window.__speaking, null, { timeout: 4000 });
      await p.evaluate(() => window.__emit([['Pick up load 48213 at 14:30', true]]));
      await p.waitForFunction(() => document.querySelector('.turn .warn'), null, { timeout: 4000 });
      await p.waitForFunction(() => !window.__speaking && window.__active() === 1, null, { timeout: 4000 });
      await p.evaluate(() => window.__emit([['hvala puno', false]]));
      await p.waitForFunction(() => document.querySelector('.turn.live .tr')?.textContent === 'Hello world', null, { timeout: 4000 });
      const noOverflow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      check(`razgovor ${name}/${scheme}: nema vodoravnog pomeranja`, noOverflow);
      await p.screenshot({ path: path.join(shotsDir, `razgovor-${name}-${scheme}.png`), fullPage: true });
      check(`razgovor ${name}/${scheme}: nema grešaka u konzoli`, t.problems.length === 0, t.problems.join(' | '));
      await t.context.close();
    }
  }

  // ===== 19. Uživo (probna verzija): dva toka, jedan mikrofon, greške =====
  console.log('19. Uživo (probna verzija)');
  {
    const liveSettings = (extra = {}) =>
      seedSettings({ view: 'live', azureKey: FAKE_AZURE_KEY, azureRegion: 'westeurope', liveMyLang: 'sr', liveMode: 'two-streams', ...extra });
    const livePage = async (opts = {}, extra = {}) => {
      const t = await newPage(opts);
      await t.context.addInitScript(FAKE_LIVE);
      await t.context.addInitScript(FAKE_SPEECH);
      await t.context.addInitScript(liveSettings(extra));
      await t.page.goto(origin);
      return t;
    };
    const t = await livePage();
    const p = t.page;
    const until = (fn, arg, timeout = 5000) => p.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

    check('pogled Uživo je prikazan', (await p.locator('#live').isVisible()) && (await p.locator('#typing').isHidden()) && (await p.locator('#talking').isHidden()));
    check('izbor pogleda ima tri stavke', (await p.locator('#view-group input').count()) === 3);
    check('početni status', (await text(p, '#live-status')) === 'Pritisnite "Pokreni" da počne prevođenje.');
    check('izlazni uređaj se nudi', (await p.locator('#live-output option').count()) === 3);
    await p.selectOption('#live-output', 'cable1');
    check('izlaz za glas je zapamćen', (await p.evaluate(() => JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1')).outputDeviceId)) === 'cable1');

    // pokretanje: dva toka, svaki svoj jezik
    await p.click('#live-start');
    check('pokretanje: dva prepoznavača, srpski za mene i engleski za sagovornika', await until(() => {
      const r = window.__azure.recognizers;
      return r.length === 2 && r.every((x) => x.started) && r[0].config.speechRecognitionLanguage === 'sr-RS' && r[1].config.speechRecognitionLanguage === 'en-US';
    }));
    check('azure ključ i region idu u servis', await p.evaluate(([k]) => window.__azure.recognizers.every((r) => r.config.key === k && r.config.region === 'westeurope'), [FAKE_AZURE_KEY]));
    check('dugme postaje Zaustavi', await until(() => document.getElementById('live-start').textContent === 'Zaustavi'));
    check('status: slušam', await until(() => document.getElementById('live-status').textContent.startsWith('Slušam')));
    check('pravi zvuk stiže do servisa', await until(() => window.__nonzeroChunks > 2));
    check('merač nivoa se pomera', await until(() => Number(document.getElementById('meter-me').style.getPropertyValue('--level')) > 0));
    check('podešavanja su zaključana dok radi', await p.locator('#live-mode-one').isDisabled());

    // sagovornik govori engleski: prevod uživo, pa stavka
    await p.evaluate(() => window.__say('en-US', 'pick up the load', false));
    check('delimičan tekst sagovornika se vidi', await until(() => document.querySelector('.turn.live.who-other .src')?.textContent === 'pick up the load'));
    check('delimičan tekst se prevodi uživo', await until(() => document.querySelector('.turn.live.who-other .tr')?.textContent === 'Zdravo svete', null, 6000));
    const callsBefore = apiCalls.length;
    await p.evaluate(() => window.__say('en-US', 'pick up the load', true));
    check('konačna izjava sagovornika je stavka', await until(() => document.querySelector('.turn.who-other:not(.live) .tr')?.textContent === 'Zdravo svete'));
    check('uživo prevod je preuzet bez novog zahteva', apiCalls.length === callsBefore, `zahteva: ${apiCalls.length - callsBefore}`);
    check('sagovornik: bez izgovora (podrazumevano isključen)', (await p.evaluate(() => window.__played.length)) === 0);

    // ja govorim srpski: prevod na engleski se izgovara engleskim glasom na izabrani izlaz
    await p.evaluate(() => window.__say('sr-RS', 'Gde je moj tovar', true));
    check('moja izjava je stavka sa engleskim prevodom', await until(() => document.querySelector('.turn.who-me:not(.live) .tr')?.textContent === 'Hello world'));
    check('engleski prevod se izgovara engleskim neuralnim glasom', await until(() => window.__azure.synths.some((s) => s.texts.includes('Hello world') && s.config.speechSynthesisVoiceName === 'en-US-GuyNeural')));
    check('glas ide na izabrani izlaz (virtuelni kabl)', await until(() => window.__played.length === 1 && window.__played[0].sink === 'cable1'));
    check('dok se izgovara, status to kaže', await until(() => document.getElementById('live-status').textContent === 'Izgovaram prevod…'));
    await until(() => window.__playing === true);
    await until(() => window.__playing === false);
    await p.waitForTimeout(700);
    check('dok se izgovara, u servis ne ide zvuk (nema slušanja samog sebe)', (await p.evaluate(() => window.__playingNonzero)) === 0);
    check('posle izgovora zvuk ponovo ide u servis', await (async () => {
      const before = await p.evaluate(() => window.__nonzeroChunks);
      return until((b) => window.__nonzeroChunks > b + 1, before);
    })());

    // pogrešan broj u prevodu
    await p.evaluate(() => window.__say('en-US', 'Pick up load 48213 at 14:30', true));
    check('upozorenje kad se broj razlikuje', await until(() => /48213/.test(document.querySelector('.turn .warn')?.textContent ?? '')));
    check('brojevi su istaknuti', (await p.locator('.turn mark.num').count()) >= 4);

    check('nema grešaka u prevodu', (await p.locator('.turn .err').count()) === 0);

    // snimak razgovora u toku (prikazuje se i delimičan tekst)
    await p.evaluate(() => window.__say('sr-RS', 'Stižem za dvadeset minuta', false));
    await until(() => document.querySelector('.turn.live.who-me .tr')?.textContent === 'Hello world', null, 6000);
    await p.screenshot({ path: path.join(shotsDir, 'uzivo-radi-1280-light.png'), fullPage: true });
    check('stavke prate redosled', (await p.locator('#live-log .turn').count()) >= 4);

    // greška servisa: pogrešan ključ zaustavlja prevođenje i objašnjava
    await p.evaluate(() => window.__azureError('en-US', 'AuthenticationFailure'));
    check('pogrešan Azure ključ daje poruku', await until(() => (document.getElementById('live-alert').textContent || '').includes('Azure ključ ili region')));
    check('posle greške je zaustavljeno', await until(() => document.getElementById('live-start').textContent === 'Pokreni'));
    check('posle greške je mikrofon ugašen', await until(() => window.__tracksLive() === 0));

    // brisanje
    await p.click('#live-clear');
    check('Obriši prazni razgovor', (await p.locator('#live-log .turn').count()) === 0);

    // zaustavljanje dugmetom
    await p.click('#live-start');
    check('ponovno pokretanje posle greške', await until(() => document.getElementById('live-start').textContent === 'Zaustavi'));
    await p.click('#live-start');
    check('Zaustavi gasi mikrofon i zvuk poziva', await until(() => document.getElementById('live-start').textContent === 'Pokreni' && window.__tracksLive() === 0));
    check('zaustavljanje zatvara tokove ka servisu', await p.evaluate(() => window.__azure.pushes.slice(-2).every((x) => x.closed)));

    // prelazak na drugi pogled gasi sve
    await p.click('#live-start');
    await until(() => document.getElementById('live-start').textContent === 'Zaustavi');
    await p.click('label[for=view-type]');
    check('napuštanje pogleda gasi prevođenje uživo', await until(() => window.__tracksLive() === 0));
    await p.click('label[for=view-live]');
    check('po povratku je opet spremno', (await text(p, '#live-start')) === 'Pokreni');

    // deljenje zvuka otkazano / izvor bez zvuka
    await p.evaluate(() => (window.__shareFail = 'NotAllowedError'));
    await p.click('#live-start');
    check('otkazano deljenje daje poruku', await until(() => (document.getElementById('live-alert').textContent || '').includes('Niste izabrali zvuk poziva')));
    check('posle otkazivanja mikrofon je ugašen', await until(() => window.__tracksLive() === 0));
    await p.evaluate(() => { window.__shareFail = null; window.__shareNoAudio = true; });
    await p.click('#live-start');
    check('izvor bez zvuka daje poruku', await until(() => (document.getElementById('live-alert').textContent || '').includes('nema zvuk')));
    await p.evaluate(() => (window.__shareNoAudio = false));

    // jedan mikrofon: jezik izjave određuje servis
    await p.click('label[for=live-mode-one]');
    check('režim jednog mikrofona je zapamćen', (await p.evaluate(() => JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1')).liveMode)) === 'single-mic');
    const recCount = await p.evaluate(() => window.__azure.recognizers.length);
    await p.click('#live-start');
    check('jedan prepoznavač sa oba jezika', await until((n) => {
      const r = window.__azure.recognizers;
      return r.length === n + 1 && r.at(-1).started && JSON.stringify(r.at(-1).auto.languages) === '["sr-RS","en-US"]';
    }, recCount));
    await p.evaluate(() => window.__say(undefined, 'Is the load ready', true, 'en-US'));
    check('engleska izjava je sagovornikova', await until(() => document.querySelector('.turn.who-other:not(.live) .src')?.textContent === 'Is the load ready'));
    await p.evaluate(() => window.__say(undefined, 'Spreman je', true, 'sr-RS'));
    check('srpska izjava je moja', await until(() => document.querySelector('.turn.who-me:not(.live) .src')?.textContent === 'Spreman je'));
    await p.click('#live-start');
    await until(() => window.__tracksLive() === 0);
    check('nema grešaka u konzoli (uživo)', t.problems.length === 0, t.problems.join(' | '));
    await t.context.close();

    // bez Azure ključa
    const n = await livePage({}, { azureKey: '' });
    await n.page.click('#live-start');
    check('bez Azure ključa otvaraju se podešavanja', await n.page.locator('#settings').evaluate((d) => d.open));
    check('bez Azure ključa poruka objašnjava šta treba', (await text(n.page, '#azure-error')).includes('Azure ključ'));
    check('bez Azure ključa mikrofon se ne otvara', (await n.page.evaluate(() => window.__tracksLive())) === 0);
    // pogrešan oblik ključa
    await n.page.fill('#azure-key', 'kratko');
    await n.page.click('#settings-form button[type=submit]');
    check('pogrešan oblik Azure ključa daje grešku', (await text(n.page, '#azure-error')).includes('ne liči na Azure ključ'));
    check('dijalog ostaje otvoren', await n.page.locator('#settings').evaluate((d) => d.open));
    await n.page.fill('#azure-key', FAKE_AZURE_KEY);
    await n.page.fill('#azure-region', 'eastus');
    await n.page.click('#settings-form button[type=submit]');
    check('ispravan ključ se čuva sa regionom', await n.page.evaluate(([k]) => {
      const s = JSON.parse(localStorage.getItem('prevodilac.podesavanja.v1'));
      return s.azureKey === k && s.azureRegion === 'eastus';
    }, [FAKE_AZURE_KEY]));
    await n.page.click('#settings-btn');
    check('Azure ključ je maskiran u podešavanjima', ((await n.page.locator('#azure-key').getAttribute('placeholder')) || '').startsWith('Sačuvan:') && !(await n.page.content()).includes(FAKE_AZURE_KEY));
    check('region je prikazan', (await n.page.inputValue('#azure-region')) === 'eastus');
    // provera uređaja uključuje Azure
    await n.page.click('#device-check-btn');
    check('provera uređaja ima red za Azure', await n.page.waitForFunction(() => [...document.querySelectorAll('.check-row')].some((r) => r.textContent.includes('Azure govor') && r.classList.contains('ok')), null, { timeout: 15000 }).then(() => true, () => false));
    check('nema grešaka u konzoli (Azure podešavanja)', n.problems.length === 0, n.problems.join(' | '));
    await n.context.close();

    // snimci (390 i 1280, svetla i tamna tema), sa razgovorom u toku
    for (const scheme of ['light', 'dark']) {
      for (const [name, viewport] of sizes) {
        const s = await livePage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
        const sp = s.page;
        await sp.selectOption('#live-output', 'cable1');
        await sp.click('#live-start');
        await sp.waitForFunction(() => window.__azure.recognizers.length === 2 && window.__azure.recognizers.every((r) => r.started), null, { timeout: 5000 });
        await sp.evaluate(() => window.__say('en-US', 'Where is the nearest pharmacy? My daughter has a fever.', true));
        await sp.waitForFunction(() => document.querySelector('.turn.who-other:not(.live) .tr')?.textContent === 'Zdravo svete', null, { timeout: 6000 });
        await sp.evaluate(() => window.__say('sr-RS', 'Gde je apoteka', true));
        await sp.waitForFunction(() => window.__played.length === 1, null, { timeout: 6000 });
        await sp.waitForFunction(() => !window.__playing, null, { timeout: 4000 });
        await sp.evaluate(() => window.__say('en-US', 'Pick up load 48213 at 14:30', true));
        await sp.waitForFunction(() => document.querySelector('.turn .warn'), null, { timeout: 6000 });
        await sp.evaluate(() => window.__say('sr-RS', 'hvala puno', false));
        await sp.waitForFunction(() => document.querySelector('.turn.live.who-me .tr')?.textContent === 'Hello world', null, { timeout: 6000 });
        check(`uživo ${name}/${scheme}: nema vodoravnog pomeranja`, await sp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        await sp.screenshot({ path: path.join(shotsDir, `uzivo-${name}-${scheme}.png`), fullPage: true });
        check(`uživo ${name}/${scheme}: nema grešaka u konzoli`, s.problems.length === 0, s.problems.join(' | '));
        await s.context.close();
      }
    }
  }
} catch (err) {
  failed++;
  console.log(`NE  izuzetak: ${err.stack || err}`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} prošlo, ${failed} palo. Snimci: ${shotsDir}`);
process.exit(failed ? 1 : 0);
