// TESZT — a heti összefoglaló átdolgozása (core/heti-atdolgozas.js)
// MIÉRT VAN (2026-11-15): a hajnali heti cikket („This Week in AI: The 5 Stories That Matter (November 15, 2026)”)
// a hitelesség-kapu elutasította, az általános HÍR-átdolgozó (agents/iro) pedig egy egészen más cikket írt belőle
// („AI Assistants and Your Money, Shopping, and Privacy: What to Know”, számozott hírek nélkül). A slug így nem
// this-week-in-ai-… lett → a vasárnapi hírlevél („nincs új heti összefoglaló”) ÉS a heti híradó is elmaradt.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hetiCikkE, hetiAtdolgozasSzabaly, hetiAtdolgozasJavit, hetiCimSzammal, HETI_MIN_HIR, HETI_SLUG } from './heti-atdolgozas.js';
import { focimek } from './heti-hirado.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const CIM = 'This Week in AI: The 5 Stories That Matter (November 15, 2026)';
const hetiAdat = { _meta: { source_id: 'aiworld-editorial' }, original_title: CIM };

// A 11-15-i valódi hiba: az átdolgozó új címet adott, és a számozott hírek helyett tanácsadó szakaszokat írt.
const ELRONTOTT = `---
title: "AI Assistants and Your Money, Shopping, and Privacy: What to Know"
subtitle: "x"
---
# AI Assistants and Your Money, Shopping, and Privacy: What to Know
## Why the details matter
szöveg
## Four habits to build
szöveg
## What this means for you
szöveg
`;

// Jó átdolgozás, de a modell átírta a címet (ez is előfordulhat) → a kód visszaállítja.
const JO_DE_UJ_CIMMEL = `---
title: "AI News This Week: Five Updates"
subtitle: "x"
---
# AI News This Week: Five Updates
## 1. Gmail gets a new helper
szöveg
## 2. NVIDIA laptops
szöveg
## 3. Alexa routines
szöveg
## 4. Gemini in Sheets
szöveg
## What this means for you
szöveg
`;

console.log('\n🧪 heti-atdolgozas.test');

t('a heti összefoglaló felismerhető (forrás + pontos cím)', () => {
  assert.equal(hetiCikkE(hetiAdat), true);
  assert.equal(hetiCikkE({ _meta: { source_id: 'aiworld-editorial' }, original_title: 'This Week in AI: 5 Headlines to Follow (October 18, 2026)' }), true);
});

t('a többi cikk NEM heti (összehasonlító, sima hír, cím nélkül)', () => {
  assert.equal(hetiCikkE({ _meta: { source_id: 'aiworld-editorial' }, original_title: 'Compare: ChatGPT and Claude' }), false);
  assert.equal(hetiCikkE({ _meta: { source_id: 'openai-blog' }, original_title: CIM }), false);
  assert.equal(hetiCikkE({ _meta: { source_id: 'aiworld-editorial' } }), false);
  assert.equal(hetiCikkE(null), false);
});

