// ===================================================================
// FORGALOM-NAPLÓ  —  cikkenkénti napi látogatottság
// ===================================================================
//
// MIÉRT KELL NAPLÓZNI, MIÉRT NEM ELÉG LEKÉRDEZNI?
// A Cloudflare Web Analytics a ~7 napnál régebbi napokat TÍZESRE KEREKÍTI
// (bizonyítva 2026-08-03: ugyanaz a nap 19 vs 10 a lekérdezés korától
// függően). Ami ma pontos, jövő héten már nem az. Amit nem mentünk el,
// az elveszett.
//
// MIRE VÁLASZOL:
//   - melyik cikk hoz olvasót és melyik nem
//   - a napok közti háromszoros szórás a TARTALOMBÓL jön-e vagy a napból
//   - az örökzöld útmutatók kiküldése hoz-e bármit (2026-08-04 óta)
//
// KÖLTSÉG: $0 — nincs benne AI-hívás.
//
// KI ÍRJA: KIZÁRÓLAG a CI. Helyben csak OLVASD (`--report`). Ha helyben
// is írnád, a következő `git pull` ütközne — pontosan ez történt
// 2026-08-05-én a core/budget-state.json-nal.
// ===================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, '..', 'memory', 'traffic-log.json');

// A Cloudflare adata KÉSHET, ezért az utolsó néhány napot mindig újraírjuk.
// Az ennél régebbit soha — azt már úgyis kerekítve kapnánk vissza.
export const RECENT_DAYS = 3;

// Meddig tartjuk meg? 120 nap bőven elég a trendhez, és a fájl ~200 KB
// alatt marad (napi ~16 sor, soronként ~60 bájt).
export const KEEP_DAYS = 120;

const dayAge = (day, today) =>
  Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000);

// ---------- TISZTA LOGIKA (ez van tesztelve) ----------

// 2026-10-16 élesben: egy futás végén a Cloudflare a 42 és 47 soros jó napok helyett napi
// EGY sort adott (visits = views = 100), és az felülírta a meglévő adatot — a törlés ebből
// olvasatlannak látta volna az aznap olvasott útmutatókat. Egy múltbeli napra később érkező
// adat csak BŐVÜLHET: a meglévő sorszám felénél szegényebb válasz nem írhat felül.
export const SZEGENY_ARANY = 0.5;

// Egy nap adatának beillesztése. Friss napot felülír, régit érintetlenül hagy,
// és üres vagy sokkal szegényebb lekérdezés-eredménnyel SOHA nem ront meglévő adatot.
export function mergeDay(log, day, rows, today) {
  const out = { ...log };
  if (!rows || !rows.length) return out;          // sikertelen lekérdezés: ne rontsunk
  const known = day in out;
  const fresh = dayAge(day, today) < RECENT_DAYS;
  if (known && !fresh) return out;                // a történelem nem mozdul
  // BECSÜLT NAP (10-26): a még órás bontásban is mintavételezett nap jelölve kerül be. Pontos napot
  // becsült adat nem ír felül; a becsültet a később érkező pontos igen (akkor is, ha kevesebb sora van).
  const regiBecsult = known && (out[day] || []).some(r => r.becsult), ujBecsult = rows.some(r => r.becsult);
  if (known && ujBecsult && !regiBecsult) return out;
  // két becsült válasz: minden minta véletlen → ÖSSZEVONVA, oldalanként a nagyobb szám (az újabb minta ne
  // törölje a régebbiben látott olvasást — független átnézés 10-26)
  if (regiBecsult && ujBecsult) {
    const m = new Map(out[day].map(r => [r.path, r]));
    for (const r of rows) if (!m.has(r.path) || r.visits > m.get(r.path).visits) m.set(r.path, { path: r.path, visits: r.visits, views: r.views, becsult: true });
    out[day] = [...m.values()];
    return out;
  }
  if (known && !(regiBecsult && !ujBecsult) && rows.length < SZEGENY_ARANY * (out[day]?.length || 0)) return out;   // hibás válasz: ne rontsunk
  out[day] = rows.map(r => ({ path: r.path, visits: r.visits, views: r.views, ...(r.becsult ? { becsult: true } : {}) }));
  return out;
}

