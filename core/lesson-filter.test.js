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

// 2026-11-06 (user: „örülnék, ha nem lenne több ilyen tévedés!”): a „NEM ELLENŐRIZHETŐ” változat eddig átjutott —
// ezek a VALÓDI store.json-beli leckék mind az író promptjába mentek, és mind valódi nevet tagadnak.
t('🔑 a „nem ellenőrizhető / nincs a listán” változatot is kiszűri (valódi leckék a tárból)', () => {
  for (const s of [
    '"Gemini Omni" is not in the verified-real names list and does not appear to be a real Google product — the article repeatedly treats it as a named, existing video model',
    'Hitelesség-kapu blokk: "Gemini Omni" is not in the verified-real names list and does not appear to be a real Google product',
    'Invented product names: RTX Spark, AI Inbox, Gmail Live, Vids, Study Mode — verify these are real Google/NVIDIA products before publishing',
    'Claude Sonnet 4.5 - this specific model version cannot be verified; check official Anthropic naming or replace with a verifiable model',
    "Model names 'GPT-Image-2.6 Flare' and 'GPT-Image-2.6 Sunburst' cannot be independently verified—never invent product names",
    "Picsart Flow is presented as a real AI PDF editing tool, but this specific product name does not appear on the verified-real list",
    "Hitelesség-kapu blokk: Kiro is described as 'an AI coding assistant' that runs on GPT-5.6, but Kiro is not a verified-real product on the supplied list",
    "Hitelesség-kapu blokk: GPT-Realtime is not a verified model name — OpenAI's real-time voice API product is 'Realtime API'",
    "FAKE FACT: 'GPT-6, its newest model' — OpenAI has never released a GPT-6. Latest models are GPT-4, GPT-4o, o1, o3.",
    'Claims Claude Sonnet 5 exists, but it does not',
    'Publishing with an unverified model name risks misleading readers about which product actually exists in Picsart AI Playground'
  ]) assert.ok(nevTagadoLecke(s), 'átengedte: ' + s.slice(0, 70));
});

t('ellenpróba: általános elv és FORRÁSHOZ mért ítélet marad', () => {
  for (const s of [
    'Főnöki döntés tanulsága: Never invent or guess an AI model name; verify product details against an official source before publication, and remove any section that cannot be independently substantiated.',
    'Verify feature behavior before describing it and keep the official tool name consistent.',
    "The article states 'more than 1 million Genie Agents were created in 2026 alone' as from GitHub, but the SOURCE block excerpt only contains GitHub's three-skills announcement.",
    'The 60-second tour is presented as fact but not confirmed in the source',
    "Claim of '1,000 older adults across 10 cities' has no source — invented specific detail",
    'Step 4 says the button is in the top right but the screenshot shows the sidebar'
  ]) assert.ok(!nevTagadoLecke(s), 'kiszűrte: ' + s.slice(0, 70));
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
