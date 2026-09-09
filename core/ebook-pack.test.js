// ===================================================================
// TESZT — FIZETŐS CSOMAG (Everyday AI Starter Pack), 2026-09-09
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// User-döntés: PDF-csomag · angolul · Ko-fi · $9 · vegyes téma.
//
// 🔑 ITT A VÁLOGATÁS MINŐSÉGE MAGA A TERMÉK. Egy rosszul besorolt vagy
// használhatatlan útmutató nem szépséghiba: a vevő ezért fizetett.
// Ezért fut a záró szakasz a VALÓDI `content/articles/` tartalmán.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { valogat, alkalmas, teruletOf, cimBol, lepesSzam, TERULETEK, SZUK_ESZKOZ, DB_TERULETENKENT } from './ebook-pack.js';
import { torzs, konyvHtml } from './ebook-build.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 fizetős csomag — a válogatás minősége MAGA a termék\n');

const cikk = (cim, { tool = '', lep = 5, szo = 1200 } = {}) => ({
  slug: cim.toLowerCase().replace(/[^a-z0-9]+/g, '-'), tool,
  md: `---\ntitle: "${cim}"\n---\n\n`
    + Array.from({ length: lep }, (_, i) => `## Step ${i + 1} — do it\n${'word '.repeat(Math.ceil(szo / lep))}`).join('\n')
    + '\n\n## Common mistakes\nx\n\n## What this means for you\ny\n'
});

// ===================================================================
// 1. A MINŐSÉGI MÉRCE
// ===================================================================
t('a hiányos útmutató NEM kerül fizetős csomagba', () => {
  assert.equal(alkalmas(cikk('Good one')), true);
  assert.equal(alkalmas(cikk('Too few steps', { lep: 2 })), false, '2 lépés átment');
  assert.equal(alkalmas(cikk('Too short', { szo: 300 })), false, '300 szó átment');
  const nincsHiba = { ...cikk('No mistakes section') };
  nincsHiba.md = nincsHiba.md.replace('## Common mistakes', '## Wrap up');
  assert.equal(alkalmas(nincsHiba), false, 'a „Common mistakes" nélküli átment');
});

t('🔑 KÜLÖNLEGES HARDVERT igénylő eszköz kimarad (valódi lelet)', () => {
  // Az első válogatásom élére egy „home-assistant chatbot NVIDIA ChatRTX-szel"
  // került, mert az volt a legrészletesebb — ahhoz viszont RTX videokártya
  // kell. 🔑 A LEGRÉSZLETESEBB NEM A LEGHASZNÁLHATÓBB. A vevő azt kérdezi:
  // „ezt én meg tudom csinálni?"
  for (const eszkoz of SZUK_ESZKOZ) {
    assert.equal(alkalmas(cikk('Set up something', { tool: eszkoz })), false, eszkoz + ' bekerült');
  }
  assert.equal(alkalmas(cikk('Set up something', { tool: 'ChatGPT' })), true);
});

t('hibás bemenet nem dob', () => {
  for (const rossz of [null, undefined, {}, { md: 42 }, 'szöveg']) {
    assert.doesNotThrow(() => alkalmas(rossz));
    assert.equal(alkalmas(rossz), false);
  }
  assert.doesNotThrow(() => valogat(null));
  assert.doesNotThrow(() => valogat('nem tömb'));
});

// ===================================================================
// 2. A BESOROLÁS — ezt két valódi hiba tanította meg
// ===================================================================
t('🔑 a SORREND számít: a phishing-útmutató BIZTONSÁG, nem „email"', () => {
  // VALÓDI HIBA: a „How to Spot a Phishing **Email**…" a Work területre
  // esett, mert az „email" hamarabb illeszkedett, mint a „phishing".
  assert.equal(teruletOf(cikk('How to Spot a Phishing Email or Scam Text')), 'safe');
  assert.equal(teruletOf(cikk('Turn Off AI Chat History and Data Saving')), 'safe');
  // …de a valódi e-mailes munkacikk MARAD a Work területen.
  assert.equal(teruletOf(cikk('Automate Email Drafts for Faster Inbox Management')), 'work');
});

