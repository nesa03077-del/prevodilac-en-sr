// Pretvara izvezene prijave grešaka (JSON iz podešavanja) u kostur slučajeva za
// scripts/smoke-cases.js.   Pokretanje:  node scripts/reports-to-cases.mjs prijave.json
// Rezultat se kopira u SMOKE_CASES, a u svakom slučaju se popuni `expect`
// (reči koje ispravan prevod mora da sadrži) pre nego što se promeni prompt.
import fs from 'node:fs';
import { reportsToSmokeCaseSource } from '../src/core/reports.js';

const file = process.argv[2];
if (!file) {
  console.error('Upotreba: node scripts/reports-to-cases.mjs prijave.json');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const reports = Array.isArray(data) ? data : data.reports;
if (!Array.isArray(reports)) {
  console.error('Fajl nema listu prijava.');
  process.exit(2);
}
console.log(reportsToSmokeCaseSource(reports));