// Mintavételezett-e a Cloudflare-válasz? (sampleInterval > 1: egy rögzített esemény N látogatást
// jelent — a 10-16-i „1 sor, 100 látogató" erre vall.) Ilyen napot órás darabokban kérünk le; ha még
// úgy is mintavételezett, BECSÜLT jelöléssel kerül be (10-26, lásd mergeDay és guide-prune MAX_BECSULT).
export function mintavetelezett(nyers) {
  return (Array.isArray(nyers) ? nyers : []).some(x => Number(x?.avg?.sampleInterval) > 1);
}

// ── A MINTAVÉTELEZETT NAP PÓTLÁSA (2026-10-25) ───────────────────────
// 10-23-at a Cloudflare egész napra csak mintavételezve adta → a nap kimaradt a naplóból, és a
// hírtörlés (75 egybefüggő nap kell) leállt volna 75 napra. A kisebb lekérdezést a Cloudflare
// pontosan adja → a mintavételezett napot 6 órás, kell esetén 1 órás darabokban kérjük le.
// A hiányzó napot 6 napig újrapróbáljuk (7 napon túl a Cloudflare tízesre kerekít → hamis nullák).
const POTLAS_NAP = 6;

/** Lekérdezendő napok: az utolsó `recent` nap + az utolsó `potlas` nap HIÁNYZÓ (vagy üres) napjai, újabb elöl. */
export function lekerdezendoNapok(today, log, recent = RECENT_DAYS, potlas = POTLAS_NAP) {
  const ki = [];
  for (let i = 1; i <= Math.max(recent, potlas); i++) {
    const day = new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    const van = Array.isArray(log?.[day]) && log[day].length > 0;
    if (i <= recent || !van) ki.push(day);
  }
  return ki;
}

/** A nap `darab` egyenlő időablakra bontva: [[since, until], …] (ISO). */
export function napAblakok(day, darab) {
  const t0 = Date.parse(day + 'T00:00:00Z'), lepes = 86400000 / darab;
  return Array.from({ length: darab }, (_, i) => [new Date(t0 + i * lepes).toISOString(), new Date(t0 + (i + 1) * lepes).toISOString()]);
}

/** Darabok sorai útvonalanként összeadva (az első előfordulás sorrendjében). */
export function sorokOsszevonasa(reszek) {
  const m = new Map();
  for (const sorok of reszek || []) for (const r of sorok || []) {
    const v = m.get(r.path) || { path: r.path, visits: 0, views: 0 };
    v.visits += Number(r.visits) || 0; v.views += Number(r.views) || 0;
    m.set(r.path, v);
  }
  return [...m.values()];
}

export function pruneOld(log, today) {
  const out = {};
  for (const [day, rows] of Object.entries(log)) {
    if (dayAge(day, today) <= KEEP_DAYS) out[day] = rows;
  }
  return out;
}

// Rangsor BELÉPŐ szerint — nem letöltés szerint. A belépő az, aki kívülről
// érkezett; a letöltés a belső kattintgatást is tartalmazza.
export function topPages(rows, n) {
  return (rows || [])
    .filter(r => (r.visits || 0) > 0)
    .sort((a, b) => (b.visits || 0) - (a.visits || 0))
    .slice(0, n);
}

// ===================================================================
// OLVASÁSI MÉLYSÉG (2026-08-15) — hány oldalt néz meg EGY belépő?
// ===================================================================
// MIÉRT EZ A SZÁM: a valódi olvasókra mérve 1,04 oldal/látogató, vagyis
// GYAKORLATILAG MINDENKI egyetlen cikket olvas és távozik. A forgalmunk 82%-a
// a Facebookról jön egy konkrét cikkre; ha ott nincs értelmes következő lépés,
// a látogató elmegy. Ez az EGYETLEN forgalmi szám, ami új közönség NÉLKÜL is
// mozgatható — és pont ezért ezt kell tudnunk követni.
//
// ⚠️ A KORÁBBI 1,25 / 1,17 SZÁM HAMIS VOLT (javítva 2026-08-19): a saját
// magyar nyelvű böngészésünket is beleszámolta. Lásd a NEM_KOZONSEG
// szűrőt lentebb. A 17 napos naplóra: 1,24 szűrés nélkül, 1,04 szűréssel.
// A riport „+0,04 javulása" ennek az ingadozása volt, nem trend.
//
// ⚠️ AZ ADAT MÁR ITT VOLT: a napló kezdettől rögzíti a `views` mezőt, csak
// soha nem számoltunk belőle arányt. Nem új gyűjtés kell, csak elosztás.
//
// A `visits` a KÍVÜLRŐL érkezőt jelenti, a `views` minden oldalletöltést.
// views/visits = 1,00 → mindenki egy oldalt néz és távozik.