t('🔑 a „shopping list" NEM pénzügy (valódi hiba volt)', () => {
  // Az első változatban a Money-terület öt cikkéből HÁROM étkezés-tervezés
  // és nyaralás lett, mert a „shopping list" és a „budget-friendly"
  // ráillett a mintára.
  assert.equal(teruletOf(cikk('Plan Your Weekly Meals and Shopping List')), 'home');
  assert.equal(teruletOf(cikk('Plan a Budget-Friendly City Vacation')), 'home');
  assert.equal(teruletOf(cikk('Build a Simple Personal Budget Spreadsheet')), 'money');
});

t('🔑 NINCS ÁTSZIVÁRGÁS: ami az egyik terület top-5-jéből kimarad, nem esik a másikba', () => {
  // Ez volt a gyökérok: a kód területenként a TELJES készletből válogatott.
  // Hat home-cikk közül öt fér be — a hatodik SEHOVA nem mehet át.
  // ⚠️ A LÉPÉSSZÁM MIND A HATNÁL A MÉRCE FÖLÖTT VAN. Az első változatomban
  // `lep: 7-i` volt, így az utolsó kettő 3 és 2 lépéssel KIESETT a minőségi
  // mércén — és a teszt nem azt mérte, amit hittem (a rangsort a hossz adja).
  const sok = Array.from({ length: 6 }, (_, i) => cikk(`Plan a family dinner number ${i}`, { lep: 5, szo: 2000 - i * 100 }));
  const v = valogat([...sok, cikk('Build a Simple Personal Budget Spreadsheet')]);
  const home = v.find(x => x.id === 'home'), money = v.find(x => x.id === 'money');
  assert.equal(home.cikkek.length, DB_TERULETENKENT);
  assert.equal(money.cikkek.length, 1, 'a home hatodik cikke átszivárgott a money-ba');
  assert.ok(!money.cikkek.some(c => /family dinner/.test(cimBol(c.md))), 'family-cikk a pénzügyi részben');
});

// ===================================================================
// 3. VÁLTOZATOSSÁG A CSOMAGON BELÜL
// ===================================================================
t('🔑 nem lesz öt „Getting started with…" egymás mellett', () => {
  // Ugyanaz a lecke, mint a Reel-sornál (ugyanaznap): a tartalmunk
  // kötegekben készült, ezért a puszta „legrészletesebb N" ismételne.
  const jeloltek = [
    ...Array.from({ length: 5 }, (_, i) => cikk(`Getting started with email tool ${i}`, { lep: 9 - i })),
    cikk('Clean up a flooded inbox', { lep: 4 }),
    cikk('Write a polite complaint email', { lep: 4 })
  ];
  const work = valogat(jeloltek).find(x => x.id === 'work');
  const kezdetek = work.cikkek.map(c => cimBol(c.md).toLowerCase().split(' ').slice(0, 3).join(' '));
  const egyedi = new Set(kezdetek);
  assert.ok(egyedi.size >= 3, 'a csomag ' + kezdetek.length + ' cikkéből csak ' + egyedi.size + ' különböző kezdet');
});

t('🚨 a változatosság NEM tehet hiányossá: ha nincs más, feltölt', () => {
  // A vevő 25 útmutatót vásárolt. A változatosság kényelem, a DARABSZÁM
  // az ígéret — ha minden jelölt hasonlít, akkor is tele kell lennie.
  const egyformak = Array.from({ length: 5 }, (_, i) => cikk(`Getting started with email ${i}`, { tool: 'ChatGPT', lep: 9 - i }));
  const work = valogat(egyformak).find(x => x.id === 'work');
  assert.equal(work.cikkek.length, DB_TERULETENKENT, 'a terület hiányos maradt a változatosság miatt');
});

// ===================================================================
// 4. A HÁROM „NEM ALKU TÁRGYA" SZABÁLY A KÖNYVBEN
// ===================================================================
t('🚨 a könyv KIMONDJA, hogy a tartalom ingyen is elérhető', () => {
  // Egy fizetős csomag, ami elhallgatja, hogy a tartalma ingyen is megvan,
  // MEGTÉVESZTÉS. Ez nem stílus-kérdés.
  const html = konyvHtml(valogat([cikk('Automate Email Drafts')]));
  assert.match(html, /also free on our website/i, '⚠️ a csomag elhallgatja, hogy a tartalom ingyenes');
});

