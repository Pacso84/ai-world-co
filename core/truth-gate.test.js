// ===================================================================
// HITELESSÉG-KAPU TESZT — futtatás: node core/truth-gate.test.js
// Offline: NEM hív se hálózatot, se AI-t (injektált ál-fetch + ál-ask).
// A 2026-07-16-i valós esetek mintáin bizonyít (copilot.github.com stb.).
// ===================================================================
import { strict as assert } from 'assert';
import { extractLinks, probeUrl, checkLinks, truthGate } from './truth-gate.js';

// --- 1. link-kigyűjtés: kódblokk kimarad, saját domain kimarad, dedup ---
const md1 = `# Guide
Go to [Copilot](https://copilot.github.com) and start.
Also see https://copilot.github.com again and [us](https://aiworldhq.com/about).
\`\`\`text
https://platform.openai.com/     <- kódblokkban: NEM próbáljuk
\`\`\`
Inline \`https://inline.example.com\` kód: az sem.`;
const links1 = extractLinks(md1);
assert.deepEqual(links1, ['https://copilot.github.com/'], 'csak a kódon kívüli, nem-saját link, dedupolva');

// --- 2. próba-osztályozás ál-fetch-csel ---
const fakeFetch = (behavior) => async (url, opts) => {
  const b = behavior[new URL(url).hostname];
  if (b === 'dns') { const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; }
  if (b === 'timeout') { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }
  return { status: b ?? 200 };
};
assert.equal((await probeUrl('https://dead.example.com/', fakeFetch({ 'dead.example.com': 'dns' }))).status, 'dead', 'DNS-hiba = dead');
assert.equal((await probeUrl('https://ok.example.com/', fakeFetch({}))).status, 'ok', '200 = ok');
assert.equal((await probeUrl('https://gone.example.com/', fakeFetch({ 'gone.example.com': 404 }))).status, 'dead', '404 (HEAD+GET után is) = dead');
assert.equal((await probeUrl('https://slow.example.com/', fakeFetch({ 'slow.example.com': 'timeout' }))).status, 'warn', 'időtúllépés = csak warn');
assert.equal((await probeUrl('https://bot.example.com/', fakeFetch({ 'bot.example.com': 403 }))).status, 'ok', '403 bot-védelem = átengedve');
assert.equal((await probeUrl('https://sick.example.com/', fakeFetch({ 'sick.example.com': 503 }))).status, 'warn', '5xx = warn');

// --- 3. a kapu: halott link = blokk, AI-t NEM is hívja ---
let aiCalled = 0;
const draft = (md) => ({ article_markdown: md, _meta: { type: 'guide', tool: 'Copilot', company: 'Microsoft' } });
const g1 = await truthGate(draft('Menj a [Copilotra](https://copilot.github.com).'), {
  ask: async () => { aiCalled++; return { text: '{"credible":true,"problems":[]}', costUsd: 0.01 }; },
  fetcher: fakeFetch({ 'copilot.github.com': 'dns' })
});
assert.equal(g1.pass, false, 'halott link = bukás');
assert.equal(g1.hold, false, 'halott link = rejected, nem hold');
assert.equal(aiCalled, 0, 'link-bukásnál AI-hívás NINCS ($0)');
assert.ok(g1.blockers[0].includes('copilot.github.com'), 'indok megnevezi a linket');

// --- 4. AI-bíró: credible=false = blokk indokokkal ---
const g2 = await truthGate(draft('A GPT-5.6 modellt válaszd a CORTEX.GPT5_6 függvénnyel.'), {
  ask: async () => ({ text: '```json\n{"credible": false, "problems": ["GPT-5.6 model does not exist"], "confidence": 9}\n```', costUsd: 0.01 }),
  fetcher: fakeFetch({})
});
assert.equal(g2.pass, false, 'kitalált állítás = bukás');
assert.equal(g2.hold, false, 'kitaláltság = rejected');
assert.ok(g2.blockers[0].includes('GPT-5.6'), 'a bíró indoka megy tovább');

// --- 5. AI nem elérhető = HOLD (marad a drafts-ban) ---
const g3 = await truthGate(draft('Rendes cikk linkek nélkül.'), { ask: async () => null, fetcher: fakeFetch({}) });
assert.equal(g3.pass, false, 'bíró nélkül nincs publikálás');
assert.equal(g3.hold, true, 'bíró-hiba = HOLD, nem rejected');

// --- 6. minden rendben = átmegy (warning nem akadály) ---
const g4 = await truthGate(draft('Menj a [Copilotra](https://copilot.microsoft.com). Lassú: https://slow.example.com/x'), {
  ask: async () => ({ text: '{"credible":true,"problems":[],"confidence":8}', costUsd: 0.01 }),
  fetcher: fakeFetch({ 'slow.example.com': 'timeout' })
});
assert.equal(g4.pass, true, 'hiteles cikk átmegy');
assert.equal(g4.warnings.length, 1, 'timeout-link csak figyelmeztetés');

// --- 7. ellenőrzött-név lista bekerül a bíró promptjába (Alexa+ FP ellen) ---
import { aiTruthVerdict } from './truth-gate.js';
let seenPrompt = '';
await aiTruthVerdict('Alexa+ is great.', { title: 't', knownNames: ['Alexa+', 'ChatGPT'] }, async (p) => { seenPrompt = p; return { text: '{"credible":true,"problems":[]}', costUsd: 0 }; });
assert.ok(seenPrompt.includes('VERIFIED-REAL NAMES'), 'a bíró promptja tartalmazza az ellenőrzött-név blokkot');
assert.ok(seenPrompt.includes('Alexa+'), 'Alexa+ a promptban van (nem minősül kitaláltnak)');

console.log('✅ truth-gate.test: mind a 7 blokk átment');
