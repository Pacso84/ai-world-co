// ===================================================================
// TESZT — teszt-higiénia: nem szemetel-e egy teszt a repóba?
// ===================================================================
// INGYENES, hálózat nélküli. Csak SZÖVEGET olvas.
//
// MI TÖRTÉNT (2026-09-07, élesben):
// Két tesztem az „írhatatlan útvonal" esetet egy meghajtóbetűs karakterlánccal
// próbálta (Z-meghajtó, nem létező mappával). Windowson ez nem létező
// meghajtó → ENOENT, tehát helyben MINDIG zöld volt.
//
// LINUXON viszont ugyanez egy közönséges RELATÍV MAPPA. Amikor 2026-09-06-án
// a CI elkezdett teszteket futtatni, a teszt LÉTREHOZTA a mappát a repóban, a
// kiadási lánc `git add -A`-ja pedig BECOMMITOLTA. Utána a kettőspontos
// fájlnév miatt egyetlen Windows-gép sem tudta kicsekkolni a repót:
//     error: invalid path ...
//
// 🔑 A TANULSÁG: egy „biztosan érvénytelen" útvonal a MÁSIK rendszeren
// tökéletesen érvényes lehet. A hordozható változat egy LÉTEZŐ FÁJL alá
// mutat — a szülő nem mappa, tehát mindkét rendszeren ENOTDIR (kimérve):
//
//     join(fileURLToPath(import.meta.url), 'nem-mappa', 'x.json')
//
// ⚠️ AMIT EZ AZ ŐR NEM LÁT: a futásidőben ÖSSZERAKOTT útvonalakat, és a
// KOMMENTEKET (azokat szándékosan kiszűrjük — a fenti tanulságot le kell
// tudni írni anélkül, hogy a saját őrünk elbuktatná). A teljes fedezet az
// lenne, ha a CI a tesztek UTÁN ellenőrizné, hogy a munkafa tiszta maradt-e.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ONMAGA = 'test-hygiene.test.js';

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 teszt-higiénia — szemetel-e egy teszt a repóba\n');

/** A kommentsorok nélküli forrás: a tanulságot PRÓZÁBAN le kell tudni írni. */
const kodSorok = forras => forras
  .split(/\r?\n/)
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

const tesztFajlok = () => readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js') && f !== ONMAGA)
  .map(f => ({ nev: f, kod: kodSorok(readFileSync(join(__dirname, f), 'utf-8')) }));

// Meghajtóbetűs útvonal-karakterlánc: Windowson meghajtó, Linuxon relatív mappa.
const MEGHAJTO_RX = /['"][A-Za-z]:[\\/][^'"]*['"]/g;

t('🔑 egyetlen teszt sem használ MEGHAJTÓBETŰS útvonal-karakterláncot', () => {
  const talalatok = [];
  for (const { nev, kod } of tesztFajlok()) {
    for (const m of kod.match(MEGHAJTO_RX) || []) talalatok.push(`${nev}: ${m}`);
  }
  assert.deepEqual(talalatok, [],
    'meghajtóbetűs útvonal a tesztben — Linuxon ez RELATÍV MAPPA lesz a repóban, '
    + 'és a CI `git add -A`-ja becommitolja:\n     ' + talalatok.join('\n     '));
});

t('⚠️ a mérőeszköz TÉNYLEG lát teszteket (különben a zöld semmit nem ér)', () => {
  // Kimérve 2026-09-07-én: 73 teszt-fájl. A küszöb jóval alatta van, hogy
  // fájlok jogos megszűnése ne buktassa el — a minta elromlása viszont 0-ra
  // vinné, és azt elkapja.
  assert.ok(tesztFajlok().length >= 40,
    'csak ' + tesztFajlok().length + ' teszt-fájlt talált — romlott a minta');
});

t('🔑 a minta a VALÓDI hibás alakot felismeri (a mérce hitelesítése)', () => {
  // Ismert esettel hitelesítünk, ahogy a projekt szabálya kívánja: a
  // karakterláncot DARABOKBÓL rakjuk össze, hogy a forrásban ne álljon ott
  // készen — különben ez a fájl bukna el a saját szabályán.
  const meghajto = 'Z' + ':';
  const minta = `const ut = '${meghajto}/nincs/ilyen/ut/x.json';`;
  assert.equal((minta.match(MEGHAJTO_RX) || []).length, 1,
    'a minta a valódi hibás alakot sem ismeri fel — a zöld semmit nem érne');
  assert.equal((`const ut = join(dir, 'x.json');`.match(MEGHAJTO_RX) || []).length, 0,
    'a minta ártatlan sorra is illeszkedik — hamis riasztást gyártana');
});

t('a kommentek KI VANNAK szűrve (a tanulságot le kell tudni írni)', () => {
  const meghajto = 'Z' + ':';
  const forras = `// a régi alak ${meghajto}/nincs/ilyen volt\nconst a = 1;`;
  assert.equal((kodSorok(forras).match(MEGHAJTO_RX) || []).length, 0,
    'a kommentben említett útvonalat is hibának venné');
});

t('a hordozható alak tényleg írhatatlan EZEN a rendszeren is', () => {
  // Nem elhisszük, hanem KIPRÓBÁLJUK — a Windows/Linux különbség pont az,
  // amit a fejünkből nem lehetett kitalálni.
  const ut = join(fileURLToPath(import.meta.url), 'nem-mappa', 'x.json');
  let kod = null;
  try { mkdirSync(dirname(ut), { recursive: true }); } catch (e) { kod = e.code; }
  assert.ok(kod, 'a „hordozható írhatatlan" út LÉTREHOZHATÓ volt — a minta nem véd');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} test-hygiene.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
