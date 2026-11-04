// ===================================================================
// TESZT — a „Mit jelent ez számodra?” doboz MINDHÁROM nyelven (2026-11-02)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI VOLT A HIBA
// A hír-ág `wrapImpactSection`-je CSAK az angol „What this means for you”
// címet ismerte, és a doboz címkéje is angolul volt beégetve. A /hu/ és /es/
// hírekben a rész ezért sima szövegként állt (Chrome-ban, 390 px-en
// igazolva: a magyar Bee-cikkben 0 `.impact`). Az útmutató-ág a „számodra”
// alakot nem ismerte (csak a „neked”-et), pedig a fordításokban az a gyakoribb
// (≈620 „számodra” vs ≈110 „neked”; es: ≈750 „Qué significa esto para ti”).
//
// A build.js-t IMPORTÁLNI TILOS (építene és publikálna) → a két darabot a
// forrásból vágjuk ki és külön értékeljük ki.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

function kivag(kezdet) {
  const i = src.indexOf(kezdet);
  assert.ok(i >= 0, `nem találom a build.js-ben: ${kezdet}`);
  const vege = src.indexOf('\n}\n', i);
  const sor = src.indexOf(';\n', i);
  // konstans: az első „;\n”-ig; függvény: a záró „\n}\n”-ig
  return kezdet.startsWith('const') ? src.slice(i, sor + 1) : src.slice(i, vege + 2);
}
const kod = [
  'function escapeHtml(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}',
  kivag('const IMPACT_CIM_RE'),
  kivag('function impactCim('),
  kivag('function wrapImpactSection('),
  'return { IMPACT_CIM_RE, impactCim, wrapImpactSection };'
].join('\n');
const { impactCim, wrapImpactSection } = new Function(kod)();

const JO = [
  'What this means for you',
  'What This Means for You',
  'Mit jelent ez számodra', 'Mit jelent ez számodra?', 'Mit jelent ez neked?',
  'Ez mit jelent számodra?', 'Mit jelent ez a számodra', 'Mit jelent ez mindez a számodra?',
  'Mit jelent ez számodra a gyakorlatban?', 'Mit jelentenek ezek számodra', 'Mit jelent ez rád nézve?',
  'Mit jelent ez Önnek?',
  'Qué significa esto para ti', '¿Qué significa esto para ti?', 'Qué significa para ti',
  'Lo que esto significa para ti', 'Qué significa todo esto para ti', 'Qué significa esto para vos',
];
const ROSSZ = [
  'Mit jelentett be a GitHub?', 'Mit jelentettek be?', 'Mit jelent valójában az „agentic"',
  'Qué significa realmente "agéntica"', 'Mit mond a bejelentés?', 'What changed',
  '1. lépés — Nyisd meg az appot, és jelentkezz be',
];

t('a „számodra / para ti” címváltozatokat felismeri', () => {
  const kimarad = JO.filter(c => !impactCim(c));
  assert.deepEqual(kimarad, [], 'nem ismerte fel: ' + kimarad.join(' | '));
});

t('a hasonló, de más jelentésű címeket NEM teszi dobozba', () => {
  const tevesen = ROSSZ.filter(c => impactCim(c));
  assert.deepEqual(tevesen, [], 'tévesen dobozba tenné: ' + tevesen.join(' | '));
});

t('🔴 magyar hírben doboz lesz, a címke a SAJÁT (magyar) cím, kérdőjel nélkül', () => {
  const html = '<p>Bevezető</p><h2 id="x">Mit jelent ez számodra?</h2><ul><li>Egy</li></ul><h2>Összegzés</h2><p>Vége</p>';
  const ki = wrapImpactSection(html);
  assert.match(ki, /<aside class="impact">\s*<div class="impact__label">Mit jelent ez számodra<\/div>/);
  assert.ok(!/What this means for you/.test(ki), '🔴 angol címke a magyar oldalon');
  assert.match(ki, /<\/aside><h2>Összegzés<\/h2>/, 'a doboz a következő h2-nél záródjon');
});

t('spanyolul is, és az angol változat címkéje változatlan', () => {
  const es = wrapImpactSection('<h2>Qué significa esto para ti</h2><p>a</p>');
  assert.match(es, /impact__label">Qué significa esto para ti</);
  const en = wrapImpactSection('<h2 id="what-this-means-for-you">What this means for you</h2><p>a</p><hr><p>b</p>');
  assert.match(en, /impact__label">What this means for you<\/div>/);
  assert.match(en, /<\/aside><hr>/, 'az angolban a <hr>-nél záródik, mint eddig');
});

t('csak az ELSŐ ilyen szakaszt teszi dobozba (mint eddig)', () => {
  const ki = wrapImpactSection('<h2>Mit jelent ez neked?</h2><p>a</p><h2>Mit jelent ez számodra?</h2><p>b</p>');
  assert.equal((ki.match(/class="impact"/g) || []).length, 1);
});

t('az útmutató-ág ugyanazt a felismerőt használja', () => {
  const g = src.slice(src.indexOf('function buildGuidePage'));
  assert.match(g, /if \(impactCim\(t\)\)/, 'az útmutató-ág saját, szűkebb regexet használ');
});

console.log(`\n  ${pass} teszt rendben`);