/** Egy nap (vagy bármely sorhalmaz) olvasási mélysége. 0, ha nincs belépő. */
// A SAJÁT BÖNGÉSZÉSÜNK ÚTVONALAI (2026-08-19, mérve).
// A /hu/ 17 nap alatt 5 belépőt hozott és 148 oldalmegtekintést — az 29,6
// oldal/látogató. Ez nem közönség: a forgalmunk 82%-a a Facebookról jön,
// amerikai olvasóknak, és minden egyes napon volt magyar oldalmegtekintés,
// a legtöbbön 0 rögzített belépővel (vagyis folytatódó munkamenet).
// A belépők 1,7%-a, DE az oldalmegtekintések 17,5%-a — és pont az
// oldalmegtekintés a mélység SZÁMLÁLÓJA. Emiatt mutatott a riport 1,24-et
// ott, ahol a valódi olvasók 1,04-en állnak, és emiatt látszott „+0,04
// javulásnak" az, ami a saját kattintgatásunk ingadozása volt.
//
// ⚠️ A SPANYOL BENT MARAD: a /es/ mért értéke 1,43 oldal/látogató — normális
// olvasói minta. Kizárni annyi lenne, mint letagadni egy valódi közönséget.
// A látogatószámokhoz sem nyúlunk: egy belépő attól még belépő. CSAK a
// mélység-mutató torzult.
const NEM_KOZONSEG = /^\/hu(\/|$)/;

/** Beleszámít-e ez az útvonal az olvasói mélységbe? Ismeretlen útvonal: IGEN. */
export function isAudiencePath(path) {
  if (typeof path !== 'string' || !path) return true;
  return !NEM_KOZONSEG.test(path);
}

export function depth(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter(r => isAudiencePath(r?.path));
  let visits = 0, views = 0;
  for (const r of list) { visits += Number(r?.visits) || 0; views += Number(r?.views) || 0; }
  return visits > 0 ? views / visits : 0;
}

/**
 * Mélység-trend: a legutóbbi `win` nap a megelőző `win` naphoz mérve.
 * Ebből derül ki, hogy egy változtatás (pl. jobb kapcsolódó linkek) HATOTT-E.
 * Ha nincs elég nap az összevetéshez, `previous` null — akkor NE hasonlítsunk.
 */
export function depthTrend(days, win = 7) {
  const keys = Object.keys(days || {}).sort();
  const w = Math.max(1, Number(win) || 7);
  const sorok = k => k.flatMap(d => days[d] || []);
  const utolso = keys.slice(-w);
  const elozo = keys.slice(-2 * w, -w);
  return {
    recent: depth(sorok(utolso)),
    previous: elozo.length >= w ? depth(sorok(elozo)) : null,
    days: utolso.length
  };
}