t('🚨 a könyv KIMONDJA az AI-szerzőséget', () => {
  const html = konyvHtml(valogat([cikk('Automate Email Drafts')]));
  assert.match(html, /written by our AI editorial team/i,
    '⚠️ eltűnt az AI-szerzőség — épp gépi tartalom miatt vagyunk keresői büntetésben');
});

t('minden útmutatóhoz van HONLAP-LINK (a friss változat ott van)', () => {
  const v = valogat([cikk('Automate Email Drafts'), cikk('Plan a family dinner')]);
  const html = konyvHtml(v);
  const db = v.reduce((s, x) => s + x.cikkek.length, 0);
  assert.equal((html.match(/Read online/g) || []).length, db);
  assert.match(html, /https:\/\/aiworldhq\.com\/article\//);
});

t('a törzs a frontmatter és a H1 NÉLKÜL megy be (a címet mi adjuk)', () => {
  const md = '---\ntitle: "X"\n---\n\n# X\n\n## Step 1 — go\nszöveg';
  const b = torzs(md);
  assert.ok(!/^---/.test(b), 'a frontmatter bent maradt');
  assert.ok(!/^#\s/.test(b), 'a H1 duplikálódna a saját címünkkel');
  assert.match(b, /## Step 1/);
});

// ===================================================================
// 5. A VALÓDI TARTALMON — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
console.log('\n🧪 a valódi útmutatókon');

t('🔑 ÉLES: a csomag TELJES és minden terület kitelik', () => {
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) { console.log('     (nincs cikk-mappa — kihagyva)'); return; }
  const cikkek = [];
  for (const f of readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = d._meta || {};
    if (m.type !== 'guide' || !m.slug) continue;
    cikkek.push({ slug: m.slug, tool: m.tool || '', md: d.article_markdown || '' });
  }
  if (!cikkek.length) { console.log('     (nincs útmutató — kihagyva)'); return; }

  const v = valogat(cikkek);
  const db = v.reduce((s, x) => s + x.cikkek.length, 0);
  const szo = v.reduce((s, x) => s + x.cikkek.reduce((n, c) => n + c.md.split(/\s+/).length, 0), 0);
  console.log(`     ↳ ${db} útmutató, ${szo} szó, ${v.length} terület`);
  assert.equal(v.length, TERULETEK.length);
  for (const ter of v) {
    assert.equal(ter.cikkek.length, DB_TERULETENKENT,
      `a(z) „${ter.cim}" területen csak ${ter.cikkek.length} útmutató van — hiányos a termék`);
  }
  assert.ok(szo > 25000, 'a csomag csak ' + szo + ' szó — vékony egy fizetős termékhez');
});

t('🔑 ÉLES: EGYETLEN útmutató sem szerepel KÉTSZER', () => {
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) return;
  const cikkek = [];
  for (const f of readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = d._meta || {};
    if (m.type === 'guide' && m.slug) cikkek.push({ slug: m.slug, tool: m.tool || '', md: d.article_markdown || '' });
  }
  if (!cikkek.length) return;
  const slugok = valogat(cikkek).flatMap(x => x.cikkek.map(c => c.slug));
  assert.equal(new Set(slugok).size, slugok.length, 'ugyanaz az útmutató kétszer van a csomagban');
});

t('🔑 ÉLES: minden kiválasztott útmutató átmegy a minőségi mércén', () => {
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) return;
  const cikkek = [];
  for (const f of readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    const m = d._meta || {};
    if (m.type === 'guide' && m.slug) cikkek.push({ slug: m.slug, tool: m.tool || '', md: d.article_markdown || '' });
  }
  if (!cikkek.length) return;
  for (const ter of valogat(cikkek)) for (const c of ter.cikkek) {
    assert.ok(alkalmas(c), cimBol(c.md) + ' nem felel meg a mércének');
    assert.ok(lepesSzam(c.md) >= 4, cimBol(c.md) + ' kevés lépés');
  }
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} ebook-pack.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
