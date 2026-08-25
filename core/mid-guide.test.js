// ===================================================================
// TESZT — közép-doboz az útmutatókban
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/mid-guide.js fejlécében (63% / 0 db / 1,04).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { midStepNo, insertMidGuide, MIN_LEPES } from './mid-guide.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOBOZ = '<aside class="midread">X</aside>';
const lepes = n => `<div class="g-step" id="step-${n}"><p>${n}. lépés szövege</p></div>`;
const torzs = n => Array.from({ length: n }, (_, i) => lepes(i + 1)).join('\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 közép-doboz az útmutatókban\n');

t('a felezőpont mindig a 40-50% sávban van', () => {
  // Mérve: minden élő útmutató 4-11 lépéses.
  for (const [lepesek, varva] of [[4, 3], [5, 3], [6, 4], [7, 4], [11, 6]]) {
    assert.equal(midStepNo(lepesek), varva, lepesek + ' lépés');
    const arany = (varva - 1) / lepesek;
    assert.ok(arany >= 0.35 && arany <= 0.55, `${lepesek} lépés → ${Math.round(arany * 100)}%`);
  }
});

t('rövid útmutatót nem szakítunk meg', () => {
  for (const n of [0, 1, 2, 3]) assert.equal(midStepNo(n), 0);
  assert.equal(midStepNo(MIN_LEPES), 3);
});

t('hibás lépésszám nem okoz beszúrást', () => {
  for (const rossz of [null, undefined, NaN, '6', 5.5, -3]) assert.equal(midStepNo(rossz), 0);
});

t('a doboz KÉT LÉPÉS KÖZÉ kerül, nem lépésen belülre', () => {
  const ki = insertMidGuide(torzs(6), 6, DOBOZ);
  assert.ok(ki.includes(DOBOZ + '<div class="g-step" id="step-4">'),
    'a doboz közvetlenül a 4. lépés ELŐTT áll');
  // A 3. lépés sértetlenül lezárult a doboz előtt.
  const elotte = ki.slice(0, ki.indexOf(DOBOZ));
  assert.ok(elotte.trimEnd().endsWith('</div>'), 'nem vág ketté egy lépést');
});

t('pontosan EGY doboz kerül be', () => {
  const ki = insertMidGuide(torzs(7), 7, DOBOZ);
  assert.equal(ki.split(DOBOZ).length - 1, 1);
});

t('a lépések szövege érintetlen marad', () => {
  const be = torzs(5);
  const ki = insertMidGuide(be, 5, DOBOZ);
  assert.equal(ki.replace(DOBOZ, ''), be, 'a doboz kivétele visszaadja az eredetit');
});

t('baj esetén VÁLTOZATLAN törzs jön vissza', () => {
  const be = torzs(6);
  assert.equal(insertMidGuide(be, 6, ''), be, 'nincs doboz');
  assert.equal(insertMidGuide(be, 3, DOBOZ), be, 'kevés lépés');
  assert.equal(insertMidGuide('<div class="valami-mas"></div>', 6, DOBOZ),
    '<div class="valami-mas"></div>', 'nem találjuk a lépés-határt → nem tippelünk');
  assert.equal(insertMidGuide('', 6, DOBOZ), '');
  assert.equal(insertMidGuide(null, 6, DOBOZ), null);
});

// --- VALÓDI, KIÉPÍTETT OLDALAKON ---
// Kitalált adaton 16 zöld teszt már egyszer elfedte, hogy a valódi cikkek
// alakja más (2026-08-25, reelCaption). Azóta minden ilyen modul végén ez áll.

t('minden élő útmutató pontosan egy közép-dobozt kap', () => {
  const p = join(ROOT, 'website', 'public', 'article');
  if (!existsSync(p)) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const utmutatok = readdirSync(p).filter(f => f.endsWith('.html'))
    .map(f => readFileSync(join(p, f), 'utf-8'))
    .filter(s => s.includes('class="g-steps"'));
  if (!utmutatok.length) { console.log('     ⏭️  kihagyva: nincs kiépített útmutató'); return; }

  let nelkul = 0, tobb = 0, lepesenBelul = 0;
  for (const s of utmutatok) {
    const lepesek = (s.match(/class="g-step" id="step-/g) || []).length;
    const dobozok = (s.match(/class="midread"/g) || []).length;
    if (lepesek < MIN_LEPES) continue;
    if (dobozok === 0) nelkul++;
    if (dobozok > 1) tobb++;
    // A doboz UTÁN közvetlenül egy lépés kezdődjön — így biztos, hogy két
    // lépés között van, nem valamelyik belsejében.
    const i = s.indexOf('<aside class="midread"');
    if (i >= 0) {
      const utana = s.slice(s.indexOf('</aside>', i) + 8).trimStart();
      if (!utana.startsWith('<div class="g-step" id="step-')) lepesenBelul++;
    }
  }
  console.log(`     📏 ${utmutatok.length} élő útmutató átnézve`);
  assert.equal(nelkul, 0, nelkul + ' útmutató maradt közép-doboz nélkül');
  assert.equal(tobb, 0, tobb + ' útmutatóban több doboz van');
  assert.equal(lepesenBelul, 0, lepesenBelul + ' dobozt nem lépés-határra tettünk');
});

console.log(`\n✅ ${pass} teszt rendben`);
