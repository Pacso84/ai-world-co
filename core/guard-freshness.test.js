// ===================================================================
// TESZT — őrszem-frissesség
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-29, hibavadászat): a `core/daily-report.js` NYOLC
// őrszem-állapotfájlt olvas be, de MINDEGYIKBŐL csak a `problems` tömböt —
// az `at` időbélyeget EGYIKBŐL SEM nézi meg.
//
// 🔑 A KÁR: ha egy őrszem lefagy (pl. a `core/seo-guard.js:337` bukott build
// esetén VISSZATÉR az állapot kiírása előtt; a `live-guard.js` kivételnél
// szintén nem ír), akkor a lemezen ott marad az ELŐZŐ futás `problems: []`-je.
// A riport ezt „minden rendben"-nek olvassa. A lefagyott őrszem és a tényleg
// tiszta rendszer KÍVÜLRŐL EGYFORMÁN NÉZ KI — ez a projekt visszatérő
// hibamintázata (témaismétlés-őr, hír-összevonás, őrkutya).
//
// A döntés azért külön modulban él, mert a `daily-report.js`-t nem lehet
// importálni (feltétel nélküli `main()`).
// ===================================================================

import assert from 'assert/strict';
import { elavultOrszemek, frissessegSor, ELAVULT_ORA } from './guard-freshness.js';

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const MOST = Date.parse('2026-08-30T10:00:00Z');
const oraval = h => new Date(MOST - h * 3600e3).toISOString();

console.log('🧪 őrszem-frissesség\n');

t('A MAI VALÓSÁG: 7,6 órás őrszemek → nincs panasz', () => {
  // Élesben mérve 2026-08-30-án: mind a 8 fájl 7,5-7,6 órás (az utolsó CI-futás).
  const g = { seo: { at: oraval(7.6) }, live: { at: oraval(7.5) }, kep: { at: oraval(7.6) } };
  assert.deepEqual(elavultOrszemek(g, MOST), []);
});

t('🕰️ a LEFAGYOTT őrszem kiderül', () => {
  const g = { seo: { at: oraval(7.6) }, live: { at: oraval(50) } };
  const e = elavultOrszemek(g, MOST);
  assert.equal(e.length, 1, JSON.stringify(e));
  assert.equal(e[0].nev, 'live');
  assert.ok(e[0].kor > 49 && e[0].kor < 51, 'rossz kor: ' + e[0].kor);
});

t('a küszöb két oldalán', () => {
  assert.deepEqual(elavultOrszemek({ a: { at: oraval(ELAVULT_ORA - 0.1) } }, MOST), []);
  assert.equal(elavultOrszemek({ a: { at: oraval(ELAVULT_ORA + 0.1) } }, MOST).length, 1);
});

t('⚠️ a HIÁNYZÓ időbélyeg NEM „friss" — de nem is riasztás', () => {
  // A `reel-guard.json`-ban nincs `problems` mező, másban hiányozhat az `at`.
  // A „nem tudom" nem lehet se néma jóváhagyás, se hamis vészjelzés: külön
  // jelöljük, hogy látszódjon.
  const e = elavultOrszemek({ a: {}, b: { at: null }, c: { at: 'hopp' } }, MOST);
  assert.equal(e.length, 3, JSON.stringify(e));
  for (const x of e) assert.equal(x.kor, null, 'kitalált kort adott: ' + JSON.stringify(x));
});

t('JÖVŐBELI időbélyegre nem riaszt (óra-eltérés)', () => {
  assert.deepEqual(elavultOrszemek({ a: { at: oraval(-3) } }, MOST), []);
});

t('a sor MEGNEVEZI, melyik őrszem és mióta', () => {
  const sor = frissessegSor([{ nev: 'seo', kor: 50.2 }, { nev: 'live', kor: null }]);
  assert.ok(sor.includes('seo') && sor.includes('live'), sor);
  assert.ok(sor.includes('50'), 'nincs benne a kor: ' + sor);
  assert.ok(sor.startsWith('⚠️'), 'a vészjelzés-mintára kell illeszkednie: ' + sor);
  assert.equal(frissessegSor([]), '', 'üresre is írt valamit');
});

t('hibás bemenetre nem borul', () => {
  for (const rossz of [null, undefined, 'hopp', 42, []]) {
    assert.doesNotThrow(() => elavultOrszemek(rossz, MOST));
  }
  assert.doesNotThrow(() => frissessegSor(null));
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} guard-freshness.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