// ===================================================================
// 🤖 ROBOTSZŰRŐ (2026-10-22, user: „ez nagyon torzítja a munkánkat!”)
// ===================================================================
// 10-22-én 16 UTC-kor egy szingapúri, Windows + Chrome asztali „látogató” EGY óra alatt 527 oldalt
// töltött be — 521 KÜLÖNBÖZŐ angol cikket, hivatkozó nélkül: végiglapozó robot. Valódi böngészőként
// futott, ezért a Cloudflare RUM és az AdSense is látogatónak számolta (az AdSense ~500 megtekintést
// mutatott). A naplóban az olvasatlan cikkeket „olvasottnak” mutatná → a törlés 2–3 hónapot csúszna,
// és minden forgalmi szám torzulna.
// ISMÉRV: egy (ország, óra, eszköztípus) vödörben legalább ROBOT_MIN látogatás, és a látogatások
// legalább ROBOT_SZORAS része KÜLÖNBÖZŐ oldalra megy. A valódi napokon a legnagyobb vödör 10–20
// (mérve 10-19…21); egy Facebookon berobbanó cikk sok látogatást hoz, de UGYANARRA az oldalra.
export const ROBOT_MIN = 60;
export const ROBOT_SZORAS = 0.6;
// A napi lekérdezés sorkorlátja (200 volt; a robotos napon 500+ különböző útvonal jön — a levonás előtt
// mindet látni kell). A core/guide-prune.js CSONKA_SOR-ja ezt követi.
export const NAPI_LIMIT = 1000;

/** A robotos vödrök: [{orszag, ora, eszkoz, latogatas, oldalak}] közül a végiglapozók. */
export function robotVodrok(vodrok) {
  return (vodrok || []).filter(v => (Number(v?.latogatas) || 0) >= ROBOT_MIN && (Number(v?.oldalak) || 0) >= ROBOT_SZORAS * v.latogatas);
}

/** A robot sorainak levonása a nap soraiból (útvonalanként); a nullára fogyott sor kiesik. */
export function robotLevonas(sorok, robotSorok) {
  const le = new Map();
  for (const r of robotSorok || []) {
    const x = le.get(r.path) || { visits: 0, views: 0 };
    x.visits += Number(r.visits) || 0; x.views += Number(r.views) || 0;
    le.set(r.path, x);
  }
  return (sorok || [])
    .map(r => { const x = le.get(r.path); return x ? { ...r, visits: Math.max(0, (r.visits || 0) - x.visits), views: Math.max(0, (r.views || 0) - x.views) } : r; })
    .filter(r => (r.visits || 0) > 0 || (r.views || 0) > 0);
}

// ---------- I/O ----------

export function loadLog() {
  if (!existsSync(LOG_PATH)) return {};
  try { return JSON.parse(readFileSync(LOG_PATH, 'utf-8')).days || {}; }
  catch { return {}; }
}

function saveLog(days) {
  const body = {
    _meta: {
      note: 'Cikkenkénti napi forgalom. Írja: core/traffic-log.js a CI-ban. Helyben CSAK olvasd.',
      updated: new Date().toISOString()
    },
    days
  };
  writeFileSync(LOG_PATH, JSON.stringify(body, null, 2), 'utf-8');
}

// Egy NAP oldalankénti forgalma a Cloudflare-től. 1 napos ablak, mert a
// hosszabb ablak tízesre kerekít.
async function gql(query, variables) {
  const token = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error('CF GraphQL HTTP ' + r.status);
  const data = await r.json();
  if (data.errors?.length) throw new Error('CF GraphQL: ' + String(data.errors[0].message).slice(0, 90));
  return data.data?.viewer?.accounts?.[0] || {};
}

