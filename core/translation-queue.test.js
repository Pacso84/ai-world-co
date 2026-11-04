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
import { orderForTranslation, pruneFails, FAILED_BONUS, PINNED_BONUS } from './translation-queue.js';

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

// ===================================================================
// BUKÁS-SZÁMLÁLÓ TAKARÍTÁSA (2026-08-12)
// ===================================================================
// A számláló jelentése: "ennyiszer bukott EGYMÁS UTÁN ez a (cikk, nyelv) pár".
// Törölni azonban CSAK egy sikeres újrafordítás törli (agents/translator/
// agent.js:255). Két úton ragad be örökre:
//   (a) a pár már kész → a fordító a gyorsítótár láttán KIHAGYJA (agent.js:239),
//       tehát a törlő ág le sem fut;
//   (b) a nyelv kivezetett (de/fr) → soha nem próbáljuk újra, tehát soha nem is
//       törlődik.
// Élesben MINDKETTŐ megvolt: a snowflake|es pár spanyolja 4319 karakteren kész
// és érvényes, a le-chat|fr pedig kivezetett nyelv.
//
// MIÉRT BAJ: 2 bukásnál a fordító VISSZAADJA a cikket az Írónak (agent.js:264) —
// a publikált cikk átkerül content/rejected/-be és FIZETŐS újraírásra megy.
// Egy beragadt 1-es tehát a következő EGYETLEN átmeneti hibánál (429, timeout)
// kiváltja ezt, pedig a pár valójában rendben van.
// ===================================================================

t('a KÉSZ fordítás bukás-bejegyzését kitakarítja', () => {
  const { fails, removed } = pruneFails(
    { 'kesz.json|es': 1, 'tenyleg-bukott.json|hu': 2 },
    { liveLangs: ['hu', 'es'], isDone: (f) => f === 'kesz.json' }
  );
  assert.deepEqual(fails, { 'tenyleg-bukott.json|hu': 2 }, 'a valódi bukás MARAD');
  assert.equal(removed.length, 1);
  assert.match(removed[0].reason, /kész/i, 'az indok megmondja, miért törölt');
});

t('a KIVEZETETT nyelv bejegyzését kitakarítja', () => {
  // Ez a le-chat|fr eset: soha nem próbáljuk újra, tehát örök szemét.
  const { fails, removed } = pruneFails(
    { 'a.json|fr': 2, 'a.json|de': 1, 'a.json|hu': 1 },
    { liveLangs: ['hu', 'es'], isDone: () => false }
  );
  assert.deepEqual(fails, { 'a.json|hu': 1 });
  assert.equal(removed.length, 2);
});

t('a VALÓDI, még nyitott bukást nem bántja', () => {
  const be = { 'bukott.json|hu': 1, 'makacs.json|es': 3 };
  const { fails, removed } = pruneFails(be, { liveLangs: ['hu', 'es'], isDone: () => false });
  assert.deepEqual(fails, be, 'egyetlen nyitott bukás sem veszhet el');
  assert.equal(removed.length, 0);
});

t('ha az ellenőrzés HIBÁRA fut, a bejegyzés MARAD', () => {
  // Óvatosság: egy fájlrendszer-hiba nem törölhet valódi bukás-nyomot. Inkább
  // maradjon bent egy fölösleges sor, mint hogy elvesszen egy igazi jelzés.
  const { fails, removed } = pruneFails(
    { 'a.json|hu': 1 },
    { liveLangs: ['hu', 'es'], isDone: () => { throw new Error('lemez-hiba'); } }
  );
  assert.deepEqual(fails, { 'a.json|hu': 1 });
  assert.equal(removed.length, 0);
});

t('a szemét-kulcsokat eldobja', () => {
  const { fails } = pruneFails(
    { 'nincs-benne-fuggoleges-vonal': 3, 'a.json|hu': 0, 'b.json|hu': -2, 'c.json|hu': 1 },
    { liveLangs: ['hu', 'es'], isDone: () => false }
  );
  assert.deepEqual(fails, { 'c.json|hu': 1 }, 'csak az értelmes, pozitív számláló marad');
});

t('nyelvlista nélkül nem szűr nyelvre (visszafelé kompatibilis)', () => {
  const { fails } = pruneFails({ 'a.json|fr': 2 }, { isDone: () => false });
  assert.deepEqual(fails, { 'a.json|fr': 2 });
});

t('rossz bemenetre nem esik szét', () => {
  assert.deepEqual(pruneFails(null).fails, {});
  assert.deepEqual(pruneFails(undefined).fails, {});
  assert.deepEqual(pruneFails({ 'a.json|hu': 1 }).fails, { 'a.json|hu': 1 }, 'isDone nélkül csak szemetet dob');
});

t('a takarítás után a sorrend a valóságot tükrözi', () => {
  // Együtt a két függvény: a kitakarított pár NEM ül többé a sor elején.
  const nyers = { 'kesz.json|es': 1 };
  const elotte = orderForTranslation(
    [{ file: 'friss.json', pub: '2026-08-12' }, { file: 'kesz.json', pub: '2026-08-01' }],
    nyers, ['hu', 'es']);
  assert.equal(nev(elotte)[0], 'kesz.json', 'takarítás ELŐTT a kész cikk ül elöl — ez a hiba');

  const { fails } = pruneFails(nyers, { liveLangs: ['hu', 'es'], isDone: f => f === 'kesz.json' });
  const utana = orderForTranslation(
    [{ file: 'friss.json', pub: '2026-08-12' }, { file: 'kesz.json', pub: '2026-08-01' }],
    fails, ['hu', 'es']);
  assert.equal(nev(utana)[0], 'friss.json', 'takarítás UTÁN a friss megy előre');
});

console.log('\n✅ translation-queue.test: mind a ' + pass + ' eset rendben');
