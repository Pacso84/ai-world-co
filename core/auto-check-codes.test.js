// ===================================================================
// TESZT — auto-kapu kódok (melyik jelzés utasít el, és mit tanulunk belőle)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-16, kódellenőrzés): a "melyik jelzés utasít el" tudás két
// helyen élt, és szétcsúszott. Az Ellenőrző négy kódot nevesített, az Író és
// az Útmutató viszont BÁRMELY jelzést komolynak vett. Amíg minden jelzés
// kritikus volt, a különbség láthatatlan maradt — az első TANÁCSADÓ jelzés
// viszont fizetős AI-újraírást indított ott, ahol ingyenes visszasorolás
// járt volna. Ez a teszt azt őrzi, hogy a kettő ne tudjon újra elválni.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOCKING_CODES, issueCode, isBlocking, blockingIssues, advisoryIssues, lessonFor, leckeNevHu
} from './auto-check-codes.js';
import { HOWTO_RANGE } from './article-length.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 auto-kapu kódok\n');

t('a "KÓD: szöveg" alakból kiszedi a kódot', () => {
  assert.equal(issueCode('NO_H1: Nincs H1 (# Cím) a cikkben'), 'NO_H1');
  assert.equal(issueCode('HOWTO_TOO_LONG: 1823 szó (~9.1 perc)'), 'HOWTO_TOO_LONG');
  assert.equal(issueCode('CSUPASZ_KOD'), 'CSUPASZ_KOD');
  assert.equal(issueCode(''), '');
  assert.equal(issueCode(null), '');
});

t('🚧 a KILENC blokkoló kód utasít el — más semmi', () => {
  // 2026-11-11: +GUIDE_UI_NOT_IN_HELP (hír-elsőbbség 3. rész: a súgóból írt útmutató a súgóban nem szereplő gombneveket állít — core/sugo-parositas.js)
  // 2026-11-10: +UI_NOT_IN_SOURCE (a hír a forrásban nem szereplő gombneveket állít — core/forras-tema.js)
  // 2026-11-10: +SOURCE_TOPIC_MISMATCH (user: „többször ne forduljanak elő” — a hír a forrásban nem szereplő eszközről szól, core/forras-tema.js)
  // 2026-11-01: +PRICE_IN_ARTICLE (user: „árakat nem közlünk!” — user-tilalom, ~1%-on tüzel, core/ar-tilalom.js)
  // 2026-11-04: +KNOWN_FALSE_CLAIM (user: „ne forduljanak elő még egyszer” — hivatalos forrással cáfolt állítás, core/ismert-tevedesek.js)
  for (const kod of ['NO_FRONTMATTER', 'NO_H1', 'MISSING_SECTION', 'GUIDE_TOO_SHORT', 'PRICE_IN_ARTICLE', 'KNOWN_FALSE_CLAIM', 'SOURCE_TOPIC_MISMATCH', 'UI_NOT_IN_SOURCE', 'GUIDE_UI_NOT_IN_HELP']) {
    assert.ok(isBlocking(kod + ': valami'), kod + ' blokkol');
  }
  // A 2026-08-16-i ÚJ jelzések SZÁNDÉKOSAN tanácsadók: a user döntése szerint
  // "tanuljon, de ne utasítson el" — mert az elutasítás fizetős újraírás.
  for (const kod of ['HOWTO_TOO_LONG', 'OPENING_REPETITIVE', 'HOWTO_TOO_THIN', 'CLICHE']) {
    assert.ok(!isBlocking(kod + ': valami'), kod + ' NEM blokkolhat');
  }
  assert.equal(BLOCKING_CODES.length, 9, 'a lista nem nőhet észrevétlenül');
});

t('💸 a tanácsadó jelzés NEM tehet fizetőssé egy ingyenes visszasorolást', () => {
  // EZ VOLT A HIBA: az Író `autoOk = !(issues?.length)`-et számolt, így egyetlen
  // tanácsadó jelzés is fizetős AI-újraírásba fordította azt a visszasorolást,
  // ami a bíró JSON-hibája után INGYENES és VÁLTOZATLAN lett volna.
  const csakTanacs = ['HOWTO_TOO_LONG: 1823 szó — …', 'OPENING_REPETITIVE: 4 kezdődik ugyanígy'];
  assert.equal(blockingIssues(csakTanacs).length, 0, 'ingyenes út marad');
  assert.equal(advisoryIssues(csakTanacs).length, 2);

  const vanValodi = ['HOWTO_TOO_LONG: 1823 szó — …', 'NO_H1: Nincs H1'];
  assert.equal(blockingIssues(vanValodi).length, 1, 'a valódi blokkoló hiba viszont számít');
  assert.equal(advisoryIssues(vanValodi).length, 1);
});

