// ===================================================================
// A VALÓDI SZÓTÁR — füst-teszt
// ===================================================================
// Ingyenes és hálózat nélküli (a szótár a node_modules-ban van).
// MIÉRT KELL: a többi teszt HAMIS szótárral dolgozik, tehát egyik sem
// bizonyítja, hogy az ÉLES szótár megfogja a valódi hibáinkat. Ez igen.
// ===================================================================

import assert from 'assert/strict';
import { loadHuChecker } from './hu-dictionaries.js';
import { extractCandidates } from './hu-spellcheck.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 valódi magyar szótár\n');

const { isKnownWord } = await loadHuChecker();

t('🎯 a HÁROM valódi hibánkat megfogja', () => {
  // Mind a három ebből az egy élő cikkből való (2026-08-20):
  // a „többiünknek"-et a user vette észre, a másik kettőt a gép találta.
  for (const w of ['többiünknek', 'hetodból', 'bízasz']) {
    assert.equal(isKnownWord(w), false, `${w} — ezt jelölnie kell`);
  }
});

t('a helyes változatokat átengedi', () => {
  for (const w of ['többieknek', 'hetedből', 'bízol', 'kutyát', 'embert', 'házat']) {
    assert.equal(isKnownWord(w), true, `${w} — ez helyes, nem szabad jelölnie`);
  }
});

t('az idézett ANGOL szakszót átengedi', () => {
  for (const w of ['workflows', 'datasets', 'lifestyle', 'software']) {
    assert.equal(isKnownWord(w), true, `${w} — angol szakszó, nem hiba`);
  }
});

t('⚠️ A SZÓTÁR HÉZAGOS — ezért NEM ez a lépcső dönt', () => {
  // Ez a teszt a KORLÁTOT rögzíti, nem a képességet. Mind a három szó HELYES,
  // a szótár mégis elutasítja: két magyar ragozási hézag és egy friss angol
  // összetétel. Ha valaha ez a lépcső egyedül buktatna fordítást, ezek miatt
  // jó cikkek vesznének el, és ANGOL szöveg maradna kint a magyar oldalon.
  // Ezért van a második lépcső (core/hu-proofread.js), és ezért csak az
  // egyszer MEGÍTÉLT hiba blokkol.
  for (const w of ['szöveget', 'nekünk', 'backend']) {
    assert.equal(isKnownWord(w), false, `${w} — ha ez már ✅, a hézag bezárult`);
  }
});

t('🔗 a teljes lánc: cikkből a hibás szó jelölt lesz', () => {
  const md = '---\ntitle: "Mit jelent ez a többiünknek?"\n---\n\nVálassz feladatot a saját hetodból.';
  const jeloltek = extractCandidates(md, { isKnownWord }).map(c => c.word);
  assert.ok(jeloltek.includes('többiünknek'), 'a CÍM hibája is kell');
  assert.ok(jeloltek.includes('hetodból'), 'a TÖRZS hibája is kell');
});

console.log('\n✅ hu-dictionaries.test: mind a ' + pass + ' eset rendben');
