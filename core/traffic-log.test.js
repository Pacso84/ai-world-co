// ===================================================================
// FORGALOM-NAPLÓ — tesztek
// ===================================================================
// Ingyenes, hálózat nélküli. Az API-hívás nincs tesztelve (az a main()
// dolga); itt a TISZTA logika van: összefésülés, metszés, rangsor.
// ===================================================================

import assert from 'assert/strict';
import { mergeDay, pruneOld, topPages, RECENT_DAYS, KEEP_DAYS } from './traffic-log.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 forgalom-napló\n');

// ---------- összefésülés ----------

t('üres naplóba új nap bekerül', () => {
  const out = mergeDay({}, '2026-08-04', [{ path: '/a', visits: 5, views: 7 }], '2026-08-05');
  assert.equal(out['2026-08-04'].length, 1);
  assert.equal(out['2026-08-04'][0].visits, 5);
});

t('a FRISS nap adata FELÜLÍRÓDIK (a Cloudflare késhet)', () => {
  const log = { '2026-08-04': [{ path: '/a', visits: 2, views: 2 }] };
  const out = mergeDay(log, '2026-08-04', [{ path: '/a', visits: 9, views: 11 }], '2026-08-05');
  assert.equal(out['2026-08-04'][0].visits, 9, 'a frissebb, teljesebb adatnak kell nyernie');
});

t('a RÉGI nap adata ÉRINTETLEN marad', () => {
  // 2026-06-01 jóval RECENT_DAYS-en kívül van a 08-05-i futáshoz képest.
  const log = { '2026-06-01': [{ path: '/a', visits: 40, views: 50 }] };
  const out = mergeDay(log, '2026-06-01', [{ path: '/a', visits: 10, views: 10 }], '2026-08-05');
  assert.equal(out['2026-06-01'][0].visits, 40, 'a Cloudflare a régi napokat tízesre kerekíti — nem írjuk felül');
});

t('a határeset: pontosan RECENT_DAYS-nyire lévő nap még frissül', () => {
  const day = new Date(Date.UTC(2026, 7, 5) - (RECENT_DAYS - 1) * 86400000)
    .toISOString().slice(0, 10);
  const log = { [day]: [{ path: '/a', visits: 1, views: 1 }] };
  const out = mergeDay(log, day, [{ path: '/a', visits: 8, views: 8 }], '2026-08-05');
  assert.equal(out[day][0].visits, 8);
});

t('a bemenet nem módosul (nincs mellékhatás)', () => {
  const log = { '2026-08-04': [{ path: '/a', visits: 2, views: 2 }] };
  const before = JSON.stringify(log);
  mergeDay(log, '2026-08-04', [{ path: '/a', visits: 9, views: 9 }], '2026-08-05');
  assert.equal(JSON.stringify(log), before);
});

t('üres sorlista nem törli a meglévő napot', () => {
  const log = { '2026-08-04': [{ path: '/a', visits: 5, views: 5 }] };
  const out = mergeDay(log, '2026-08-04', [], '2026-08-05');
  assert.equal(out['2026-08-04'][0].visits, 5, 'a sikertelen lekérdezés NEM tüntetheti el a meglévő adatot');
});

// ---------- metszés ----------

t('a KEEP_DAYS-nél régebbi napok kikerülnek', () => {
  const old = new Date(Date.UTC(2026, 7, 5) - (KEEP_DAYS + 5) * 86400000).toISOString().slice(0, 10);
  const out = pruneOld({ [old]: [{ path: '/a', visits: 1, views: 1 }], '2026-08-04': [] }, '2026-08-05');
  assert.equal(out[old], undefined);
  assert.ok('2026-08-04' in out);
});

t('a metszés nem nyúl a megtartandó napokhoz', () => {
  const keep = new Date(Date.UTC(2026, 7, 5) - 10 * 86400000).toISOString().slice(0, 10);
  const out = pruneOld({ [keep]: [{ path: '/a', visits: 3, views: 3 }] }, '2026-08-05');
  assert.equal(out[keep][0].visits, 3);
});

// ---------- rangsor ----------

t('a legtöbb BELÉPŐT hozó oldalak jönnek elöl', () => {
  const rows = [
    { path: '/a', visits: 2, views: 20 },
    { path: '/b', visits: 9, views: 9 },
    { path: '/c', visits: 5, views: 5 }
  ];
  const top = topPages(rows, 2);
  assert.deepEqual(top.map(r => r.path), ['/b', '/c'], 'a belépő számít, nem a letöltés');
});

t('a 0 belépős oldalak kimaradnak', () => {
  const top = topPages([{ path: '/a', visits: 0, views: 8 }, { path: '/b', visits: 1, views: 1 }], 5);
  assert.deepEqual(top.map(r => r.path), ['/b']);
});

t('üres bemenet üres rangsort ad', () => {
  assert.deepEqual(topPages([], 3), []);
});

console.log('\n✅ traffic-log.test: mind a ' + pass + ' eset rendben');
