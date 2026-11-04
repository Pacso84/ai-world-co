// ===================================================================
// TESZT — angol felület-frázisok a nem-angol oldalakon
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-11): az i18n-őrszem első éjszakája, amikor a leletei
// eljutottak a napi riportig. Rögtön két találatot adott — és mindkettő
// HAMIS RIASZTÁS volt. A Cohere-útmutató ezt írja:
//
//   click the item labeled "Playground" (it may also be called "Try it now")
//
// A "Try it now" itt egy IDEGEN TERMÉK GOMBJÁNAK A NEVE, idézőjelben. Épp
// hogy NEM szabad lefordítani: a magyar olvasó az angol felületen fogja
// keresni. Ha ezt foltnak vesszük, a riport minden nap zajt küld — a user
// kimondott szabálya viszont: "ne küldjön valótlan adatokat".
// ===================================================================

import assert from 'assert/strict';
import { chromePhraseHits } from './ui-phrases.js';

const P = ['try it now', 'min read', 'back to all stories'];
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 felület-frázisok\n');

t('a SAJÁT lefordítatlan feliratunkat megfogja', () => {
  // Ez az eredeti cél: a mi UI-nk angolul maradt darabja.
  const s = 'kezdőlap · 5 min read · vissza a hírekhez';
  assert.deepEqual(chromePhraseHits(s, P), ['min read']);
});

t('az IDÉZŐJELES gombnevet NEM fogja meg (2026-08-11)', () => {
  // A valódi eset, szó szerint a Cohere-útmutatóból.
  const s = 'kattints a "Playground" elemre (néha "Try it now" néven szerepel)';
  assert.deepEqual(chromePhraseHits(s, P), [], 'idézett gombnév nem felület-folt');
});

t('magyar és spanyol idézőjelek is számítanak', () => {
  assert.deepEqual(chromePhraseHits('keresd a „Try it now" gombot', P), []);
  assert.deepEqual(chromePhraseHits('busca el «Try it now»', P), []);
  assert.deepEqual(chromePhraseHits("gomb: 'Try it now' felirattal", P), []);
});

t('HTML-ENTITÁS is idézőjel (az éles szöveg így néz ki)', () => {
  // Szó szerint a 2026-08-11-i lelet a kész oldalról. A záró idézőjel a
  // HTML-ben entitásként áll — az első javításom emiatt NEM fogta meg, és
  // az őrszem tovább jelzett. A kitalált tesztszöveg átment, az éles nem.
  const eles = 'kattints a „Playground&quot; feliratú elemre (más néven „Try it now&quot;)';
  assert.deepEqual(chromePhraseHits(eles, P), [], 'az entitásos idézet sem folt');
  assert.deepEqual(chromePhraseHits('a &laquo;Try it now&raquo; gomb', P), []);
  assert.deepEqual(chromePhraseHits('a &#8222;Try it now&#8221; gomb', P), []);
});

t('idézőjel nélkül ugyanaz a szöveg VISZONT folt', () => {
  // Ha nincs idézőjel, az a mi feliratunk — azt meg kell fogni.
  assert.deepEqual(chromePhraseHits('try it now és nézz körül', P), ['try it now']);
});

t('egy idézet nem némítja el a többi találatot', () => {
  const s = 'a "Try it now" gomb · 5 min read';
  assert.deepEqual(chromePhraseHits(s, P), ['min read']);
});

t('szóhatárt tart (a hashtag és az összetétel nem folt)', () => {
  assert.deepEqual(chromePhraseHits('#advanced tryitnowadays', P), []);
});