t('az átdolgozó szabálya kimondja a pontos címet és a számozott hír-formát', () => {
  const s = hetiAtdolgozasSzabaly(CIM);
  assert.ok(s.includes(`title: "${CIM}"`), 'hiányzik a pontos címsor');
  assert.ok(s.includes(`# ${CIM}`), 'hiányzik a pontos H1');
  assert.match(s, /## 1\./);
});

t('a 11-15-i elrontott átdolgozás ELUTASÍTVA (nincs számozott hír)', () => {
  const r = hetiAtdolgozasJavit(ELRONTOTT, CIM);
  assert.equal(r.ok, false);
  assert.ok(r.hirDb < HETI_MIN_HIR);
});

t('új címmel visszaadott, de jó átdolgozás → a cím és a H1 visszaáll a heti címre (a hír-szám a valódi: 4)', () => {
  const r = hetiAtdolgozasJavit(JO_DE_UJ_CIMMEL, CIM);
  assert.equal(r.ok, true);
  assert.equal(r.hirDb, 4);
  const CIM4 = 'This Week in AI: The 4 Stories That Matter (November 15, 2026)';
  assert.equal(r.cim, CIM4);
  assert.match(r.text, new RegExp(`^title: "${CIM4.replace(/[()]/g, '\\$&')}"$`, 'm'));
  assert.match(r.text, new RegExp(`^# ${CIM4.replace(/[()]/g, '\\$&')}$`, 'm'));
  assert.ok(!r.text.includes('AI News This Week: Five Updates'), 'a modell címe bent maradt');
  // a hírlevél / híradó ugyanazokat a híreket látja
  assert.deepEqual(focimek(r.text, 5), ['Gmail gets a new helper', 'NVIDIA laptops', 'Alexa routines', 'Gemini in Sheets']);
});

t('H1 nélküli átdolgozásba a kód beszúrja a pontos H1-et a frontmatter után', () => {
  const md = JO_DE_UJ_CIMMEL.replace(/^# .*\n/m, '');
  const r = hetiAtdolgozasJavit(md, CIM);
  assert.equal(r.ok, true);
  assert.equal((r.text.match(/^# /gm) || []).length, 1);
  assert.match(r.text, /---\n# This Week in AI/);
});

// A 11-16-i valódi hiba: az átdolgozás 3 hírt hagyott, a cím „The 5 Stories” maradt → a bíráló elutasította.
t('11-16: 3 megmaradt hír → a cím „The 3 Stories”, nem ígér 5-öt', () => {
  const md = `---\ntitle: "${CIM}"\n---\n# ${CIM}\n\n## 1. Samsung glasses\nx\n\n## 2. Hidden triggers\nx\n\n## 3. Presenter videos\nx\n\n## What this means for you\nx\n`;
  const r = hetiAtdolgozasJavit(md, CIM);
  assert.equal(r.ok, true);
  assert.equal(r.hirDb, 3);
  assert.ok(r.text.includes('title: "This Week in AI: The 3 Stories That Matter (November 15, 2026)"'));
  assert.ok(r.text.includes('\n# This Week in AI: The 3 Stories That Matter (November 15, 2026)\n'));
  assert.ok(!/The 5 Stories/.test(r.text), 'az 5-ös ígéret bent maradt');
});

t('hetiCimSzammal: a régi címformák is (5 Headlines, 5 Practical Shifts), 5 hírnél változatlan', () => {
  assert.equal(hetiCimSzammal('This Week in AI: 5 Headlines to Follow (October 18, 2026)', 4), 'This Week in AI: 4 Headlines to Follow (October 18, 2026)');
  assert.equal(hetiCimSzammal('This Week in AI: 5 Practical Shifts Worth Knowing', 3), 'This Week in AI: 3 Practical Shifts Worth Knowing');
  assert.equal(hetiCimSzammal(CIM, 5), CIM);
  // a dátum száma (15, 2026) SOHA nem cserélődik; szám nélküli cím változatlan
  assert.equal(hetiCimSzammal('This Week in AI (November 15, 2026)', 3), 'This Week in AI (November 15, 2026)');
  assert.equal(hetiCimSzammal(CIM, 0), CIM);
});

t('frontmatter nélküli válasz → elutasítva (nem találgatunk)', () => {
  const r = hetiAtdolgozasJavit('## 1. a\n## 2. b\n## 3. c\n', CIM);
  assert.equal(r.ok, false);
});

// ŐR: az átdolgozó (agents/iro) tényleg használja — szövegként nézzük, az agent-modult NEM importáljuk (feltétel nélküli main()).
t('őr: az agents/iro átdolgozója a heti szabályt a promptba fűzi és a választ a kód-biztosítékon viszi át', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents', 'iro', 'agent.js'), 'utf-8');
  assert.match(src, /import\s*\{[^}]*hetiAtdolgozasJavit[^}]*\}\s*from\s*'\.\.\/\.\.\/core\/heti-atdolgozas\.js'/);
  assert.match(src, /hetiCikkE\(rejectedData\)\s*\?\s*hetiAtdolgozasSzabaly\(rejectedData\.original_title\)/, 'a prompt nem kapja meg a heti szabályt');
  const javit = src.indexOf('hetiAtdolgozasJavit(response.text');
  const mentes = src.search(/const writerName = saveBackToReview\(filename, data, \{\r?\n\s*text: response\.text/);
  assert.ok(javit > 0 && mentes > javit, 'a kód-biztosíték nem a visszaküldés ELŐTT fut');
});

// ŐR (2026-11-16): a főnök-asztal a heti cikket CSAK megjelent heti cikkel veti össze (nem „duplikátum” attól, hogy
// egy félresikerült, más slugú cikk original_title-je ugyanaz).
t('őr: a főnök-asztal duplikátum-vizsgálata heti cikknél csak a this-week-in-ai- slugokat nézi', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents', 'ceo', 'desk.js'), 'utf-8');
  assert.match(src, /import\s*\{[^}]*hetiCikkE[^}]*HETI_SLUG[^}]*\}\s*from\s*'\.\.\/\.\.\/core\/heti-atdolgozas\.js'/);
  assert.match(src, /hetiCikkE\(d\)\s*\?\s*cikkek\.filter\(c => HETI_SLUG\.test/);
  assert.match(src, /publishedSourceKeys\(vizsgalt\)/);
  assert.equal(HETI_SLUG.test('this-week-in-ai-the-5-stories-that-matter-november-8-2026'), true);
  assert.equal(HETI_SLUG.test('ai-assistants-and-your-money-shopping-and-privacy-what-to-know'), false);
});

console.log(`\n${hiba === 0 ? '✅' : '❌'} heti-atdolgozas.test: ${hiba} bukott`);
if (hiba) process.exit(1);
