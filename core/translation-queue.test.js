// ===================================================================
// TESZT — fordítási sorrend
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-10, user: "ne forduljon többet elő, hogy nincs lefordítva"):
// a 08-09-i heti összefoglaló magyar fordítása elbukott, és a cikk angolul
// ment ki a magyar főoldal tetejére. A hibás szűrőt megjavítottuk — de maradt
// egy második rés: a fordító TISZTÁN KOR SZERINT dolgozik, tehát egy elbukott
// cikk minden nap hátrébb csúszik, ahogy újabbak készülnek. Másnap már tíz
// frissebb cikk előzte meg. Ha az időkeret elfogy, sosem kerül sorra.
// ===================================================================

import assert from 'assert/strict';
import { orderForTranslation, FAILED_BONUS, PINNED_BONUS } from './translation-queue.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
const nev = lista => lista.map(x => x.file);

console.log('🧪 fordítási sorrend\n');

t('bukás nélkül a legfrissebb megy előre (2026-07-01 tanulság)', () => {
  // A fájlnév szerinti rendezés az ARTICLE_GUIDE_* fájlokat vette előre
  // ('G' > '2026'), ezért a HÍREK sosem kerültek sorra. Ez nem romolhat el.
  const s = orderForTranslation([
    { file: 'regi.json', pub: '2026-08-01' },
    { file: 'uj.json', pub: '2026-08-09' },
    { file: 'kozepes.json', pub: '2026-08-05' }
  ], {});
  assert.deepEqual(nev(s), ['uj.json', 'kozepes.json', 'regi.json']);
});

t('a KORÁBBAN ELBUKOTT cikk megelőzi a frisseket', () => {
  // Ez a 08-09-i eset: a digest elbukott, másnap tíz újabb cikk előzte meg.
  const s = orderForTranslation([
    { file: 'friss-1.json', pub: '2026-08-10' },
    { file: 'friss-2.json', pub: '2026-08-10' },
    { file: 'digest.json', pub: '2026-08-09' }
  ], { 'digest.json|hu': 6 });
  assert.equal(nev(s)[0], 'digest.json', 'a hatszor elbukott cikk megy elsőnek');
});

t('a heti összefoglaló előresorolódik', () => {
  // Az ül a főoldal tetején MINDEN nyelven — ott a legdrágább egy angol cikk.
  const s = orderForTranslation([
    { file: 'hir.json', pub: '2026-08-10' },
    { file: 'digest.json', pub: '2026-08-09', kiemelt: true }
  ], {});
  assert.equal(nev(s)[0], 'digest.json');
});

t('a bukás erősebb jel, mint a kiemeltség', () => {
  // Egy elbukott cikk MÁR hibás állapotban van; a kiemelt csak fontos.
  assert.ok(FAILED_BONUS > PINNED_BONUS);
  const s = orderForTranslation([
    { file: 'digest.json', pub: '2026-08-10', kiemelt: true },
    { file: 'bukott.json', pub: '2026-08-01' }
  ], { 'bukott.json|es': 1 });
  assert.equal(nev(s)[0], 'bukott.json');
});

t('több bukás előrébb visz', () => {
  const s = orderForTranslation([
    { file: 'egyszer.json', pub: '2026-08-10' },
    { file: 'hatszor.json', pub: '2026-08-01' }
  ], { 'egyszer.json|hu': 1, 'hatszor.json|hu': 6 });
  assert.equal(nev(s)[0], 'hatszor.json', 'a makacsabb eset megy előre');
});

t('a bukás bármelyik nyelven számít', () => {
  const s = orderForTranslation([
    { file: 'friss.json', pub: '2026-08-10' },
    { file: 'es-bukott.json', pub: '2026-08-02' }
  ], { 'es-bukott.json|es': 2 });
  assert.equal(nev(s)[0], 'es-bukott.json');
});

t('más fájl bukása nem húzza előre ezt', () => {
  // A kulcs "fájl|nyelv" — a fájlnév-egyezésnek pontosnak kell lennie,
  // különben egy hasonló nevű cikk bukása mást sorolna előre.
  const s = orderForTranslation([
    { file: 'friss.json', pub: '2026-08-10' },
    { file: 'masik.json', pub: '2026-08-01' }
  ], { 'nemletezo.json|hu': 9 });
  assert.deepEqual(nev(s), ['friss.json', 'masik.json']);
});

t('a KIVEZETETT nyelv bukása nem sorol előre', () => {
  // A de/fr 2026-07-31-én kivezetve, de a bukás-számlálójuk ott maradt
  // (soha nem próbáljuk újra, tehát soha nem is törlődik). E nélkül a szűrés
  // nélkül egy fr-bukás miatt egy kész cikk örökre a sor elején ülne — és a
  // makacs-jelzés is olyan nyelvre figyelmeztetne, amit nem is fordítunk.
  const s = orderForTranslation([
    { file: 'friss.json', pub: '2026-08-10' },
    { file: 'fr-bukott.json', pub: '2026-08-01' }
  ], { 'fr-bukott.json|fr': 2 }, ['hu', 'es']);
  assert.deepEqual(nev(s), ['friss.json', 'fr-bukott.json'], 'a holt fr-bukás nem számít');
});

t('élő nyelv bukása a szűrés mellett is előre visz', () => {
  const s = orderForTranslation([
    { file: 'friss.json', pub: '2026-08-10' },
    { file: 'hu-bukott.json', pub: '2026-08-01' }
  ], { 'hu-bukott.json|hu': 2 }, ['hu', 'es']);
  assert.equal(nev(s)[0], 'hu-bukott.json');
});

t('nyelvlista nélkül minden bukás számít (visszafelé kompatibilis)', () => {
  const s = orderForTranslation([
    { file: 'friss.json', pub: '2026-08-10' },
    { file: 'fr-bukott.json', pub: '2026-08-01' }
  ], { 'fr-bukott.json|fr': 2 });
  assert.equal(nev(s)[0], 'fr-bukott.json');
});

t('rossz bemenetre nem esik szét', () => {
  assert.deepEqual(orderForTranslation(null, {}), []);
  assert.deepEqual(orderForTranslation([], null), []);
  const s = orderForTranslation([{ file: 'a.json' }, { file: 'b.json', pub: '2026-08-01' }], null);
  assert.equal(s.length, 2, 'a hiányzó dátum nem ejti ki a cikket');
});

console.log('\n✅ translation-queue.test: mind a ' + pass + ' eset rendben');
