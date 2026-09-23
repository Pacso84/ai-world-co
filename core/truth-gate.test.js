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

// --- 8. A HIVATALOS FORRÁS SAJÁT CÍMÉVEL SZEMBEN A „NEM LÉTEZIK" NEM ÁLL MEG ---
// Valós eset, 2026-09-23: az AWS hivatalos blogjának „Claude Opus 5.5 is now
// available on AWS" hírét a bíró azzal blokkolta, hogy a tudása januárig tart.
// Az átdolgozás KIVETTE a modell nevét — a hír lényege tűnt el.
import { forrasVisszaigazol } from './truth-gate.js';
const OPUS_KIFOGAS = "Invented model name 'Claude Opus 5.5': Anthropic's model lineup in my training (through January 2026) tops out at Claude Opus 4 / 4.1. The 'Opus 5.5' designation represents a major version jump that does not match any known Anthropic release, and the article states it as a hard fact rather than hedging.";
const hir = (md, extra = {}) => ({
  article_markdown: `---\ntitle: "Claude's Top Model Just Reached AWS"\n---\n${md}`,
  original_title: 'Claude Opus 5.5 is now available on AWS',
  _meta: { source_name: 'AWS Machine Learning (hivatalos)', source_link: 'https://aws.amazon.com/blogs/machine-learning/claude-opus-5-5-is-now-available-on-aws/', ...extra }
});
const itelet = (problems) => async () => ({ text: JSON.stringify({ credible: false, problems, confidence: 5 }), costUsd: 0.01 });
const nincsLink = fakeFetch({});

const g8 = await truthGate(hir('Claude Opus 5.5 is now on Amazon Bedrock.'), { ask: itelet([OPUS_KIFOGAS]), fetcher: nincsLink });
assert.equal(g8.pass, true, '🔑 a VALÓS Opus 5.5-kifogás a forrás címével szemben nem blokkolhat');
assert.equal(g8.overridden?.length, 1, 'a felülbírált kifogás visszakereshető');
assert.ok(g8.warnings.some(w => /felülbíráltuk/.test(w)), 'a felülbírálás nem néma — a naplóba kerül');

// ...de a kapu TOVÁBBRA IS fog, ahol kell:
const g9 = await truthGate(hir('x'), { ask: itelet(["'Claude Opus 5.5' is said to cost $3 per million tokens — invented price, not in any announcement"]), fetcher: nincsLink });
assert.equal(g9.pass, false, 'ÁR-kifogás a címben szereplő névről is BLOKK marad');

const g10 = await truthGate(hir('x'), { ask: itelet(["Invented model name 'GPT-5.6': no such OpenAI release exists"]), fetcher: nincsLink });
assert.equal(g10.pass, false, 'a forrás címében NEM szereplő kitalált név BLOKK marad');

const g11 = await truthGate(hir('x'), { ask: itelet(["'Claude Opus 5.5' has no 'Rewrite with Opus' button — this UI element does not exist"]), fetcher: nincsLink });
assert.equal(g11.pass, false, 'ha csak az EGYIK idézett név van a címben (a gomb nincs), BLOKK marad');

const g12 = await truthGate(hir('x'), { ask: itelet([OPUS_KIFOGAS, "Invented model name 'GPT-5.6': no such release"]), fetcher: nincsLink });
assert.equal(g12.pass, false, 'vegyes ítéletnél a valódi kifogás miatt BLOKK marad');
assert.equal(g12.blockers.length, 1, 'de csak a valódi kifogás megy tovább az átdolgozóhoz');
assert.ok(/GPT-5\.6/.test(g12.blockers[0]), 'a megmaradt kifogás a GPT-5.6-os');

// Az útmutatónak VAN original_title-je (a témája), de NINCS hivatalos forrás-
// URL-je. Valós eset a kalibrálásból: a Safari-útmutató kitalált „Summarize"
// menüpontját a bíró JOGOSAN fogta — a szűrő első változata elengedte volna.
const utmutato = {
  article_markdown: '---\ntitle: "How to x"\n---\nx',
  original_title: 'Claude Opus 5.5 is now available on AWS',     // szándékosan UGYANAZ a cím
  _meta: { source_id: 'guide', source_name: 'AI World Guide', source_link: '' }
};
const g13 = await truthGate(utmutato, { ask: itelet([OPUS_KIFOGAS]), fetcher: nincsLink });
assert.equal(g13.pass, false, '🔑 forrás-URL nélkül (útmutató) a szűrő SEMMIT nem enged el, a cím egyezése ellenére sem');

// Felületről szóló kifogás hivatalos forrás mellett is BLOKK marad
const safari = hir('x');
safari.original_title = 'Summarize long web articles in Safari with Apple Intelligence';
const g14 = await truthGate(safari, { ask: itelet(["Step 4 describes a 'Summarize' option appearing in the Safari Reader-mode page menu (the Aa panel) — this UI element does not exist in Safari."]), fetcher: nincsLink });
assert.equal(g14.pass, false, '🔑 kitalált menüpont/gomb kifogása SOHA nem engedhető el, a név a címben van');

// A bíró MEGKAPJA a forrást és a dátumot — hírnél igen, útmutatónál nem
let latott = '';
const fogo = async (p) => { latott = p; return { text: '{"credible":true,"problems":[]}', costUsd: 0 }; };
await truthGate(hir('x'), { ask: fogo, fetcher: nincsLink });
assert.ok(latott.includes('=== SOURCE'), 'hírnél a bíró megkapja a forrás-blokkot');
assert.ok(latott.includes('Claude Opus 5.5 is now available on AWS'), 'benne az eredeti cím');
assert.ok(latott.includes('aws.amazon.com'), 'benne a hivatalos URL');
assert.ok(/Today's date: \d{4}-\d{2}-\d{2}/.test(latott), 'benne a mai dátum');
await truthGate(utmutato, { ask: fogo, fetcher: nincsLink });
assert.ok(!latott.includes('=== SOURCE'), 'útmutatónál nincs (nem létező) forrás-blokk');

// Az aposztróf a szó közepén NEM idézőjel — különben „s model lineup…" lenne a „név"
const { elvetett: ev } = forrasVisszaigazol([OPUS_KIFOGAS], { originalTitle: 'Claude Opus 5.5 is now available on AWS', sourceUrl: 'https://aws.amazon.com/blogs/x/' });
assert.equal(ev.length, 1, 'az „Anthropic\'s" aposztrófja nem rontja el a névkeresést');
// ugyanez URL NÉLKÜL: semmi (a cím egyedül nem bizonyít — lehet a mi témánk)
const { elvetett: ev0 } = forrasVisszaigazol([OPUS_KIFOGAS], { originalTitle: 'Claude Opus 5.5 is now available on AWS' });
assert.equal(ev0.length, 0, 'forrás-URL nélkül a cím-egyezés önmagában nem elég');
// URL-ből is felismeri (kötőjeles verziószám: opus-5-5)
const { elvetett: ev2 } = forrasVisszaigazol([OPUS_KIFOGAS], { sourceUrl: 'https://aws.amazon.com/blogs/machine-learning/claude-opus-5-5-is-now-available-on-aws/' });
assert.equal(ev2.length, 1, 'a kötőjeles URL-ből (opus-5-5) is visszaigazol');

console.log('✅ truth-gate.test: mind a 8 blokk átment');
