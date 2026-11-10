// ===================================================================
// TESZT — social sor: kit küldünk ki a következő körben
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { selectSocialBatch, DRAIN_SLOT_FROM, aznapiE, aznapElol, aznapiKeret, AZNAP_FUTAS_MAX } from './social-queue.js';

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

// CSAK FRISS (2026-09-27, user): a Facebookra a régi útmutató NEM megy ki —
// akkor sem, ha kevés a friss és maradna hely; a Threads (kapcsoló nélkül) igen.
{
  const q = [item('06-01'), item('06-02'), item('09-26', { isFresh: true }), item('09-27', { isFresh: true })];
  const fb = selectSocialBatch(q, 5, { csakFriss: true });
  assert.deepEqual(napjai(fb), ['09-27', '09-26'], 'régi útmutató került a Facebook-kötegbe');
  const threads = selectSocialBatch(q, 5);
  assert.ok(threads.some(x => !x.isFresh), 'a Threads nem kap régi útmutatót (a kapcsoló nélkül kellene)');
  const src = (await import('fs')).readFileSync(new URL('../agents/social/poster.js', import.meta.url), 'utf-8');
  assert.match(src, /selectSocialBatch\(queue, limit, \{ csakFriss: true, now: NOW \}\)/, 'a Facebook-poszter nem csak frisset kér (vagy nem kapja az aznap-elsőbbséget)');
}

// --- 8) AMI AZNAP KÉSZÜLT, MIND MENJEN KI (2026-11-10, user) ----------
// Mérve: a Threadsre 11-09-én 7-ből 4, 11-10-én 8-ból 4 cikk jutott; a 11-09 hajnali Google Meet-hír
// (03:36Z) a „legújabb elöl" sorrend miatt SOHA nem ment ki a Facebookra.
{
  const MOST = Date.parse('2026-11-10T13:00:00Z');
  const f = (iso, o = {}) => ({ pubAt: iso, isGuide: false, isFresh: true, ...o });
  const mai = ['2026-11-10T03:36:00Z', '2026-11-10T05:10:00Z', '2026-11-10T12:20:00Z'].map(x => f(x));
  const tegnapi = [f('2026-11-09T03:36:00Z'), f('2026-11-09T18:40:00Z')];
  const regebbi = [f('2026-11-06T10:00:00Z'), f('2026-11-07T10:00:00Z')];
  const mind = [...regebbi, ...mai, ...tegnapi];

  // aznapiE: ma és tegnap (UTC) igen, tegnapelőtt nem; rossz bemenet nem
  assert.ok(aznapiE(mai[0], MOST) && aznapiE(tegnapi[0], MOST));
  assert.ok(!aznapiE(f('2026-11-08T23:59:00Z'), MOST), 'a tegnapelőtti nem aznapi');
  assert.ok(!aznapiE({ pubAt: '' }, MOST) && !aznapiE(null, MOST) && !aznapiE(mai[0], NaN));

  // aznapElol: a mai + tegnapi a LEGRÉGEBBITŐL, utána a többi a legújabbtól
  assert.deepEqual(aznapElol(mind, MOST).map(x => x.pubAt.slice(5, 16)),
    ['11-09T03:36', '11-09T18:40', '11-10T03:36', '11-10T05:10', '11-10T12:20', '11-07T10:00', '11-06T10:00']);
  assert.equal(mind[0].pubAt, regebbi[0].pubAt, 'a bemenet nem változhat');

  // 🔴 A 11-09-i hiba: 2 hely, sok friss → a hajnali tegnapi cikk is bekerül (régen kimaradt)
  const ket = selectSocialBatch(mind, 2, { csakFriss: true, now: MOST });
  assert.deepEqual(ket.map(x => x.pubAt), ['2026-11-09T03:36:00Z', '2026-11-09T18:40:00Z'], '🔴 a hajnali cikk megint kiéhezik');
  // now nélkül a régi viselkedés (legújabb elöl) — a többi hívó nem változik
  assert.equal(selectSocialBatch(mind, 1, { csakFriss: true })[0].pubAt, '2026-11-10T12:20:00Z');

  // aznapiKeret: a --limit az alsó határ; ha több mai/tegnapi vár, annyi — legfeljebb AZNAP_FUTAS_MAX
  assert.equal(aznapiKeret({ items: mind, alap: 2, now: MOST }), 5, '5 mai/tegnapi vár → 5 megy');
  assert.equal(aznapiKeret({ items: mind, alap: 6, now: MOST }), 6, 'a --limit alsó határ marad');
  assert.equal(aznapiKeret({ items: regebbi, alap: 3, now: MOST }), 3, 'nincs mai → a régi tempó');
  const sok = Array.from({ length: 20 }, (_, i) => f(`2026-11-10T0${i % 10}:00:00Z`));
  assert.equal(aznapiKeret({ items: sok, alap: 2, now: MOST }), AZNAP_FUTAS_MAX, 'futásonként plafon');
  assert.equal(AZNAP_FUTAS_MAX, 8);
  assert.equal(aznapiKeret({ items: [f('2026-11-10T01:00:00Z', { isFresh: false })], alap: 2, now: MOST }), 2, 'nem friss nem számít');
  for (const rossz of [null, undefined, 'x']) assert.equal(aznapiKeret({ items: rossz, alap: 3, now: MOST }), 3);
  assert.equal(aznapiKeret({ items: mind, alap: 3, now: NaN }), 3, 'ismeretlen idő → a régi tempó');
  assert.equal(aznapiKeret(), 0);

  // 🔌 bekötés: mindkét poszter a közös keretet kéri (a poszterek nem importálhatók)
  const fs = await import('fs');
  const fb = fs.readFileSync(new URL('../agents/social/poster.js', import.meta.url), 'utf-8');
  assert.match(fb, /aznapiKeret\(\{ items: queue, alap: LIMIT, now: NOW \}\)/, '🔴 a Facebook-poszter fix --limit-tel megy');
  assert.match(fb, /postsPerRun\(\{ used: elhasznalt, day: MA, defaultLimit: kert \}\)/, '🔴 a Make-őr nem a megnövelt kérést fékezi');
  const bu = fs.readFileSync(new URL('../agents/social/buffer-poster.js', import.meta.url), 'utf-8');
  assert.match(bu, /aznapiKeret\(\{ items: q, alap: LIMIT, now \}\)/, '🔴 a Threads fix --limit-tel megy');
  assert.match(bu, /runLimit: futasKeret/, '🔴 a csatorna-plafon a régi futás-limitet kapja');

  // VALÓDI ADAT (CLAUDE.md): a content/social fájlok mind olvashatók a kiválasztóval — nem borul, és
  // a sorrend a tényleges pubAt-okon is „aznapi előbb" marad.
  const dir = new URL('../content/social/', import.meta.url);
  const valodi = fs.readdirSync(dir).filter(x => x.endsWith('.json')).slice(-400).map(x => {
    try { const p = JSON.parse(fs.readFileSync(new URL(x, dir), 'utf-8')); return { pubAt: p.posted_at || p.created_at || '', isFresh: true }; } catch { return null; }
  }).filter(Boolean);
  const most = Date.now();
  const sorban = aznapElol(valodi, most);
  const elsoNemAznapi = sorban.findIndex(x => !aznapiE(x, most));
  if (elsoNemAznapi !== -1) assert.ok(sorban.slice(elsoNemAznapi).every(x => !aznapiE(x, most)), 'valódi adaton: aznapi tétel a többi mögé csúszott');
}

console.log('✅ social-queue: minden teszt átment');
