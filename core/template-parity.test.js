// ===================================================================
// TESZT — paritás-őr: a két cikk-sablon nem sodródhat el egymástól
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A döntés a core/template-parity.js-ben lakik; a friss kimeneten a CI-ban
// a build UTÁN a core/output-guard.js futtatja.
//
// ⚠️ MI VÁLTOZOTT 2026-09-12-én, ÉS MIÉRT:
// Az előző változat CSAK a `website/public/` kiépített lapjain ellenőrzött.
// Kiderült, hogy friss kimenetet sehol nem látott:
//   • a CI-ban a „Tesztek" lépés a BUILD ELŐTT fut, a public/ gitignore-os →
//     nem létezik → minden állítás „kihagyva", a futás mégis „zöld";
//   • helyben a public/ egy 2026-09-09-i BEFAGYOTT build volt — az állítások
//     három napos kódot mértek. Friss élő mintán ellenőrizve ugyanez az
//     elemzés MÁS eredményt adott, mint a helyi másolaton.
// Ezért most két rétegben dolgozik:
//   1. KITALÁLT LAPOKON — mindig fut, mindenhol foga van (a CI-ban is);
//   2. HELYI KIMENETEN — CSAK ha friss (core/built-output.js dönti el).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  paritasElemzes, cikkRegio, CSAK_HIR, FOLYAMATBAN, TAG_SZANDEKOS, JELEN
} from './template-parity.js';
import { kimenetAllapot } from './built-output.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 paritás-őr: hír ↔ útmutató\n');

// --- KITALÁLT LAPOK -------------------------------------------------
// A két alap-lap tag- és osztálykészlete SZÁNDÉKOSAN azonos (a műfaji
// guide/g-steps kivételével), így minden teszt pontosan egy eltérést ad hozzá.
const hirLap = (extra = '') => '<header class="csak-fejlec"></header><article class="article">'
  + '<div class="kozos"><p>szöveg</p></div>' + extra
  + '</article><footer class="site-footer"><div class="csak-lablec"></div></footer>';
const utmLap = (extra = '') => '<article class="article guide"><div class="g-steps">'
  + '<div class="kozos"><p>szöveg</p></div></div>' + extra
  + '</article><footer class="site-footer"></footer>';
const sok = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

t('azonos sablonok → nincs eltérés', () => {
  const e = paritasElemzes([...sok(60, () => hirLap()), ...sok(60, () => utmLap())]);
  assert.equal(e.elegendo, true);
  assert.deepEqual([e.ismeretlenHir, e.ismeretlenUtm, e.ismeretlenTag, e.megjavult], [[], [], [], []]);
});

t('🔴 ÚJ, csak a hírbe bekötött funkció → megszólal', () => {
  // A négy eddigi hiba MIND ilyen alakú volt.
  const e = paritasElemzes([...sok(60, () => hirLap('<div class="uj-funkcio"></div>')), ...sok(60, () => utmLap())]);
  assert.deepEqual(e.ismeretlenHir, ['uj-funkcio']);
});

t('⚠️ ISMERT VAKFOLT: a küszöb alatti (20%-os) eltérést nem látja', () => {
  // Ezt a teszt DOKUMENTÁLJA, nem javítja. Ha valaki lejjebb viszi a küszöböt,
  // itt derül ki, hogy a viselkedés megváltozott.
  const hirek = sok(60, (i) => hirLap(i < 12 ? '<div class="ritka-funkcio"></div>' : ''));
  const e = paritasElemzes([...hirek, ...sok(60, () => utmLap())]);
  assert.ok(12 / 60 < JELEN);
  assert.deepEqual(e.ismeretlenHir, []);
});

t('az útmutató MŰFAJI többlete (g-*) nem lelet', () => {
  const e = paritasElemzes([...sok(60, () => hirLap()), ...sok(60, () => utmLap('<div class="g-ujdonsag"></div>'))]);
  assert.ok(e.csakUtm.includes('g-ujdonsag'));
  assert.deepEqual(e.ismeretlenUtm, []);
});

t('🔴 NEM műfaji, csak az útmutatóban lévő elem → lelet (a HÍRBŐL maradt ki)', () => {
  const e = paritasElemzes([...sok(60, () => hirLap()), ...sok(60, () => utmLap('<div class="kimaradt-a-hirbol"></div>'))]);
  assert.deepEqual(e.ismeretlenUtm, ['kimaradt-a-hirbol']);
});

