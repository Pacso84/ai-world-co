// ===================================================================
// MAGYAR HELYESÍRÁS — a döntés-tár oda-vissza olvasása (tesztek)
// ===================================================================
//
// MIÉRT LÉTEZIK EZ A FÁJL (2026-08-21). Az őrszem egy elrontott
// fájlválasztás miatt 773 magyar cikkből 12-t nézett — mindig UGYANAZT a
// 12-t, mert a readdirSync névsorrendet ad, nem időrendet (mérve: 0/12
// átfedés a valóban legfrissebbekkel). Erre minden futásban „0 megítélendő
// szóalak"-ot jelentett, és a CI-naplóban ez zöldnek látszott.
//
// A javítás két része közül ez a fájl a MÁSODIKAT őrzi: a pásztázás
// LEFEDETTSÉGE (`scan`) jusson el a napi riportig. Ha némán elveszik útközben,
// a riport visszaesik a szám nélküli sorra — és a vakság megint zöld lesz.
// Elsőre pontosan ez történt: csak a mentést kötöttem be, az olvasás eldobta.
// ===================================================================

import assert from 'assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadStore, saveStore } from './hu-review.js';
import { applyVerdicts } from './hu-proofread.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 magyar helyesírás — döntés-tár\n');

// Ideiglenes tár: az ÉLES memory/hu-word-verdicts.json-hoz nem nyúlunk.
const dir = mkdtempSync(join(tmpdir(), 'hu-store-'));
const utvonal = join(dir, 'tar.json');

t('🔎 a pásztázás LEFEDETTSÉGE túléli a mentés→olvasás kört', () => {
  saveStore({ ok: ['alma'], fix: {}, review: {}, scan: { at: '2026-08-21', files: 773, candidates: 192 } }, utvonal);
  const vissza = loadStore(utvonal);
  assert.equal(vissza.scan.files, 773, 'enélkül a riport nem tudja, mekkora volt a pásztázás');
  assert.equal(vissza.scan.candidates, 192);
});

t('az ítéletek is megmaradnak (a bélyeg nem szoríthatja ki őket)', () => {
  saveStore({
    ok: ['körte', 'alma'],
    fix: { 'többiünknek': { correct: 'többieknek' } },
    review: { asksz: { correct: 'kérdezel' } },
    scan: { files: 5, candidates: 1 }
  }, utvonal);
  const v = loadStore(utvonal);
  assert.deepEqual(v.ok, ['alma', 'körte'], 'rendezve mentünk — a diff így olvasható marad');
  assert.equal(v.fix['többiünknek'].correct, 'többieknek');
  assert.equal(v.review.asksz.correct, 'kérdezel');
});

t('🧬 az ÍTÉLET-BEOLVASZTÁS sem ejtheti el a bélyeget', () => {
  // Ez fogta meg élesben: a bélyeg mentődött, majd az első applyVerdicts
  // újraépítette a tárat {ok, fix, review}-ra, és a bélyeg eltűnt. A riport
  // némán visszaesett a szám nélküli sorra — a vakság megint zöld lett.
  const utan = applyVerdicts(
    { ok: [], fix: {}, review: {}, scan: { files: 773, candidates: 192 } },
    [{ word: 'asksz', ok: false, correct: 'kérdezel', fixable: true }]
  );
  assert.equal(utan.scan.files, 773);
});

t('🧬 ISMERETLEN mező is túléli mindhárom lépést — a következő bélyeg védelme', () => {
  // Nem a `scan`-t védjük, hanem a MINTÁT: három függvény építi újra a tár
  // alakját, és mindegyik csak a három ismert mezőt sorolta fel. Ha a negyedik
  // mező felvételekor bárhol kimarad egy felsorolás, ez a teszt szól.
  const be = { ok: [], fix: {}, review: {}, jovobeli_mezo: 'maradj meg' };
  saveStore(applyVerdicts(be, []), utvonal);
  assert.equal(loadStore(utvonal).jovobeli_mezo, 'maradj meg');
});

t('bélyeg nélküli RÉGI tár nem borul fel', () => {
  writeFileSync(utvonal, JSON.stringify({ ok: ['alma'], fix: {}, review: {} }), 'utf-8');
  const v = loadStore(utvonal);
  assert.deepEqual(v.ok, ['alma']);
  assert.equal(v.scan, undefined, 'ne találjunk ki bélyeget, ami nem volt');
});

t('a bélyeg nélküli mentés nem ír ki üres scan mezőt', () => {
  saveStore({ ok: [], fix: {}, review: {} }, utvonal);
  const nyers = JSON.parse(readFileSync(utvonal, 'utf-8'));
  assert.ok(!('scan' in nyers), 'a hiányzó adat maradjon hiányzó, ne legyen belőle null');
});

t('sérült fájlra üres tárat adunk, nem borulunk', () => {
  writeFileSync(utvonal, '{ ez nem json', 'utf-8');
  const v = loadStore(utvonal);
  assert.deepEqual(v, { ok: [], fix: {}, review: {} });
});

rmSync(dir, { recursive: true, force: true });
console.log('\n✅ hu-review.test: mind a ' + pass + ' eset rendben');
