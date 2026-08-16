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
import {
  BLOCKING_CODES, issueCode, isBlocking, blockingIssues, advisoryIssues, lessonFor
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

t('🚧 a NÉGY blokkoló kód utasít el — más semmi', () => {
  for (const kod of ['NO_FRONTMATTER', 'NO_H1', 'MISSING_SECTION', 'GUIDE_TOO_SHORT']) {
    assert.ok(isBlocking(kod + ': valami'), kod + ' blokkol');
  }
  // A 2026-08-16-i ÚJ jelzések SZÁNDÉKOSAN tanácsadók: a user döntése szerint
  // "tanuljon, de ne utasítson el" — mert az elutasítás fizetős újraírás.
  for (const kod of ['HOWTO_TOO_LONG', 'OPENING_REPETITIVE', 'HOWTO_TOO_THIN', 'CLICHE']) {
    assert.ok(!isBlocking(kod + ': valami'), kod + ' NEM blokkolhat');
  }
  assert.equal(BLOCKING_CODES.length, 4, 'a lista nem nőhet észrevétlenül');
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

t('minden blokkoló kódhoz van lecke-szöveg', () => {
  for (const kod of BLOCKING_CODES) {
    assert.notEqual(lessonFor(kod + ': x'), kod, kod + ' lecke nélkül maradt');
  }
});

console.log('\n✅ auto-check-codes.test: mind a ' + pass + ' eset rendben');
