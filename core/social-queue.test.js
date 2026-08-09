// ===================================================================
// TESZT — social sor: kit küldünk ki a következő körben
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { selectSocialBatch, DRAIN_SLOT_FROM } from './social-queue.js';

const item = (nap, opts = {}) => ({
  pubAt: `2026-${nap}T10:00:00Z`, isGuide: true, isFresh: false, ...opts
});
const napjai = list => list.map(x => x.pubAt.slice(5, 10));

// --- 1) A FRISS MINDIG ELŐRE (user-döntés 2026-08-09) ----------------
{
  const items = [
    item('06-01'), item('06-02'), item('06-03'),          // régi hátralék
    item('08-08', { isFresh: true }), item('08-09', { isFresh: true })
  ];
  const b = selectSocialBatch(items, 3);
  // Az első két hely a frissé, a LEGÚJABB elöl.
  assert.equal(b[0].pubAt.slice(5, 10), '08-09', 'a legfrissebb megy elsőnek');
  assert.equal(b[1].pubAt.slice(5, 10), '08-08');
}

// --- 2) DE EGY HELY A HÁTRALÉKÉ ------------------------------------
// Enélkül a 191 régi útmutató SOHA nem menne ki: naponta 8,5 friss
// tartalom keletkezik, ami magában elvinné az összes helyet.
{
  const items = [
    item('06-01'), item('06-02'),
    item('08-05', { isFresh: true }), item('08-06', { isFresh: true }),
    item('08-07', { isFresh: true }), item('08-08', { isFresh: true })
  ];
  const b = selectSocialBatch(items, 3);
  const regi = b.filter(x => !x.isFresh);
  assert.equal(regi.length, 1, 'pontosan egy hely a hátraléké');
  assert.equal(regi[0].pubAt.slice(5, 10), '06-01', 'a hátralékból a LEGRÉGEBBI — így ürül a sor');
}

// --- 3) Kis limitnél NINCS garantált hátralék-hely -------------------
// A drain-hely csak DRAIN_SLOT_FROM-tól él. Alatta a hátralék csak akkor
// jut helyhez, ha marad üresen — de akkor igen, mert hely nem veszhet el.
{
  assert.equal(DRAIN_SLOT_FROM, 3);
  // Van elég friss: 1-2 helynél a hátralék NEM kap semmit.
  const bosegben = [
    item('06-01'), item('06-02'),
    item('08-08', { isFresh: true }), item('08-09', { isFresh: true })
  ];
  for (const limit of [1, 2]) {
    const b = selectSocialBatch(bosegben, limit);
    assert.ok(b.every(x => x.isFresh), `limit=${limit}: friss bőségben a friss visz mindent`);
  }
  // Kevés a friss: a maradék helyre bemehet a hátralék (a hely nem vész el).
  const szuken = [item('06-01'), item('08-09', { isFresh: true })];
  assert.equal(selectSocialBatch(szuken, 2).length, 2, 'a második hely sem marad üresen');
}

// --- 4) HELY NEM VESZHET EL ----------------------------------------
// Ha nincs friss, a hátralék tölti fel — és fordítva.
{
  const csakRegi = [item('06-01'), item('06-02'), item('06-03'), item('06-04')];
  assert.equal(selectSocialBatch(csakRegi, 3).length, 3, 'friss híján a hátralék tölt');

  const csakFriss = [
    item('08-07', { isFresh: true }), item('08-08', { isFresh: true }), item('08-09', { isFresh: true })
  ];
  assert.equal(selectSocialBatch(csakFriss, 3).length, 3, 'hátralék híján a friss tölt');
}

// --- 5) A MARADÉK HÁTRALÉK-HELYEKRE a LEGÚJABB megy ------------------
// Ha több hely jut a hátraléknak, mint a garantált egy, akkor a többire
// már a frissebb kerül — a user szabálya szerint ("a friss előre").
{
  const items = [item('06-01'), item('07-15'), item('08-01'), item('07-01')];
  const b = selectSocialBatch(items, 3);
  const napok = napjai(b);
  assert.ok(napok.includes('06-01'), 'a LEGRÉGEBBI garantáltan bekerül (ez üríti a sort)');
  assert.ok(napok.includes('08-01'), 'a maradék helyre a legújabb megy');
  assert.ok(!napok.includes('07-01'), 'a középmezőny vár');
  // A KIKÜLDÉS sorrendje: újabb elöl (a kiválasztás garanciája külön kérdés).
  assert.deepEqual(napok, ['08-01', '07-15', '06-01'], 'sorrendben az újabb elöl');
}

// --- 6) Nem duplázunk -----------------------------------------------
{
  const items = [item('06-01'), item('06-02'), item('08-09', { isFresh: true })];
  const b = selectSocialBatch(items, 5);
  assert.equal(new Set(b).size, b.length, 'egy elem csak egyszer szerepel');
  assert.equal(b.length, 3, 'nem gyártunk a semmiből');
}

// --- 7) Rossz bemenet -----------------------------------------------
assert.deepEqual(selectSocialBatch(null, 3), []);
assert.deepEqual(selectSocialBatch([item('06-01')], 0), []);

console.log('✅ social-queue: minden teszt átment');