export async function fetchDay(day) {   // exportálva: a robotszűrő élő próbájához (írás nélkül)
  const token = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !account) throw new Error('nincs CF_ANALYTICS_TOKEN vagy CLOUDFLARE_ACCOUNT_ID');

  const since = day + 'T00:00:00Z';
  const until = new Date(Date.parse(since) + 86400000).toISOString();
  const q = `query($account: String!, $since: Time!, $until: Time!) {
    viewer { accounts(filter: {accountTag: $account}) {
      pages: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until}, limit: ${NAPI_LIMIT}, orderBy: [count_DESC]) {
        count sum { visits } avg { sampleInterval } dimensions { requestPath }
      }
    } }
  }`;
  const lekerAblak = async (s, u) => (await gql(q, { account, since: s, until: u })).pages || [];
  const sorokbol = nyers => nyers
    .filter(x => x.dimensions?.requestPath)
    .map(x => ({ path: x.dimensions.requestPath, visits: x.sum?.visits || 0, views: x.count || 0 }));
  const nyers = await lekerAblak(since, until);
  let rows, becsult = false;
  if (!mintavetelezett(nyers)) rows = sorokbol(nyers);
  else {
    // 10-25: mintavételezett nap → 6 órás, kell esetén 1 órás darabok (a határ előtt 1 ms-mal zárva: nincs dupla számolás)
    const reszek = [];
    const veg = u => new Date(Date.parse(u) - 1).toISOString();
    for (const [s, u] of napAblakok(day, 4)) {
      const n = await lekerAblak(s, veg(u));
      if (!mintavetelezett(n)) { reszek.push(sorokbol(n)); continue; }
      for (const [hs, hu] of napAblakok(day, 24).filter(([a]) => a >= s && a < u)) {
        const hn = await lekerAblak(hs, veg(hu));
        // 10-26 (user: „csináld!”): a 10-23 órásan is mintavételezett volt, és a kimaradt nap a hírtörlést
        // ~januárig leállította volna → az ilyen óra BECSÜLT adatként kerül be (a sorok jelölve, lásd mergeDay)
        if (mintavetelezett(hn)) becsult = true;
        reszek.push(sorokbol(hn));
      }
    }
    rows = sorokOsszevonasa(reszek);
  }

  // 🤖 ROBOTSZŰRŐ: (ország, óra, eszköz) vödrök; a nagyoknál megnézzük, hány KÜLÖNBÖZŐ oldalra ment
  const vq = `query($account: String!, $since: Time!, $until: Time!) {
    viewer { accounts(filter: {accountTag: $account}) {
      v: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until}, limit: 2000, orderBy: [sum_visits_DESC]) {
        sum { visits } dimensions { countryName datetimeHour deviceType }
      }
    } }
  }`;
  const vodrok = [], robotSorok = [];
  for (const x of ((await gql(vq, { account, since, until })).v || []).filter(x => (x.sum?.visits || 0) >= ROBOT_MIN)) {
    const d = x.dimensions || {};
    const h1 = new Date(Date.parse(d.datetimeHour) + 3600e3 - 1000).toISOString();
    const pq = `query($account: String!, $since: Time!, $until: Time!, $c: String!, $d: String!) {
      viewer { accounts(filter: {accountTag: $account}) {
        p: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until, countryName: $c, deviceType: $d}, limit: ${NAPI_LIMIT}) {
          count sum { visits } dimensions { requestPath }
        }
      } }
    }`;
    const p = (await gql(pq, { account, since: d.datetimeHour, until: h1, c: d.countryName, d: d.deviceType })).p || [];
    const v = { orszag: d.countryName, ora: d.datetimeHour, eszkoz: d.deviceType, latogatas: x.sum.visits, oldalak: p.length };
    if (robotVodrok([v]).length) {
      vodrok.push(v);
      for (const r of p) if (r.dimensions?.requestPath) robotSorok.push({ path: r.dimensions.requestPath, visits: r.sum?.visits || 0, views: r.count || 0 });
    }
  }
  const tisztitott = robotLevonas(rows, robotSorok);
  return { rows: becsult ? tisztitott.map(r => ({ ...r, becsult: true })) : tisztitott, robot: vodrok, becsult };
}

// ---------- riport (helyben is futtatható, csak olvas) ----------

