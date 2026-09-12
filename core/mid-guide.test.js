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
import { midStepNo, masodikStepNo, insertMidGuide, MIN_LEPES, MASODIK_MIN_TAVOLSAG } from './mid-guide.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOBOZ = '<aside class="midread">X</aside>';
const DOBOZ2 = '<aside class="midread">Y</aside>';
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

t('második doboz NÉLKÜL pontosan egy kerül be', () => {
  const ki = insertMidGuide(torzs(7), 7, DOBOZ);
  assert.equal(ki.split(DOBOZ).length - 1, 1);
  assert.ok(!ki.includes(DOBOZ2));
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

// ===================================================================
// MÁSODIK DOBOZ (2026-09-11)
// ===================================================================

t('a második doboz az UTOLSÓ lépés elé kerül, elég távol az elsőtől', () => {
  // Mérve az élő oldalakon: 2 lépés ≈ 19 százalékpont olvasott szöveg,
  // a hír-ágon 21 pontot fogadtunk el — ugyanaz a sűrűség.
  for (const [lepesek, varva] of [[5, 5], [6, 6], [7, 7], [11, 11]]) {
    assert.equal(masodikStepNo(lepesek), varva, lepesek + ' lépés');
    assert.ok(varva - midStepNo(lepesek) >= MASODIK_MIN_TAVOLSAG,
      lepesek + ' lépésnél a két doboz túl közel van');
  }
});

t('4 lépésnél NINCS második doboz — egymás mellé esne', () => {
  assert.equal(midStepNo(4), 3, 'az első doboz helye változatlan');
  assert.equal(masodikStepNo(4), 0, '4 lépésnél a 3. és 4. lépés közé két doboz jutna');
});

t('ahol nincs ELSŐ doboz, ott második sincs', () => {
  for (const n of [0, 1, 2, 3]) assert.equal(masodikStepNo(n), 0);
  for (const rossz of [null, undefined, NaN, '6', 5.5, -3]) assert.equal(masodikStepNo(rossz), 0);
});

t('mindkét doboz LÉPÉS-HATÁRRA kerül, a helyes sorrendben', () => {
  const ki = insertMidGuide(torzs(6), 6, DOBOZ, DOBOZ2);
  assert.ok(ki.includes(DOBOZ + '<div class="g-step" id="step-4">'), 'az első a 4. lépés előtt');
  assert.ok(ki.includes(DOBOZ2 + '<div class="g-step" id="step-6">'), 'a második a 6. lépés előtt');
  assert.ok(ki.indexOf(DOBOZ) < ki.indexOf(DOBOZ2), 'felcserélődtek');
});

t('🔴 A HÁTULRÓL-ELŐRE CSAPDA: a szöveg egyetlen karaktere sem mozdul', () => {
  // Ha elölről szúrnánk be, a MÁSODIK doboz eltolódna és egy lépés
  // KÖZEPÉRE kerülne. Ez a teszt pont azt fogja meg.
  const be = torzs(6);
  const ki = insertMidGuide(be, 6, DOBOZ, DOBOZ2);
  assert.equal(ki.replace(DOBOZ, '').replace(DOBOZ2, ''), be,
    'a két doboz kivétele nem adja vissza pontosan az eredetit');
  // És egyik doboz sem áll lépésen BELÜL: mindkettő után lépés-nyitás jön.
  for (const d of [DOBOZ, DOBOZ2]) {
    const utana = ki.slice(ki.indexOf(d) + d.length);
    assert.ok(utana.startsWith('<div class="g-step" id="step-'), 'a ' + d + ' nem lépés-határon áll');
  }
});

t('üres/hiányzó második doboz esetén CSAK az első kerül be', () => {
  const be = torzs(6);
  for (const ures of ['', null, undefined, 0, false]) {
    const ki = insertMidGuide(be, 6, DOBOZ, ures);
    assert.equal(ki.split('<aside').length - 1, 1, 'második doboz került be ebből: ' + JSON.stringify(ures));
  }
  assert.equal(insertMidGuide(be, 6, DOBOZ).split('<aside').length - 1, 1, '4. paraméter nélkül');
});

t('ha az ELSŐ doboz hiányzik, a második sem kerül be', () => {
  // Jobb egy doboz nélküli útmutató, mint egy, ahol csak a hátsó van:
  // a 38%, aki nem görget, épp attól esne el, amiért az egész készült.
  const be = torzs(6);
  assert.equal(insertMidGuide(be, 6, '', DOBOZ2), be);
});

// --- VALÓDI, KIÉPÍTETT OLDALAKON ---
// Kitalált adaton 16 zöld teszt már egyszer elfedte, hogy a valódi cikkek
// alakja más (2026-08-25, reelCaption). Azóta minden ilyen modul végén ez áll.

t('minden élő útmutató kap közép-dobozt, és mind lépés-határon áll', () => {
  const p = join(ROOT, 'website', 'public', 'article');
  if (!existsSync(p)) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const utmutatok = readdirSync(p).filter(f => f.endsWith('.html'))
    .map(f => readFileSync(join(p, f), 'utf-8'))
    .filter(s => s.includes('class="g-steps"'));
  if (!utmutatok.length) { console.log('     ⏭️  kihagyva: nincs kiépített útmutató'); return; }

  let nelkul = 0, tulSok = 0, lepesenBelul = 0, ugyanaz = 0, kettovel = 0;
  for (const s of utmutatok) {
    const lepesek = (s.match(/class="g-step" id="step-/g) || []).length;
    if (lepesek < MIN_LEPES) continue;
    const helyek = [...s.matchAll(/<aside class="midread">/g)].map(m => m.index);
    if (helyek.length === 0) nelkul++;
    // 2026-09-11 óta KETTŐ is lehet — de három sosem.
    if (helyek.length > 2) tulSok++;
    if (helyek.length === 2) kettovel++;
    const celok = [];
    for (const i of helyek) {
      const veg = s.indexOf('</aside>', i) + 8;
      // A doboz UTÁN közvetlenül egy lépés kezdődjön — így biztos, hogy két
      // lépés KÖZÖTT van, nem valamelyik belsejében.
      if (!s.slice(veg).trimStart().startsWith('<div class="g-step" id="step-')) lepesenBelul++;
      const h = /href="([^"]+)"/.exec(s.slice(i, veg));
      if (h) celok.push(h[1]);
    }
    // Két doboz ugyanarra a cikkre értelmetlen — ez a második doboz ÉRTELME.
    if (celok.length === 2 && celok[0] === celok[1]) ugyanaz++;
  }
  console.log(`     📏 ${utmutatok.length} élő útmutató átnézve · ${kettovel} kapott két dobozt`);
  assert.equal(nelkul, 0, nelkul + ' útmutató maradt közép-doboz nélkül');
  assert.equal(tulSok, 0, tulSok + ' útmutatóban kettőnél több doboz van');
  assert.equal(lepesenBelul, 0, lepesenBelul + ' dobozt nem lépés-határra tettünk');
  assert.equal(ugyanaz, 0, ugyanaz + ' útmutatóban a két doboz UGYANARRA a cikkre mutat');
});

t('🔬 VALÓDI TÖRZSEKEN: mindkét doboz a helyére kerül, a szöveg nem mozdul', () => {
  // A kitalált `torzs(n)` MINTA. Ez a teszt a 941 kiépített oldal VALÓDI
  // HTML-jén futtatja ugyanazt a függvényt — a projekt leckéje szerint
  // (2026-08-25, reelCaption) a kitalált adaton zöld teszt elfedheti, hogy
  // az éles alak más.
  const p = join(ROOT, 'website', 'public', 'article');
  if (!existsSync(p)) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const fajlok = readdirSync(p).filter(f => f.endsWith('.html'));
  let vizsgalt = 0, ketDoboz = 0;
  const hiba = [];
  for (const f of fajlok) {
    const h = readFileSync(join(p, f), 'utf-8');
    if (!h.includes('class="g-steps"')) continue;
    // A meglévő dobozt kivesszük, hogy tiszta törzsön mérjünk.
    const tiszta = h.replace(/<aside class="midread">[\s\S]*?<\/aside>/g, '');
    const lepesek = (tiszta.match(/<div class="g-step" id="step-\d+">/g) || []).length;
    if (lepesek < MIN_LEPES) continue;
    vizsgalt++;
    const no1 = midStepNo(lepesek), no2 = masodikStepNo(lepesek);
    const ki = insertMidGuide(tiszta, lepesek, DOBOZ, DOBOZ2);
    if (!ki.includes(DOBOZ + `<div class="g-step" id="step-${no1}">`)) hiba.push(f + ' · 1. doboz nem a(z) ' + no1 + '. lépés előtt');
    if (no2) {
      ketDoboz++;
      if (!ki.includes(DOBOZ2 + `<div class="g-step" id="step-${no2}">`)) hiba.push(f + ' · 2. doboz nem a(z) ' + no2 + '. lépés előtt');
      if (ki.indexOf(DOBOZ) >= ki.indexOf(DOBOZ2)) hiba.push(f + ' · felcserélt sorrend');
    }
    if (ki.replace(DOBOZ, '').replace(DOBOZ2, '') !== tiszta) hiba.push(f + ' · a szöveg ELMOZDULT');
  }
  const arany = vizsgalt ? Math.round(ketDoboz / vizsgalt * 100) : 0;
  console.log(`     📏 ${vizsgalt} valódi útmutató-törzs · ${ketDoboz} kapna két dobozt (${arany}%)`);
  assert.deepEqual(hiba.slice(0, 5), [], hiba.length + ' hibás oldal');
  assert.ok(arany >= 90, 'a valódi útmutatóknak csak ' + arany + '%-a kapna második dobozt — vártunk 90%+');
});

t('🔌 BEKÖTÉS-ŐR: a build.js MINDKÉT sablonnak átadja a dobozokat', () => {
  // Ez a hiba HÁROMSZOR fordult elő ugyanebben a fájlban (08-25 közép-doboz,
  // 09-09 támogatás-sor, 09-10 második doboz): a javítás elkészült, de a KÉT
  // cikk-sablon közül csak az egyikbe került be, és kívülről zöldnek látszott.
  // ⚠️ A KOMMENTEKET KIVÁGJUK: egy korábbi bekötés-őr egy KOMMENTRE
  // illeszkedett, és zöld maradt, miközben a valódi hívás ki volt véve.
  // ⚠️ Sorvég-normalizálás — lásd core/guide-autolink.test.js indoklását.
  const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8')
    .replace(/\r\n/g, '\n')
    .split('\n').filter(sor => !/^\s*\/\//.test(sor)).join('\n');

  // --- ÚTMUTATÓ-ÁG ---
  const hivas = /insertMidGuide\s*\(([\s\S]{0,400}?)\)\s*;/.exec(src);
  assert.ok(hivas, '🔴 a build.js NEM hívja az insertMidGuide-ot');
  const args = hivas[1];
  assert.ok(/midReadBox\s*\(\s*a\s*\)/.test(args), '🔴 az ELSŐ doboz nem megy át az útmutatónak');
  assert.ok(/midReadBox\s*\(\s*a\s*,\s*1\s*\)/.test(args),
    '🔴 a MÁSODIK doboz nem megy át az ÚTMUTATÓ-sablonnak — 429 útmutató, a belépők 61%-a érkezik ide');
  assert.ok(args.indexOf('midReadBox(a)') < args.indexOf('midReadBox(a, 1)'),
    '🔴 felcserélt argumentumok: a másodlagos ajánló kerülne a szöveg felére');

  // --- HÍR-ÁG: a magáét se veszítse el ---
  const wm = src.indexOf('function withMidRead');
  assert.ok(wm > 0, '🔴 a withMidRead eltűnt a build.js-ből');
  const hirAg = src.slice(wm, wm + 3000);
  assert.ok(/midReadBox\s*\(\s*a\s*,\s*1\s*\)/.test(hirAg),
    '🔴 a HÍR-ágról tűnt el a második doboz');
});


