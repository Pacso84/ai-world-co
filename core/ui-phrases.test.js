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
