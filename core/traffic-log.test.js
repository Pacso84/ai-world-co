// ===================================================================
// FORGALOM-NAPLÓ — tesztek
// ===================================================================
// Ingyenes, hálózat nélküli. Az API-hívás nincs tesztelve (az a main()
// dolga); itt a TISZTA logika van: összefésülés, metszés, rangsor.
// ===================================================================

import assert from 'assert/strict';
import { mergeDay, pruneOld, topPages, depth, depthTrend, isAudiencePath, RECENT_DAYS, KEEP_DAYS } from './traffic-log.js';

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

// ===================================================================
// OLVASÁSI MÉLYSÉG (2026-08-15)
// ===================================================================
// Élesben 1,17–1,25 oldal/látogató: négyből három ember egy cikket olvas és
// távozik. Ez az egyetlen forgalmi szám, amit új közönség NÉLKÜL mozgatni
// tudunk — ezért kell tudnunk követni, mielőtt bármit átalakítunk.

t('a mélység views/visits', () => {
  assert.equal(depth([{ visits: 10, views: 12 }, { visits: 10, views: 13 }]), 1.25);
  assert.equal(depth([{ visits: 5, views: 5 }]), 1, '1,00 = mindenki egy oldalt néz');
});

t('belépő nélkül 0, nem osztunk nullával', () => {
  assert.equal(depth([{ visits: 0, views: 9 }]), 0);
  assert.equal(depth([]), 0);
  assert.equal(depth(null), 0);
  assert.equal(depth([{ visits: 'x', views: null }]), 0, 'szemét bemenetre sem NaN');
});

t('a trend a legutóbbi hetet a megelőzőhöz méri', () => {
  const days = {};
  // megelőző 7 nap: 1,00 · legutóbbi 7 nap: 2,00
  for (let i = 1; i <= 7; i++) days['2026-08-0' + i] = [{ visits: 10, views: 10 }];
  for (let i = 8; i <= 14; i++) days['2026-08-' + i] = [{ visits: 10, views: 20 }];
  const tr = depthTrend(days, 7);
  assert.equal(tr.recent, 2);
  assert.equal(tr.previous, 1);
  assert.equal(tr.days, 7);
});

t('fél adatból NEM hasonlítunk', () => {
  // Óvatosság: hiányos megelőző hétre a `previous` null, hogy a riport ne
  // írjon ki hamis "javult/romlott" különbséget. Élesben pont ez volt a
  // helyzet: 13 nap napló, tehát a 14 napos összevetés még nem áll össze.
  const days = {};
  for (let i = 1; i <= 9; i++) days['2026-08-0' + String(i)] = [{ visits: 10, views: 12 }];
  const tr = depthTrend(days, 7);
  assert.equal(tr.previous, null, 'nincs elég nap → nincs összevetés');
  assert.ok(tr.recent > 0, 'a friss érték attól még megvan');
});

t('üres naplóra sem esik szét', () => {
  assert.deepEqual(depthTrend({}, 7), { recent: 0, previous: null, days: 0 });
  assert.equal(depthTrend(undefined).recent, 0);
});

t('📖 a magyar oldalak nem torzíthatják el a mélységet', () => {
  // MÉRT ESET (2026-08-19): 17 nap alatt a /hu/ 5 belépőt hozott és 148
  // oldalmegtekintést — 29,6 oldal/látogató. Ez nem közönség, hanem a saját
  // böngészésünk. A belépők 1,7%-a, de az oldalmegtekintések 17,5%-a, és pont
  // az oldalmegtekintés a mélység SZÁMLÁLÓJA. Emiatt mutatott a riport 1,24-et
  // ott, ahol a valódi olvasók 1,04-en állnak.
  const sorok = [
    { path: '/article/how-to-spot-a-deepfake', visits: 10, views: 10 },
    { path: '/hu/', visits: 1, views: 26 }
  ];
  assert.equal(depth(sorok), 1, 'a magyar munkamenet nem emelheti meg a számot');
});

t('a spanyol olvasó VALÓDI olvasó — bent marad', () => {
  // A /es/ mért értéke 1,43 oldal/látogató: normális olvasói minta, nem
  // saját kattintgatás. Kizárni annyi lenne, mint letagadni egy közönséget.
  assert.equal(depth([{ path: '/es/article/x', visits: 2, views: 3 }]), 1.5);
});

t('az útvonal nélküli sor bent marad (visszafelé kompatibilitás)', () => {
  assert.equal(depth([{ visits: 4, views: 8 }]), 2);
});

t('isAudiencePath: a /hu ki, minden más be', () => {
  assert.equal(isAudiencePath('/hu/'), false);
  assert.equal(isAudiencePath('/hu'), false);
  assert.equal(isAudiencePath('/hu/tools'), false);
  assert.equal(isAudiencePath('/article/valami'), true);
  assert.equal(isAudiencePath('/es/article/valami'), true);
  assert.equal(isAudiencePath('/'), true);
  assert.equal(isAudiencePath('/humans.txt'), true, 'a "hu" ELŐTAG nem elég — a szóhatár számít');
  assert.equal(isAudiencePath(undefined), true, 'ismeretlen útvonalat nem dobunk el');
});

t('a trend is a megtisztított számot adja', () => {
  const days = {};
  for (let i = 1; i <= 7; i++) {
    days['2026-08-0' + i] = [
      { path: '/article/x', visits: 10, views: 10 },
      { path: '/hu/', visits: 0, views: 40 }
    ];
  }
  assert.equal(depthTrend(days, 7).recent, 1, 'a saját böngészés a trendbe se szivárogjon be');
});

console.log('\n✅ traffic-log.test: mind a ' + pass + ' eset rendben');
