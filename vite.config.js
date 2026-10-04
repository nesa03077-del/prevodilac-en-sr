import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

// Sigurnosna politika samo u završnoj verziji (razvojni server ubacuje svoje skripte).
// Stranica sme da se javlja jedino na Anthropic API i na Azure servis za govor (samo režim "Uživo").
const CONNECT_SRC = [
  'https://api.anthropic.com',
  'https://*.stt.speech.microsoft.com',
  'wss://*.stt.speech.microsoft.com',
  'https://*.tts.speech.microsoft.com',
  'wss://*.tts.speech.microsoft.com',
  'https://*.api.cognitive.microsoft.com',
  'https://*.cognitiveservices.azure.com',
  'wss://*.cognitiveservices.azure.com',
].join(' ');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src blob:",
  `connect-src ${CONNECT_SRC}`,
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function cspPlugin() {
  return {
    name: 'prevodilac-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

// Servisni radnik: posle gradnje ispisuje sw.js sa spiskom svih fajlova, pa aplikacija
// radi (i otvara se) i bez interneta. Prevod i dalje traži mrežu.
const SW_SOURCE = (version, files) => `// Napravljeno pri gradnji (vite.config.js). Ne menjati ručno.
const CACHE = 'prevodilac-${version}';
const FILES = ${JSON.stringify(files)};
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('prevodilac-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Anthropic API i sve drugo ide direktno

  if (req.mode === 'navigate') {
    // Prvo mreža (da se vidi nova verzija), ali ako ne odgovori brzo ili je nema, ide sačuvana stranica.
    event.respondWith(
      Promise.race([
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        }),
        new Promise((_, reject) => setTimeout(reject, NAVIGATION_TIMEOUT_MS)),
      ]).catch(() => caches.match('./index.html', { ignoreSearch: true })),
    );
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

function swPlugin() {
  let outDir;
  return {
    name: 'prevodilac-sw',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => f !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(fs.readFileSync(path.join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const urls = ['./', ...files.map((f) => `./${f}`)];
      fs.writeFileSync(path.join(outDir, 'sw.js'), SW_SOURCE(version, urls));
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [cspPlugin(), swPlugin()],
});
