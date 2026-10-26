// ===================================================================
// FORGALOM-NAPLÓ — tesztek
// ===================================================================
// Ingyenes, hálózat nélküli. Az API-hívás nincs tesztelve (az a main()
// dolga); itt a TISZTA logika van: összefésülés, metszés, rangsor.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { mergeDay, mintavetelezett, pruneOld, topPages, depth, depthTrend, isAudiencePath, RECENT_DAYS, KEEP_DAYS, robotVodrok, robotLevonas, ROBOT_MIN, NAPI_LIMIT, lekerdezendoNapok, napAblakok, sorokOsszevonasa } from './traffic-log.js';

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

t('🔴 10-16 élesben: egy sokkal szegényebb válasz NEM írja felül a meglévő napot — a sérült nap javítása igen', () => {
  const sok = Array.from({ length: 42 }, (_, i) => ({ path: '/p' + i, visits: 2, views: 2 }));
  const szemet = [{ path: '/article/x', visits: 100, views: 100 }];
  const out = mergeDay({ '2026-10-14': sok }, '2026-10-14', szemet, '2026-10-16');
  assert.equal(out['2026-10-14'].length, 42, '🔴 a 42 soros jó napot egy 1 soros válasz írta felül');
  const javit = mergeDay({ '2026-10-14': szemet }, '2026-10-14', sok, '2026-10-16');
  assert.equal(javit['2026-10-14'].length, 42, 'a sérült nap javítása átmegy');
  const kozel = mergeDay({ '2026-10-14': sok }, '2026-10-14', sok.slice(0, 30), '2026-10-16');
  assert.equal(kozel['2026-10-14'].length, 30, 'a kis ingadozás (a meglévő fele felett) még frissít');
});

t('🔴 mintavételezett Cloudflare-válasz felismerése (sampleInterval > 1 = egy rögzített esemény N látogatást jelent)', () => {
  assert.equal(mintavetelezett([{ avg: { sampleInterval: 1 } }, { avg: { sampleInterval: 1 } }]), false);
  assert.equal(mintavetelezett([{ avg: { sampleInterval: 1 } }, { avg: { sampleInterval: 100 } }]), true);
  assert.equal(mintavetelezett([{}]), false, 'a mező hiánya nem bukás');
  assert.equal(mintavetelezett([]), false);
  assert.equal(mintavetelezett(null), false);
});

