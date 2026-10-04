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
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/home/user/node-tools/node_modules/playwright'];
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
  let chunks = toSerbian ? ['Zdravo ', 'svete'] : ['Hello ', 'world'];
  if (source.includes('Good day')) chunks = ['Добар ', 'дан'];
  return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(chunks) });
}

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

async function newPage(opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
    ...opts,
  });
  await context.route('https://api.anthropic.com/**', fakeApi);
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
} catch (err) {
  failed++;
  console.log(`NE  izuzetak: ${err.stack || err}`);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} prošlo, ${failed} palo. Snimci: ${shotsDir}`);
process.exit(failed ? 1 : 0);
