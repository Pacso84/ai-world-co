// ===================================================================
// TESZT — a „ez a név KITALÁLT" eseti ítéletek nem kerülnek promptba
// (core/lesson-filter.js). Ingyenes; a memóriát NEM írja (élő állapot).
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nevTagadoLecke } from './lesson-filter.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Tanulság-szűrő\n');

t('🔑 a valódi, élesben talált téves ítéleteket kiszűri', () => {
  for (const s of [
    'The product name "Alexa+" is invented. Amazon\'s smart assistant is called Alexa.',
    'Hitelesség-kapu blokk: Midjourney V8.1 is fabricated — Midjourney\'s latest major version as of public knowledge is V6.',
    '"Claude Opus 5" appears to be an invented or incorrectly named model.',
    'Factual inaccuracy: OpenAI Presence is not a real OpenAI product - this article fabricates a service',
    'Invented model name: \'Qwen3.6-35B-A3B\' does not appear to exist.',
    'The product \'Omnigent\' by Databricks is invented. There is no official Databricks product by this name.',
    'The 2026 URL uses a future date, so the link is fabricated.'
  ]) assert.ok(nevTagadoLecke(s), 'átengedte: ' + s.slice(0, 60));
});

t('az ÁLTALÁNOS tanulságokat megtartja', () => {
  for (const s of [
    'Missing What this means for you section',
    'Explainer/how-to: ALWAYS name the real product or place from the source.',
    'Misleading setup: presents invented dashboard steps (Create New Agent) as hard facts, will mislead readers',
    'The article ends abruptly mid-sentence in the final section.',
    'Use US spelling: color, organize, center.'
  ]) assert.ok(!nevTagadoLecke(s), 'kiszűrte: ' + s.slice(0, 60));
});

t('üres bemenet nem dől el', () => {
  assert.equal(nevTagadoLecke(''), false);
  assert.equal(nevTagadoLecke(null), false);
});

t('a memory-manager MINDEN úton szűr: mentés, kulcsszavas és szemantikus keresés, lista', () => {
  const src = readFileSync(join(ROOT, 'core', 'memory-manager.js'), 'utf-8');
  assert.match(src, /import \{ nevTagadoLecke \} from '\.\/lesson-filter\.js'/);
  assert.match(src, /if \(nevTagadoLecke\(norm\)\) return;/, 'a mentés nem szűr');
  assert.ok((src.match(/!nevTagadoLecke\(it\.text\)/g) || []).length >= 3, 'recall / recallSemantic / list közül valamelyik nem szűr');
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
