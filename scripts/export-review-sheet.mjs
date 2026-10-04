// Pravi docs/pregled-za-govornika.md iz koda.  Pokretanje: npm run review-sheet
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReviewSheet } from '../src/core/review-sheet.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/pregled-za-govornika.md');
fs.writeFileSync(out, buildReviewSheet());
console.log('napisano', out);