t('a SZÁNDÉKOS csak-hír elem nem lelet', () => {
  const e = paritasElemzes([...sok(60, () => hirLap('<div class="article__body"></div>')), ...sok(60, () => utmLap())]);
  assert.ok(e.csakHir.includes('article__body'));
  assert.deepEqual(e.ismeretlenHir, []);
});

t('🔔 a FOLYAMATBAN mechanizmus: jelez, amikor egy átmenet megjavul', () => {
  const folyamatban = { 'x-atmenet': 'teszt-bejegyzés — a mechanizmus próbájához, legalább negyven karakter' };
  // még csak a hírben → nem lelet, nem is megjavult
  const a = paritasElemzes([...sok(60, () => hirLap('<div class="x-atmenet"></div>')), ...sok(60, () => utmLap())], { folyamatban });
  assert.deepEqual([a.ismeretlenHir, a.megjavult], [[], []]);
  // már mindkettőben → megjavult, törölhető
  const b = paritasElemzes([...sok(60, () => hirLap('<div class="x-atmenet"></div>')), ...sok(60, () => utmLap('<div class="x-atmenet"></div>'))], { folyamatban });
  assert.deepEqual(b.megjavult, ['x-atmenet']);
});

t('tag-eltérés: a szándékos (GYIK) nem lelet, az ismeretlen igen', () => {
  const e = paritasElemzes([
    ...sok(60, () => hirLap('<video></video>')),
    ...sok(60, () => utmLap('<details><summary>k</summary></details>'))
  ]);
  assert.deepEqual(e.ismeretlenTag, ['video']);
});

t('a fejléc és a lábléc nem számít bele', () => {
  const e = paritasElemzes([...sok(60, () => hirLap()), ...sok(60, () => utmLap())]);
  assert.ok(!e.csakHir.includes('csak-fejlec') && !e.csakHir.includes('csak-lablec'));
  assert.equal(cikkRegio('<div class="x"></div>'), '', 'article nélkül nincs cikk-régió');
});

t('kevés lapon nem mondunk ítéletet', () => {
  assert.equal(paritasElemzes([...sok(10, () => hirLap()), ...sok(10, () => utmLap())]).elegendo, false);
  assert.equal(paritasElemzes(sok(60, () => hirLap())).utmutato, 0);
});

t('minden felsorolt eltérés mellett VAN indok', () => {
  // Egy üres vagy odavetett indok ugyanolyan rossz, mint a hiányzó — ez az
  // állítás 2026-09-12-én azonnal elkapta egy lusta bejegyzésemet.
  for (const [n, lista] of [['CSAK_HIR', CSAK_HIR], ['FOLYAMATBAN', FOLYAMATBAN], ['TAG', TAG_SZANDEKOS]])
    for (const [k, indok] of Object.entries(lista))
      assert.ok(typeof indok === 'string' && indok.length >= 40,
        '🔴 ' + n + '.' + k + ' indoka túl rövid vagy hiányzik — mondd meg, MIÉRT szándékos');
});

// --- HELYI KIÉPÍTETT KIMENET — csak ha FRISS ------------------------
t('a helyi kiépített kimeneten (ha friss)', () => {
  // PARITY_PUB_DIR: a mutációs próba ide egy MÁSOLATOT ad be.
  const allapot = kimenetAllapot(ROOT, { pubDir: process.env.PARITY_PUB_DIR || null });
  if (!allapot.hasznalhato) { console.log('     ⏭️  kihagyva: ' + allapot.ok); return; }
  const lapok = readdirSync(allapot.pub).filter(f => f.endsWith('.html'))
    .map(f => readFileSync(join(allapot.pub, f), 'utf-8'));
  const e = paritasElemzes(lapok);
  console.log(`     📏 ${e.hir} hír · ${e.utmutato} útmutató`);
  assert.ok(e.elegendo, 'túl kevés lap az összevetéshez');
  assert.deepEqual(e.ismeretlenHir, [],
    '🔴 ÚJ, MEG NEM MAGYARÁZOTT eltérés — a hírben van, az útmutatóban nincs: ' + e.ismeretlenHir.join(', '));
  assert.deepEqual(e.ismeretlenUtm, [], '🔴 nem műfaji csak-útmutató elem: ' + e.ismeretlenUtm.join(', '));
  assert.deepEqual(e.ismeretlenTag, [], '🔴 meg nem magyarázott tag-eltérés: ' + e.ismeretlenTag.join(', '));
  assert.deepEqual(e.megjavult, [], '✅ MEGJAVULT: ' + e.megjavult.join(', ') + ' — töröld a FOLYAMATBAN listából');
});

console.log(`\n✅ ${pass} teszt rendben`);