t('🔌 a lekérdezés kéri a mintavételi közt, és mintavételezett napot csak jelölve ír', () => {
  const src = readFileSync(new URL('./traffic-log.js', import.meta.url), 'utf-8');
  assert.match(src, /avg \{ sampleInterval \}/, 'a Cloudflare-lekérdezés nem kéri a sampleInterval-t');
  // 10-25: az egész napos mintavételezett válasz NEM kerül a naplóba — darabokban kérjük le; 10-26: ha még órásan
  // is mintavételezett, BECSÜLT jelöléssel kerül be (pontos napot nem ír felül — lásd lent)
  assert.match(src, /if \(!mintavetelezett\(nyers\)\) rows = sorokbol\(nyers\);/, 'a mintavételezett válasz átmenne');
  assert.match(src, /if \(mintavetelezett\(hn\)\) becsult = true/, 'az órás bontásban is mintavételezett válasz jelöletlenül menne át');
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

// 🤖 ROBOTSZŰRŐ (2026-10-22, user: „ez nagyon torzítja a munkánkat!”) — valódi számokkal
t('🤖 a 10-22-i szingapúri végiglapozó (527 látogatás, 521 különböző oldal egy óra alatt) ROBOT', () => {
  assert.equal(robotVodrok([{ orszag: 'SG', ora: '2026-10-22T16:00:00Z', eszkoz: 'desktop', latogatas: 527, oldalak: 521 }]).length, 1);
});

t('🤖 a valódi napok legnagyobb vödre (10–20 látogatás) NEM robot; a berobbanó cikk (sok látogatás, KEVÉS oldal) sem', () => {
  assert.equal(robotVodrok([{ orszag: 'US', ora: 'x', eszkoz: 'mobile', latogatas: 20, oldalak: 18 }]).length, 0);
  assert.equal(robotVodrok([{ orszag: 'US', ora: 'x', eszkoz: 'mobile', latogatas: 300, oldalak: 4 }]).length, 0, 'egy Facebookon berobbanó cikk');
  assert.equal(ROBOT_MIN, 60);
});

t('🤖 a robot sorai levonódnak; ami csak a robottól jött, kiesik; a valódi olvasó megmarad', () => {
  const nap = [{ path: '/article/a', visits: 3, views: 3 }, { path: '/article/b', visits: 1, views: 1 }, { path: '/', visits: 10, views: 12 }];
  const robot = [{ path: '/article/a', visits: 1, views: 1 }, { path: '/article/b', visits: 1, views: 1 }];
  assert.deepEqual(robotLevonas(nap, robot), [{ path: '/article/a', visits: 2, views: 2 }, { path: '/', visits: 10, views: 12 }]);
  assert.deepEqual(robotLevonas(nap, []), nap);
});

t('🤖 a napi lekérdezés korlátja 1000 (a robotos napon 500+ útvonal), a fetchDay a levonás UTÁNI sorokat adja', () => {
  assert.equal(NAPI_LIMIT, 1000);
  const src = readFileSync(new URL('./traffic-log.js', import.meta.url), 'utf-8');
  assert.match(src, /limit: \$\{NAPI_LIMIT\}, orderBy: \[count_DESC\]/);
  assert.match(src, /const tisztitott = robotLevonas\(rows, robotSorok\);/);
  assert.match(src, /return \{ rows: becsult \? tisztitott\.map\(r => \(\{ \.\.\.r, becsult: true \}\)\) : tisztitott, robot: vodrok, becsult \};/);
  assert.match(src, /const \{ rows, robot, becsult \} = await fetchDay\(day\);/);
});

// ── 10-25: A MINTAVÉTELEZETT NAP PÓTLÁSA (napi riport: „hírtörlés kihagyva: hiányzó nap 10-23 — hiánytalan 1 nap, kell 75”) ──
t('🧩 lekérdezendő napok: az utolsó 3 + az utolsó 6 nap HIÁNYZÓ napjai (7 napon belül a Cloudflare még pontos)', () => {
  const log = { '2026-10-24': [{ path: '/a', visits: 1 }], '2026-10-22': [{ path: '/b', visits: 1 }], '2026-10-21': [], '2026-10-20': [{ path: '/c', visits: 1 }] };
  assert.deepEqual(lekerdezendoNapok('2026-10-25', log), ['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-19']);
  assert.deepEqual(lekerdezendoNapok('2026-10-25', {}), ['2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20', '2026-10-19']);
});

t('🧩 a nap egyenlő időablakokra bontva (a lekérdezés kisebb → a Cloudflare nem mintavételez)', () => {
  assert.deepEqual(napAblakok('2026-10-23', 4), [
    ['2026-10-23T00:00:00.000Z', '2026-10-23T06:00:00.000Z'], ['2026-10-23T06:00:00.000Z', '2026-10-23T12:00:00.000Z'],
    ['2026-10-23T12:00:00.000Z', '2026-10-23T18:00:00.000Z'], ['2026-10-23T18:00:00.000Z', '2026-10-24T00:00:00.000Z']]);
  assert.equal(napAblakok('2026-10-23', 24).length, 24);
});

t('🧩 a darabok sorai útvonalanként összeadva', () => {
  assert.deepEqual(sorokOsszevonasa([[{ path: '/a', visits: 2, views: 3 }, { path: '/b', visits: 1, views: 1 }], [{ path: '/a', visits: 1, views: 1 }], []]),
    [{ path: '/a', visits: 3, views: 4 }, { path: '/b', visits: 1, views: 1 }]);
});

t('🔌 bekötés: a fő ciklus a lekerdezendoNapok-ot, a fetchDay mintavételnél a napAblakok-at használja', () => {
  const src = readFileSync(new URL('./traffic-log.js', import.meta.url), 'utf-8');
  assert.match(src, /for \(const day of lekerdezendoNapok\(today, merged\)\)/);
  const fd = src.slice(src.indexOf('export async function fetchDay'), src.indexOf('export async function fetchDay') + 3000);
  assert.match(fd, /napAblakok\(day, 4\)/);
  assert.match(fd, /napAblakok\(day, 24\)/);
});

// ---------- becsült nap (10-26): a 10-23 órásan is mintavételezett volt ----------

t('🟡 becsült nap: a sorok jelölve kerülnek be (a hiányzó nap ne állítsa le a törlést)', () => {
  const out = mergeDay({}, '2026-10-23', [{ path: '/article/a', visits: 3, views: 3, becsult: true }], '2026-10-26');
  assert.deepEqual(out['2026-10-23'], [{ path: '/article/a', visits: 3, views: 3, becsult: true }]);
  const pontos = mergeDay({}, '2026-10-23', [{ path: '/a', visits: 3, views: 3 }], '2026-10-26');
  assert.ok(!('becsult' in pontos['2026-10-23'][0]), 'pontos napon nincs jelölés');
});

t('🟡 pontos napot becsült adat NEM ír felül; a becsültet a pontos igen (kevesebb sorral is)', () => {
  const pontosNap = { '2026-10-23': [{ path: '/a', visits: 5, views: 5 }] };
  const b = [{ path: '/a', visits: 9, views: 9, becsult: true }, { path: '/b', visits: 9, views: 9, becsult: true }];
  // FRISS napon (a régebbi nap a szokásos szabály miatt amúgy sem mozdulna — az a tesztet vakká tenné)
  assert.deepEqual(mergeDay(pontosNap, '2026-10-23', b, '2026-10-24')['2026-10-23'], pontosNap['2026-10-23']);
  const sok = Array.from({ length: 80 }, (_, k) => ({ path: '/q' + k, visits: 1, views: 1, becsult: true }));
  assert.deepEqual(mergeDay(pontosNap, '2026-10-23', sok, '2026-10-24')['2026-10-23'], pontosNap['2026-10-23'], 'több sorú becsült sem írja felül');
  const becsultNap = { '2026-10-23': Array.from({ length: 10 }, (_, k) => ({ path: '/p' + k, visits: 1, views: 1, becsult: true })) };
  // (friss napon — a RECENT_DAYS-nél régebbi nap a szokásos szabály szerint már nem mozdul)
  const uj = mergeDay(becsultNap, '2026-10-23', [{ path: '/a', visits: 2, views: 2 }], '2026-10-24');
  assert.deepEqual(uj['2026-10-23'], [{ path: '/a', visits: 2, views: 2 }], 'a pontos 1 sor is nyer a becsült 10 ellen');
});

t('🟡 két becsült válasz ÖSSZEVONÓDIK (oldalanként a nagyobb szám) — az újabb minta nem törli a régebbi olvasást', () => {
  const regi = { '2026-10-23': [{ path: '/article/real-read', visits: 1, views: 1, becsult: true }, { path: '/a', visits: 2, views: 2, becsult: true }] };
  const uj = [{ path: '/a', visits: 5, views: 5, becsult: true }, { path: '/b', visits: 1, views: 1, becsult: true }];
  const out = mergeDay(regi, '2026-10-23', uj, '2026-10-24')['2026-10-23'];
  const v = Object.fromEntries(out.map(r => [r.path, r.visits]));
  assert.deepEqual(v, { '/article/real-read': 1, '/a': 5, '/b': 1 });
  assert.ok(out.every(r => r.becsult));
});

t('🔌 bekötés: órás mintavételnél NEM dob, hanem becsültként jelöl', () => {
  const src = readFileSync(new URL('./traffic-log.js', import.meta.url), 'utf-8');
  const fd = src.slice(src.indexOf('export async function fetchDay'), src.indexOf('// ---------- riport'));
  assert.ok(!/throw new Error\('mintavételezett/.test(fd), 'a régi dobás maradt — a nap megint kimaradna');
  assert.match(fd, /becsult = true/);
  assert.match(fd, /becsult: true/);
});

console.log('\n✅ traffic-log.test: mind a ' + pass + ' eset rendben');
