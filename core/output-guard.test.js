// ===================================================================
// TESZT — kimenet-őr (a friss build ellenőrzése a deploy előtt)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/output-guard.js és a core/built-output.js fejlécében.
//
// KÉT RÉSZ:
//   1. A DÖNTÉSEK kitalált lapokon — minden lelet-kódra külön eset.
//   2. A BEKÖTÉS — a CI-lépés a build UTÁN és a deploy ELŐTT fut, a napi riport
//      olvassa a leletet, és a frissesség-térképben is ott van. A kimenetet
//      néző ellenőrzések pont azért voltak vakok, mert ROSSZ HELYEN futottak —
//      ezért a HELYÜKET is őrizzük, nem csak a tartalmukat.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// 🔴 IDŐ ELŐTTI KILÉPÉS-ŐR (2026-09-12). A tesztfuttató (core/run-tests.js)
// CSAK a kilépési kódot nézi. Ha a kimenet-őr parancssori része importkor
// lefutna, a `process.exit(0)` ezt a tesztet EGYETLEN állítás nélkül, ZÖLDEN
// lőné le — és a CI-ban is zöld maradna. Ezért az importot a figyelő UTÁN
// végezzük, és ha a teszt 0-val lép ki, de nem ért a végére, 1-re állítjuk.
let VEGE = false;
process.on('exit', (kod) => {
  if (!VEGE && kod === 0) {
    console.error('🔴 a teszt IDŐ ELŐTT, zölden lépett ki — a kimenet-őr parancssori része importkor lefutott?');
    process.exitCode = 1;
  }
});
const { kimenetEllenorzes, kozvetlenFuttatas, LINK_MAX, MIDREAD_MAX } = await import('./output-guard.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const forras = (p) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
const kommentNelkul = (s) => s.split('\n').filter(x => !/^\s*\/\//.test(x)).join('\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 kimenet-őr\n');

// --- KITALÁLT LAPOK -------------------------------------------------
// A hír és az útmutató tag- és osztálykészlete a műfaji elemek kivételével
// azonos, így a „tiszta" eset valóban tiszta, és minden teszt EGY hibát visz be.
const HIR = (i, extra = '') => ({ f: `hir-${i}.html`, h:
  '<article class="article"><div class="kozos">'
  + '<aside class="lede"><p>röviden</p></aside>'
  + '<aside class="midread"><a class="midread__link" href="valami">x</a></aside>'
  // a HÍRBEN a gyűjtő-link szándékos (user-döntés) — nem lelet
  + '<p><a class="guide-link" href="/tools#c-openai">ChatGPT</a></p>'
  + '</div>' + extra + '</article><footer class="site-footer"></footer>' });

const UTM = (i, { intro = '<aside class="lede"><p>röviden</p></aside>', dobozok = ['elso-cikk', 'masodik-cikk'],
  linkek = ['/article/kezdo-utmutato'], extra = '' } = {}) => ({ f: `utm-${i}.html`, h:
  '<article class="article guide"><div class="kozos">'
  + '<div class="g-intro">' + intro + '</div>'
  + '<div class="g-steps">'
  + dobozok.map(d => `<aside class="midread"><a class="midread__link" href="${d}">x</a></aside>`).join('')
  + '<p>' + linkek.map(u => `<a class="guide-link" href="${u}">termék</a>`).join(' ') + '</p>'
  + '</div></div>' + extra + '</article><footer class="site-footer"></footer>' });

const sok = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
const tiszta = () => [...sok(60, i => HIR(i)), ...sok(60, i => UTM(i))];
const kodok = (e) => e.problems.map(p => p.code).sort();

t('tiszta kimenet → nincs lelet', () => {
  const e = kimenetEllenorzes(tiszta());
  assert.deepEqual(e.problems, [], JSON.stringify(e.problems));
  assert.deepEqual([e.hir, e.utmutato], [60, 60]);
});

t('túl kevés lap → KEVES_LAP (a „nem látott semmit" nem lehet „minden rendben")', () => {
  const e = kimenetEllenorzes([...sok(10, i => HIR(i)), ...sok(10, i => UTM(i))]);
  assert.ok(kodok(e).includes('KEVES_LAP'), JSON.stringify(kodok(e)));
});

t('🔴 csak a hírbe bekötött új funkció → PARITAS_CSAK_HIR', () => {
  const lapok = [...sok(60, i => HIR(i, '<div class="uj-funkcio"></div>')), ...sok(60, i => UTM(i))];
  assert.deepEqual(kodok(kimenetEllenorzes(lapok)), ['PARITAS_CSAK_HIR']);
});

t('a link-plafon túllépése → LINK_PLAFON', () => {
  const lapok = tiszta();
  lapok[70] = UTM(70, { linkek: ['/article/a', '/article/b', '/article/c'] });
  assert.equal(LINK_MAX, 2);
  assert.deepEqual(kodok(kimenetEllenorzes(lapok)), ['LINK_PLAFON']);
});

t('🔴 útmutatóból gyűjtőre vivő link → UTMUTATO_HUB_LINK (a hírben NEM lelet)', () => {
  const lapok = tiszta();
  lapok[61] = UTM(61, { linkek: ['/tools#c-openai'] });
  lapok[62] = UTM(62, { linkek: ['/hu/tools#c-google'] });
  const e = kimenetEllenorzes(lapok);
  assert.deepEqual(kodok(e), ['UTMUTATO_HUB_LINK']);
  assert.ok(e.problems[0].uzenet.startsWith('2 lap'), e.problems[0].uzenet);
});

t('csupasz idézetblokk a bevezetőben → CSUPASZ_IDEZET', () => {
  const lapok = tiszta();
  lapok[63] = UTM(63, { intro: '<blockquote><p>röviden</p></blockquote>' });
  assert.deepEqual(kodok(kimenetEllenorzes(lapok)), ['CSUPASZ_IDEZET']);
});

t('kettőnél több közép-doboz → MIDREAD_TOBB', () => {
  const lapok = tiszta();
  lapok[64] = UTM(64, { dobozok: ['a', 'b', 'c'] });
  assert.equal(MIDREAD_MAX, 2);
  assert.deepEqual(kodok(kimenetEllenorzes(lapok)), ['MIDREAD_TOBB']);
});

t('két doboz ugyanarra a cikkre → MIDREAD_UGYANAZ', () => {
  const lapok = tiszta();
  lapok[65] = UTM(65, { dobozok: ['ugyanaz', 'ugyanaz'] });
  assert.deepEqual(kodok(kimenetEllenorzes(lapok)), ['MIDREAD_UGYANAZ']);
});

t('a link-plafon a build.js értékével egyezik', () => {
  const m = /const GUIDE_LINK_MAX\s*=\s*(\d+)/.exec(kommentNelkul(forras('website/build.js')));
  assert.ok(m, 'nem találom a GUIDE_LINK_MAX-ot a build.js-ben');
  assert.equal(Number(m[1]), LINK_MAX, '🔴 a kimenet-őr plafonja eltér a build.js-étől');
});

t('🔴 importkor NEM fut le a parancssori rész', () => {
  // Ha lefutna, a `process.exit(0)` minden importáló tesztet ZÖLDEN lelőne,
  // egyetlen állítás nélkül.
  assert.equal(kozvetlenFuttatas('/home/runner/work/x/core/output-guard.js'), true);
  // Windows-alakú, fordított perjeles út — SZÁNDÉKOSAN meghajtóbetű NÉLKÜL:
  // a core/test-hygiene.test.js tiltja (Linuxon relatív mappa lenne belőle).
  assert.equal(kozvetlenFuttatas('\\work\\ai-world-co\\core\\output-guard.js'), true);
  assert.equal(kozvetlenFuttatas('/x/core/output-guard.test.js'), false);
  assert.equal(kozvetlenFuttatas('/x/core/run-tests.js'), false);
  assert.equal(kozvetlenFuttatas(undefined), false);
});

// --- A BEKÖTÉS ------------------------------------------------------
t('🔌 CI: a lépés a build UTÁN és a deploy ELŐTT fut', () => {
  const yml = forras('.github/workflows/auto.yml');
  const iTeszt = yml.indexOf('run: node core/run-tests.js');
  const iBuild = yml.indexOf('- name: Weboldal build');
  const iOr = yml.indexOf('run: node core/output-guard.js');
  const iDeploy = yml.indexOf('- name: Deploy — Cloudflare Pages');
  assert.ok(iOr > 0, '🔴 nincs kimenet-őr lépés a CI-ban');
  assert.ok(iBuild > 0 && iOr > iBuild, '🔴 a kimenet-őr a build ELŐTT fut — nincs mit néznie');
  assert.ok(iDeploy > iOr, '🔴 a kimenet-őr a deploy UTÁN fut — a hiba már kint van, mire szól');
  // és ez az oka, hogy egyáltalán kell: a tesztek a build ELŐTT futnak
  assert.ok(iTeszt > 0 && iTeszt < iBuild, 'megváltozott a tesztlépés helye — nézd át, kell-e még ez a lépés');
  const lepes = yml.slice(yml.lastIndexOf('- name:', iOr), iOr + 60);
  assert.ok(/if: always\(\) && steps\.build\.outcome == 'success'/.test(lepes), '🔴 hiányzik a sikeres-build feltétel');
  assert.ok(/node core\/output-guard\.js \|\| true/.test(lepes), '🔴 a lépés megállíthatná a kiadást (`|| true` hiányzik)');
});

t('🔌 napi riport: olvassa a leletet, és a frissesség-térképben is ott van', () => {
  const dr = kommentNelkul(forras('core/daily-report.js'));
  assert.ok(/'output-guard\.json': 'kimenet'/.test(dr),
    '🔴 nincs a frissesség-térképben — a „nem futott le" azonos lenne a „minden rendben"-nel');
  assert.ok(/readFileSync\(join\(ROOT, 'memory', 'output-guard\.json'\)/.test(dr), '🔴 a riport nem olvassa');
  assert.ok(/og\.problems/.test(dr) && /og\.megjavult/.test(dr), '🔴 a riport nem írja ki a leletet');
});

VEGE = true;
console.log(`\n✅ ${pass} teszt rendben`);