function report(days) {
  const keys = Object.keys(days).sort();
  if (!keys.length) { console.log('A napló még üres — az első CI-futás tölti fel.'); return; }

  console.log('📊 FORGALOM-NAPLÓ — ' + keys.length + ' nap ('
    + keys[0] + ' … ' + keys[keys.length - 1] + ')\n');

  console.log('=== NAPONKÉNT ===');
  for (const d of keys.slice(-14)) {
    const rows = days[d];
    const v = rows.reduce((s, r) => s + (r.visits || 0), 0);
    console.log('  ' + d + '  ' + String(v).padStart(3) + ' belépő · '
      + String(rows.length).padStart(3) + ' oldal · ' + depth(rows).toFixed(2) + ' o/l  '
      + '█'.repeat(Math.min(40, Math.round(v / 2))));
  }

  // OLVASÁSI MÉLYSÉG — a legfontosabb mozgatható szám (lásd a depth() fejlécét).
  const tr = depthTrend(days, 7);
  console.log('\n=== OLVASÁSI MÉLYSÉG (oldal / látogató) ===');
  console.log('  utolsó ' + tr.days + ' nap: ' + tr.recent.toFixed(2)
    + (tr.previous !== null
      ? '   ·   megelőző 7 nap: ' + tr.previous.toFixed(2)
        + '   ·   változás: ' + (tr.recent >= tr.previous ? '+' : '') + (tr.recent - tr.previous).toFixed(2)
      : '   (a megelőző héthez még nincs elég adat)'));
  console.log('  1,00 = mindenki EGY oldalt néz meg és távozik.');

  // Cikkenkénti összesítés a teljes naplóból: mennyit hozott, hány napon át.
  const byPath = new Map();
  for (const d of keys) {
    for (const r of days[d]) {
      const e = byPath.get(r.path) || { visits: 0, views: 0, days: 0 };
      e.visits += r.visits || 0; e.views += r.views || 0;
      if ((r.visits || 0) > 0) e.days++;
      byPath.set(r.path, e);
    }
  }
  const ranked = [...byPath].filter(([, e]) => e.visits > 0)
    .sort((a, b) => b[1].visits - a[1].visits);

  console.log('\n=== A LEGTÖBB OLVASÓT HOZÓ OLDALAK ===');
  for (const [p, e] of ranked.slice(0, 15)) {
    console.log('  ' + String(e.visits).padStart(4) + ' belépő · ' + String(e.days).padStart(2)
      + ' napon · ' + p.slice(0, 62));
  }

  const total = ranked.reduce((s, [, e]) => s + e.visits, 0);
  const top10 = ranked.slice(0, 10).reduce((s, [, e]) => s + e.visits, 0);
  console.log('\n  összes belépő: ' + total + ' · ebből a legjobb 10 oldal: ' + top10
    + ' (' + (total ? Math.round(top10 / total * 100) : 0) + '%)');
  console.log('  ⚠️  Két hétnél rövidebb naplóból még ne vonj le következtetést.');
}

// ---------- main ----------

async function main() {
  const days = loadLog();

  if (process.argv.includes('--report')) { report(days); return; }

  const today = new Date().toISOString().slice(0, 10);
  let merged = days;
  let ok = 0, skipped = 0;

  // Az utolsó RECENT_DAYS napot próbáljuk — a késve érkező adat így beér,
  // és egy kihagyott futás sem hagy lyukat a naplóban.
  // 10-25: + az utolsó 6 nap HIÁNYZÓ napjai is (a mintavételezés miatt kimaradt nap pótlása)
  for (const day of lekerdezendoNapok(today, merged)) {
    const known = day in merged;
    if (known && dayAge(day, today) >= RECENT_DAYS) { skipped++; continue; }
    try {
      const { rows, robot, becsult } = await fetchDay(day);
      const regi = merged[day];
      merged = mergeDay(merged, day, rows, today);
      const v = rows.reduce((s, r) => s + r.visits, 0);
      console.log('  ' + day + ': ' + v + ' belépő, ' + rows.length + ' oldal'
        + (!known ? ' (új)' : merged[day] !== regi ? ' (frissítve)'
          : ` (⚠️ szegényebb vagy becsült válasz a meglévő ${regi.length} soros napnál — megtartva)`)
        + (becsult ? ' (becsült — a Cloudflare órásan is mintavételezett)' : ''));
      for (const v of robot) console.log(`  🤖 ${day}: robot kiszűrve — ${v.orszag} ${String(v.ora).slice(11, 16)} UTC ${v.eszkoz}: ${v.latogatas} látogatás, ${v.oldalak} különböző oldal`);
      ok++;
    } catch (e) {
      console.log('  ' + day + ': kihagyva — ' + String(e.message).slice(0, 70));
    }
  }

  merged = pruneOld(merged, today);
  saveLog(merged);
  console.log('📈 forgalom-napló: ' + ok + ' nap rögzítve, ' + skipped
    + ' változatlan, ' + Object.keys(merged).length + ' nap a naplóban');
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('traffic-log.js');
if (invokedDirectly) main().catch(e => { console.log('forgalom-napló hiba: ' + e.message); });
