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
import { hetiCikkE, hetiAtdolgozasSzabaly, hetiAtdolgozasJavit, HETI_MIN_HIR } from './heti-atdolgozas.js';
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

t('új címmel visszaadott, de jó átdolgozás → a cím és a H1 visszaáll a pontos heti címre', () => {
  const r = hetiAtdolgozasJavit(JO_DE_UJ_CIMMEL, CIM);
  assert.equal(r.ok, true);
  assert.equal(r.hirDb, 4);
  assert.match(r.text, new RegExp(`^title: "${CIM.replace(/[()]/g, '\\$&')}"$`, 'm'));
  assert.match(r.text, new RegExp(`^# ${CIM.replace(/[()]/g, '\\$&')}$`, 'm'));
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

console.log(`\n${hiba === 0 ? '✅' : '❌'} heti-atdolgozas.test: ${hiba} bukott`);
if (hiba) process.exit(1);
