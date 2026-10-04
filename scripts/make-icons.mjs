// Pravi PNG ikone aplikacije iz public/icon.svg (Chromium preko Playwright-a).
// Pokretanje (retko, samo kad se menja ikona):  node scripts/make-icons.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../public');
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) {
    if (!c) continue;
    try {
      return require(c);
    } catch {
      /* sledeći */
    }
  }
  throw new Error('Playwright nije pronađen. Postavite PLAYWRIGHT_MODULE.');
}
const { chromium } = loadPlaywright();

const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');
// "maskable" ikona mora da ima sadržaj u sredini (80%), pozadina ide do ivica
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<path d="M96', '<g transform="translate(51 51) scale(0.8)"><path d="M96')
  .replace('</text>\n</svg>', '</text></g>\n</svg>');

const jobs = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', maskable, 512],
];

const browser = await chromium.launch();
for (const [name, source, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.screenshot({ path: path.join(pub, name), omitBackground: true });
  await page.close();
  console.log('napravljeno', name);
}
await browser.close();
