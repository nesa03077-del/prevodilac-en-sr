// Provera sa pravim Claude API-jem: kvalitet prevoda i brzina.
// Pokretanje:  ANTHROPIC_API_KEY=sk-ant-... npm run smoke
// Opciono:     MODEL=claude-sonnet-5-5 EFFORT=low npm run smoke

import { hasCyrillic } from '../src/core/transliterate.js';
import { createClient, createTranslator, DEFAULT_EFFORT, DEFAULT_MODEL } from '../src/core/translator.js';
import { SMOKE_CASES } from './smoke-cases.js';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Postavite ANTHROPIC_API_KEY pa pokrenite ponovo.');
  process.exit(2);
}

const translator = createTranslator({
  client: createClient(apiKey),
  model: process.env.MODEL || DEFAULT_MODEL,
  effort: process.env.EFFORT || DEFAULT_EFFORT,
});

console.log(`Model: ${translator.model}, effort: ${translator.effort}\n`);
let failed = 0;
for (const c of SMOKE_CASES) {
  const started = performance.now();
  let firstMs = null;
  try {
    const result = await translator.translate({
      text: c.text,
      from: c.from,
      to: c.to,
      context: c.context,
      onText: () => {
        firstMs ??= performance.now() - started;
      },
    });
    const totalMs = performance.now() - started;
    const problems = [];
    if (c.to === 'sr' && hasCyrillic(result.text)) problems.push('ćirilica u prevodu');
    for (const re of c.expect ?? []) if (!re.test(result.text)) problems.push(`nedostaje ${re}`);
    for (const re of c.reject ?? []) if (re.test(result.text)) problems.push(`ne sme ${re}`);
    const ok = problems.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'OK ' : 'NE '} [${c.from}->${c.to}] ${c.text}`);
    console.log(`    => ${result.text}`);
    console.log(`    prvi deo ${Math.round(firstMs ?? totalMs)} ms, ukupno ${Math.round(totalMs)} ms`);
    if (!ok) console.log(`    PROBLEM: ${problems.join('; ')}`);
  } catch (err) {
    failed++;
    console.log(`NE  [${c.from}->${c.to}] ${c.text}\n    GREŠKA: ${err.code ?? ''} ${err.message}`);
  }
}
console.log(`\n${SMOKE_CASES.length - failed}/${SMOKE_CASES.length} prošlo`);
process.exit(failed ? 1 : 0);
