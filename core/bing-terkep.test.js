// core/bing-terkep.js — a Bing webhelytérkép-állapotának napi őre (2026-11-14). Ingyenes, hálózat nélküli teszt.
//
// A MÉRCE IRÁNYA: a veszély az, hogy (1) a Bing hetekig „Failed” állapotban ragad és senki nem tudja (11-07 → 11-14),
// (2) a sor feleslegesen szól, amikor minden rendben (zaj), (3) a lekérdezés hibája megállítja a riportot,
// (4) az újraküldés minden futásban megy (fölösleges API-hívás).
import assert from 'node:assert/strict';
import { bingDatum, terkepAllapot, bingTerkepSor, ujrakuldesKell, ELVART_TERKEPEK, bingTerkepek, ujrakuld } from './bing-terkep.js';

const MOST = Date.parse('2026-11-14T20:00:00Z');
const NAP = 86400000;
const d = ms => `/Date(${ms})/`;

// 1) Bing-dátum: a „soha” (2339-es év) és a hibás érték null
assert.equal(bingDatum(d(Date.parse('2026-11-07T04:28:03Z'))), Date.parse('2026-11-07T04:28:03Z'));
assert.equal(bingDatum('/Date(11676096000000)/'), null, '2339 = a Bing „soha nem olvasta” jele');
assert.equal(bingDatum('rossz'), null);
assert.equal(bingDatum(null), null);

// 2) minden rendben → nincs sor (csendes)
const jo = [
  { Url: 'https://aiworldhq.com/sitemap.xml', Status: 'Success', LastCrawled: d(MOST - 1 * NAP), Submitted: d(MOST - 100 * NAP), UrlCount: 2652 },
  { Url: 'https://aiworldhq.com/news-sitemap.xml', Status: 'Success', LastCrawled: d(MOST - 2 * NAP), Submitted: d(MOST - 10 * NAP), UrlCount: 11 }
];
assert.deepEqual(terkepAllapot(jo, MOST).bajok, []);
assert.equal(bingTerkepSor(terkepAllapot(jo, MOST)), null);

// 3) a 11-07-i valódi eset: sitemap Failed, a hírtérkép hiányzik
const rossz = [
  { Url: 'https://aiworldhq.com/feed.xml', Status: 'Success', LastCrawled: d(MOST - 7 * NAP), Submitted: d(MOST - 130 * NAP), UrlCount: 40 },
  { Url: 'https://aiworldhq.com/sitemap.xml', Status: 'Failed', LastCrawled: d(Date.parse('2026-11-07T04:28:03Z')), Submitted: d(MOST - 130 * NAP), UrlCount: 0 }
];
const a = terkepAllapot(rossz, MOST);
assert.equal(a.bajok.length, 2);
assert.ok(a.bajok.some(b => b.url.endsWith('/sitemap.xml') && /sikertelen/.test(b.ok)));
assert.ok(a.bajok.some(b => b.url.endsWith('/news-sitemap.xml') && /nem ismeri/.test(b.ok)));
const sor = bingTerkepSor(a);
assert.match(sor, /^🔍 Bing-térkép: ⚠️/);
assert.match(sor, /sitemap\.xml/);
assert.match(sor, /11-07/, 'a sor megmondja, mikor olvasta utoljára');
assert.ok(!/feed\.xml/.test(sor), 'a nem elvárt feed.xml nem számít');

// 4) régóta nem olvasta (Success, de 3 napja) → baj; 2 nap még rendben
// (11-17: 4 → 2 nap — a Bing 3 nap után már pirosan jelzett: „fontos új lapok hiányoznak a térképről”)
const regi = n => [{ ...jo[0], LastCrawled: d(MOST - n * NAP) }, jo[1]];
assert.equal(terkepAllapot(regi(2), MOST).bajok.length, 0);
assert.equal(terkepAllapot(regi(3), MOST).bajok.length, 1, '🔴 3 napos beolvasásnál a Bing már pirosan jelez — szólnunk kell');
assert.match(terkepAllapot(regi(3), MOST).bajok[0].ok, /napja/);

// 5) Pending: friss beküldés után rendben, 3 napnál tovább ragadva baj
const fugg = n => [{ ...jo[0], Status: 'Pending', Submitted: d(MOST - n * NAP), LastCrawled: d(MOST - 7 * NAP) }, jo[1]];
assert.equal(terkepAllapot(fugg(1), MOST).bajok.length, 0, 'friss beküldés: a Bing még dolgozik rajta');
assert.equal(terkepAllapot(fugg(4), MOST).bajok.length, 1);
assert.match(terkepAllapot(fugg(4), MOST).bajok[0].ok, /feldolgozásra vár/);

// 6) az újraküldés után a sor ezt is kimondja
assert.match(bingTerkepSor(a, { ujrakuldve: ['https://aiworldhq.com/sitemap.xml'] }), /újraküldtem/);

// 7) újraküldés legfeljebb 2 naponta (lehűlés)
assert.equal(ujrakuldesKell(a, null, MOST), true);
assert.equal(ujrakuldesKell(a, { utolsoUjrakuldes: new Date(MOST - 1 * NAP).toISOString() }, MOST), false);
assert.equal(ujrakuldesKell(a, { utolsoUjrakuldes: new Date(MOST - 3 * NAP).toISOString() }, MOST), true);
assert.equal(ujrakuldesKell(terkepAllapot(jo, MOST), null, MOST), false, 'rendben → nincs újraküldés');
assert.equal(ujrakuldesKell(a, { utolsoUjrakuldes: 'rossz' }, MOST), true, 'hibás dátum ne ragassza be');

// 8) a lekérdezés hibája sosem dob; kulcs nélkül nincs hívás
let hivas = 0;
assert.equal(await bingTerkepek('', async () => { hivas++; }), null);
assert.equal(hivas, 0);
assert.equal(await bingTerkepek('k', async () => { throw new Error('nincs net'); }), null);
assert.equal(await bingTerkepek('k', async () => ({ ok: false, status: 500, json: async () => ({}) })), null);
assert.equal(await bingTerkepek('k', async () => ({ ok: true, json: async () => ({ d: 'nem tömb' }) })), null);
assert.deepEqual(await bingTerkepek('k', async () => ({ ok: true, json: async () => ({ d: jo }) })), jo);
// nem-tömb / null bemenet → nincs sor, nincs kivétel
assert.equal(bingTerkepSor(terkepAllapot(null, MOST)), null);

// 9) újraküldés: a hibás hívás nem dob, csak a sikereset adja vissza
const kuldott = [];
const ok = await ujrakuld('k', ELVART_TERKEPEK, async (u, o) => { kuldott.push(JSON.parse(o.body).feedUrl); return { ok: true }; });
assert.deepEqual(ok, ELVART_TERKEPEK);
assert.deepEqual(kuldott, ELVART_TERKEPEK);
assert.deepEqual(await ujrakuld('k', ELVART_TERKEPEK, async () => { throw new Error('x'); }), []);
assert.ok(ELVART_TERKEPEK.every(u => u.startsWith('https://aiworldhq.com/')));

console.log('✅ bing-terkep: minden rendben');
