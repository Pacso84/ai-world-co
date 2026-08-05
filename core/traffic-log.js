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

// Egy nap adatának beillesztése. Friss napot felülír, régit érintetlenül hagy,
// és üres lekérdezés-eredménnyel SOHA nem töröl meglévő adatot.
export function mergeDay(log, day, rows, today) {
  const out = { ...log };
  if (!rows || !rows.length) return out;          // sikertelen lekérdezés: ne rontsunk
  const known = day in out;
  const fresh = dayAge(day, today) < RECENT_DAYS;
  if (known && !fresh) return out;                // a történelem nem mozdul
  out[day] = rows.map(r => ({ path: r.path, visits: r.visits, views: r.views }));
  return out;
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
async function fetchDay(day) {
  const token = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !account) throw new Error('nincs CF_ANALYTICS_TOKEN vagy CLOUDFLARE_ACCOUNT_ID');

  const since = day + 'T00:00:00Z';
  const until = new Date(Date.parse(since) + 86400000).toISOString();
  const q = `query($account: String!, $since: Time!, $until: Time!) {
    viewer { accounts(filter: {accountTag: $account}) {
      pages: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until}, limit: 200, orderBy: [count_DESC]) {
        count sum { visits } dimensions { requestPath }
      }
    } }
  }`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { account, since, until } }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error('CF GraphQL HTTP ' + r.status);
  const data = await r.json();
  if (data.errors?.length) throw new Error('CF GraphQL: ' + String(data.errors[0].message).slice(0, 90));
  const rows = data.data?.viewer?.accounts?.[0]?.pages || [];
  return rows
    .filter(x => x.dimensions?.requestPath)
    .map(x => ({ path: x.dimensions.requestPath, visits: x.sum?.visits || 0, views: x.count || 0 }));
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
      + String(rows.length).padStart(3) + ' oldal  ' + '█'.repeat(Math.min(40, Math.round(v / 2))));
  }

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
  for (let i = 1; i <= RECENT_DAYS; i++) {
    const day = new Date(Date.parse(today + 'T00:00:00Z') - i * 86400000).toISOString().slice(0, 10);
    const known = day in merged;
    if (known && dayAge(day, today) >= RECENT_DAYS) { skipped++; continue; }
    try {
      const rows = await fetchDay(day);
      merged = mergeDay(merged, day, rows, today);
      const v = rows.reduce((s, r) => s + r.visits, 0);
      console.log('  ' + day + ': ' + v + ' belépő, ' + rows.length + ' oldal'
        + (known ? ' (frissítve)' : ' (új)'));
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