t('🔑 a TÖBB SZAVAS hashtag sem folt (élesben 4 téves riasztást adott)', () => {
  // VALÓDI ESET, 2026-09-09: az i18n-őrszem 4 leletet jelentett magyar és
  // spanyol cikkeken — mindegyik a `#ai-for-everyone` CÍMKÉBŐL jött.
  //
  // A minta `(?<![a-z#])for[-\s]everyone(?![a-z])` volt. A címkében a „for"
  // előtti karakter egy KÖTŐJEL: a visszatekintés a betűt és a `#`-et zárta
  // ki, a kötőjelet NEM. Így a hashtag-kizárás csak akkor működött, ha a
  // frázis KÖZVETLENÜL a `#` után kezdődött (`#advanced`) — több szavas
  // szlognál nem. A szándék jó volt (lásd a modul kommentjét), a
  // megvalósítás egy karakterrel rövidebb.
  //
  // 🔑 Ez nem a fordítás hibája volt, hanem a MÉRŐESZKÖZÉ — és egy őr, ami
  // nem-tennivalóra szól, zaj: a hamis riasztásban a valódi lelet vész el.
  assert.deepEqual(chromePhraseHits('#ai-for-everyone', ['for everyone']), []);
  assert.deepEqual(chromePhraseHits('<span>#ai-for-everyone</span>', ['for everyone']), []);
  // Az ELLENPÉLDA ugyanolyan fontos: a valódi, szabadon álló felirat MARAD folt.
  assert.deepEqual(chromePhraseHits('AI for everyone', ['for everyone']), ['for everyone']);
  assert.deepEqual(chromePhraseHits('Made for everyone.', ['for everyone']), ['for everyone']);
});

t('🔑 a HOSSZABB idézett gombnév BELSEJE sem folt (élesben 2 téves riasztás)', () => {
  // VALÓDI ESET, 2026-09-09: a magyar cikk a ChatGPT gombfeliratát idézi —
  //   „Improve model for everyone" (a modell fejlesztése mindenki számára)
  // — és zárójelben adja a magyar magyarázatot. Ez PONTOSAN HELYES: egy
  // képernyőn keresendő gombnevet nem szabad lefordítani.
  //
  // A modulnak volt szabálya az idézett gombnévre, de csak akkor fogott, ha
  // a frázis PONTOSAN a két idézőjel közt állt. Itt a „for everyone" egy
  // HOSSZABB idézet belsejében van: előtte szóköz, utána idézőjel — így a
  // szomszéd-vizsgálat elvétette.
  const P2 = ['for everyone'];
  assert.deepEqual(chromePhraseHits('az „Improve model for everyone" kapcsolót keresd', P2), []);
  assert.deepEqual(chromePhraseHits('the "Improve model for everyone" toggle', P2), []);
  assert.deepEqual(chromePhraseHits('busca «Improve model for everyone» abajo', P2), []);
  // ⚠️ AZ ELLENPÉLDA: idézet NÉLKÜL ugyanaz a szöveg VISZONT folt.
  assert.deepEqual(chromePhraseHits('Improve model for everyone', P2), ['for everyone']);
  // És egy távoli, LEZÁRT idézet nem némítja el a későbbi valódi találatot.
  assert.deepEqual(chromePhraseHits('a "Try it now" gomb, majd sokkal később: for everyone', P2), ['for everyone']);
});

t('🔑 a frázis UTÁN álló NYITÓ idézőjel nem némít (mutációval találtam)', () => {
  // Ha a záró-keresés minden idézőjelet „zárónak" venne, egy KÖVETKEZŐ idézet
  // kezdete elnémítaná a valódi foltot. Itt a folt két idézet KÖZÖTT áll,
  // nem BENNE — ez a mi lefordítatlan feliratunk, jelezni kell.
  const P2 = ['for everyone'];
  assert.deepEqual(chromePhraseHits('„egyik" majd for everyone «másik»', P2), ['for everyone']);
});

t('🔑 a TÁVOLI záró idézőjel nem némít — az ablak szűk (mutációval találtam)', () => {
  // Az idézett gombnevek rövidek. Ha az ablak tágra nyílna, két egymástól
  // messze eső idézet közé eső VALÓDI folt is elnémulna. A tömítés 70
  // karakter — a 60-as ablakon kívül.
  const P2 = ['for everyone'];
  const tomites = '. '.repeat(35);                       // 70 karakter
  assert.deepEqual(chromePhraseHits('„x" for everyone' + tomites + '»', P2), ['for everyone']);
});

t('minden frázist csak egyszer sorol fel', () => {
  const s = 'min read ... min read ... min read';
  assert.deepEqual(chromePhraseHits(s, P), ['min read']);
});

t('üres bemenet', () => {
  assert.deepEqual(chromePhraseHits('', P), []);
  assert.deepEqual(chromePhraseHits(null, P), []);
  assert.deepEqual(chromePhraseHits('valami', null), []);
});

console.log('\n✅ ui-phrases.test: mind a ' + pass + ' eset rendben');