t('rossz bemenetre nem esik szét', () => {
  assert.deepEqual(blockingIssues(undefined), []);
  assert.deepEqual(blockingIssues(null), []);
  assert.deepEqual(blockingIssues('nem tömb'), []);
  assert.deepEqual(advisoryIssues(undefined), []);
});

t('📌 a lecke ÁLLANDÓ — két különböző cikk UGYANAZT tanulja', () => {
  // EZ A CSAPDA: a kézenfekvő javítás az lenne, hogy a teljes jelzést mentjük
  // leckeként. Csakhogy a szószám cikkenként más, tehát minden elutasítás ÚJ
  // emléket hozna létre a meglévő ERŐSÍTÉSE helyett — a memória felhígulna.
  // (Ugyanez vitte be korábban a "JSON parse error at position 237" sorokat.)
  const a = 'HOWTO_TOO_LONG: 1823 szó (~9.1 perc olvasás) — a cél 1000-1400 szó.';
  const b = 'HOWTO_TOO_LONG: 2044 szó (~10.2 perc olvasás) — a cél 1000-1400 szó.';
  assert.equal(lessonFor(a), lessonFor(b), 'ugyanaz a lecke → a meglévő emlék erősödik');
  assert.ok(!lessonFor(a).includes('1823'), 'a konkrét szószám a naplóé, nem a leckéé');
  assert.ok(!lessonFor(b).includes('2044'));
});

t('a lecke TANÍTHATÓ, nem puszta kód', () => {
  // Eddig a `i.split(':')[0]` miatt a memóriában ez állt: "MISSING_SECTION".
  // Az írónak ez semmit nem mond — a lecke akkor ér valamit, ha megmondja,
  // mit csináljon másképp.
  const l = lessonFor('OPENING_REPETITIVE: A legutóbbi 20 cikkből 4 kezdődik ugyanígy');
  assert.ok(l.length > 40, 'egész mondat, nem token');
  assert.ok(/start differently/i.test(l), 'megmondja, mit tegyen');
  assert.ok(!/^OPENING_REPETITIVE$/.test(l));
});

t('🔗 a hossz-lecke a core/article-length.js-ből veszi a célt', () => {
  // Ne írjuk be újra a számot — pont ez a szétcsúszás vitt ide.
  assert.ok(lessonFor('HOWTO_TOO_LONG: 1823 szó').includes(HOWTO_RANGE));
  assert.ok(lessonFor('HOWTO_TOO_THIN: 420 szó').includes(HOWTO_RANGE));
});

t('ismeretlen kódra a régi viselkedés marad (semmi nem vész el)', () => {
  assert.equal(lessonFor('VALAMI_UJ_KOD: részletek'), 'VALAMI_UJ_KOD');
});

t('🔒 az Ellenőrző MINDEN jelzéskódjához van lecke-szöveg és magyar név (2026-11-10)', () => {
  // A LEDE_TOO_LONG 07-29 óta élt lecke nélkül: az író a puszta kódot kapta, a hiba 20× ismétlődött.
  // A kódokat a VALÓDI forrásból olvassuk — új jelzés lecke nélkül itt bukik el.
  const src = readFileSync(new URL('../agents/ellenorzo/agent.js', import.meta.url), 'utf-8');
  const kodok = [...new Set([...src.matchAll(/issues\.push\(\s*[`'"]([A-Z][A-Z0-9_]{3,}):/g)].map(m => m[1]))];
  assert.ok(kodok.length >= 15, 'a kód-kereső elromlott: csak ' + kodok.length + ' kódot talált');
  assert.ok(kodok.includes('LEDE_TOO_LONG') && kodok.includes('NO_LEDE'));
  for (const kod of kodok) {
    assert.notEqual(lessonFor(kod + ': x'), kod, kod + ' lecke nélkül maradt — az író a puszta kódot kapná');
    assert.ok(leckeNevHu(kod), kod + ': nincs magyar neve a Telegram-riporthoz');
    assert.equal(leckeNevHu(lessonFor(kod + ': x')), leckeNevHu(kod), kod + ': a lecke-szövegből is megvan a magyar név');
  }
});

t('minden blokkoló kódhoz van lecke-szöveg', () => {
  for (const kod of BLOCKING_CODES) {
    assert.notEqual(lessonFor(kod + ': x'), kod, kod + ' lecke nélkül maradt');
  }
});

console.log('\n✅ auto-check-codes.test: mind a ' + pass + ' eset rendben');
