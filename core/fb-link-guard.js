// ===================================================================
// FACEBOOK-LINKKORLÁT-ŐR (2026-10-19)
// ===================================================================
// MIÉRT: a forgalom ~82%-a a Facebookról jön. A Meta 2025 decembere óta teszteli,
// hogy a nem fizető oldalak havonta csak 2 posztban oszthassanak meg külső
// linket; Mari Smith (2026-09-29) szerint a kiterjesztés folyamatban van, és
// már a KOMMENTBE tett link is számít. Ha ez elér minket, a forgalom
// négyötöde napok alatt eltűnhet — és eddig semmi nem szólt volna róla.
// (Kutatás: memoria/reports/Látogatószerzés a mostani oldalra.md)
//
// MIT CSINÁL: naponta (CI) rögzíti az utolsó 3 lezárt napra
//   • hány látogató jött a Facebookról (Cloudflare RUM, hivatkozó-cím),
//   • hány posztunk ment ki aznap a Facebookra (link-poszt + Reel),
// és ha KÉT egymást követő napon a Facebookról jött látogatók száma az előző
// két hét mediánjának FELE alá esik, Telegramon szól. Ha a posztok sem mentek
// ki, a posztolást (Make) gyanúsítja, nem a korlátot. Egy esetre egyszer szól,
// és egyszer jelez, amikor helyreállt.
//
// FUTTATÁS: KIZÁRÓLAG a CI (`memory/fb-link-guard.json`-t írja). Importja biztonságos.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLAPOT = join(ROOT, 'memory', 'fb-link-guard.json');

/** Ennyi nap kell az összehasonlítási alaphoz. */
export const ALAP_NAP = 7;
/** Az alap legfeljebb ennyi napra néz vissza (a két vizsgált nap előtt). */
export const ALAP_MAX = 14;
/** Ennél kisebb napi Facebook-forgalomnál a zaj nagyobb, mint a jel → hallgat. */
export const MIN_ALAP = 10;
/** A riasztási küszöb: az alap ekkora hányada alá kell esnie. */
export const ARANY = 0.5;
/** Ennyi napig nem ismétli ugyanazt a riasztást. */
export const CSEND_NAP = 3;
/** Ennyi napot őriz meg. */
export const MEGORZES_NAP = 60;

const NAP_MS = 864e5;

/** Facebook-hivatkozó-e a cím (l./lm./m./www./web.facebook.com, fb.me, fb.com). */
export function fbHost(h) {
  return /(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(String(h || '').toLowerCase().trim());
}

/** Hány Facebook-poszt ment ki az adott UTC-napon: link-poszt (social_at) + Reel (reel_at). */
export function posztokNapra(cikkek, nap) {
  let db = 0;
  for (const m of Array.isArray(cikkek) ? cikkek : []) {
    if (String(m?.social_at || '').slice(0, 10) === nap) db++;
    if (String(m?.reel_at || '').slice(0, 10) === nap) db++;
  }
  return db;
}

export function median(szamok) {
  const s = [...szamok].sort((a, b) => a - b);
  if (!s.length) return null;
  const k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

const napKulonbseg = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / NAP_MS);

/**
 * A döntés. `napok`: { 'ÉÉÉÉ-HH-NN': { fb, posztok } }, `allapot`: { riasztva?: nap }.
 * @returns {{riaszt:boolean, kuld:boolean, helyreallt:boolean, alap:number|null, ok:string, uzenet:string}}
 */
export function dontes(napok, allapot = {}) {
  const kulcsok = Object.keys(napok || {}).sort();
  const ures = (ok) => ({ riaszt: false, kuld: false, helyreallt: false, alap: null, ok, uzenet: '' });
  if (kulcsok.length < ALAP_NAP + 2) return ures(`kevés adat (${kulcsok.length} nap, kell ${ALAP_NAP + 2})`);

  const utolso2 = kulcsok.slice(-2);
  const alapNapok = kulcsok.slice(-2 - ALAP_MAX, -2);
  const alap = median(alapNapok.map(k => napok[k].fb || 0));
  if (alapNapok.length < ALAP_NAP || alap === null) return ures('kevés adat az alaphoz');
  if (alap < MIN_ALAP) return { ...ures(`túl kicsi a Facebook-forgalom a megbízható riasztáshoz (medián ${alap}/nap)`), alap };

  const [a, b] = utolso2.map(k => napok[k]);
  const rossz = (a.fb || 0) < alap * ARANY && (b.fb || 0) < alap * ARANY;
  const nap = utolso2[1];
  const szamok = `${utolso2[0]}: ${a.fb || 0} látogató (${a.posztok || 0} poszt) · ${nap}: ${b.fb || 0} látogató (${b.posztok || 0} poszt) · `
    + `megszokott szint: ${Math.round(alap)} látogató/nap`;

  if (rossz) {
    const nemMentKi = !(a.posztok || 0) && !(b.posztok || 0);
    const uzenet = '🚨 FACEBOOK-FORGALOM ÖSSZEESETT — két napja a megszokott szint fele alatt.\n' + szamok + '\n'
      + (nemMentKi
        ? 'A posztok nem mentek ki ezeken a napokon → valószínűleg a posztolás (Make) állt le, nem a linkkorlát. Nézd meg a Make-futásokat.'
        : 'A posztok kimentek, mégsem jön látogató → gyanú: a Meta linkkorlátja. Nézd meg a Facebook-oldal értesítéseit (linkkorlát / „link limit”), és szólj Claude-nak: a tartaléktervet élesítjük.');
    const mar = allapot && allapot.riasztva && napKulonbseg(nap, allapot.riasztva) < CSEND_NAP;
    return { riaszt: true, kuld: !mar, helyreallt: false, alap, ok: 'riasztás', uzenet };
  }
  if (allapot && allapot.riasztva) {
    return { riaszt: false, kuld: true, helyreallt: true, alap, ok: 'helyreállt',
      uzenet: '✅ A Facebook-forgalom helyreállt a riasztás óta.\n' + szamok };
  }
  return { riaszt: false, kuld: false, helyreallt: false, alap, ok: 'rendben', uzenet: '' };
}

/**
 * Egy sor a napi Telegram-riportba (core/daily-report.js). Riasztásnál ⚠️-vel
 * kezdődik, hogy a riport zajszűrője napokig ismétlődve se némítsa el; rendben
 * egy rövid számsor; adat nélkül üres.
 */
export function riportSor(allapot) {
  const napok = allapot && allapot.napok;
  const kulcsok = Object.keys(napok || {}).sort();
  if (!kulcsok.length) return '';
  const utolso = kulcsok.at(-1), u = napok[utolso];
  const alap = Number.isFinite(allapot.alap) ? Math.round(allapot.alap) : null;
  if (allapot.riasztva) {
    return `⚠️ Facebook-forgalom ${allapot.riasztva} óta a szokásos szint fele alatt (${utolso}: ${u.fb || 0} látogató, szokásos ~${alap ?? '?'}/nap) — linkkorlát vagy posztolási hiba gyanúja`;
  }
  return `📘 Facebookról tegnap: ${u.fb || 0} látogató, ${u.posztok || 0} poszt (szokásos ~${alap ?? '?'}/nap)`;
}

/** Az új napok beolvasztása; a megőrzési időnél régebbi napok kiesnek. */
export function osszevon(regi, uj, ma) {
  const ki = { ...(regi || {}), ...(uj || {}) };
  for (const k of Object.keys(ki)) if (napKulonbseg(ma, k) > MEGORZES_NAP) delete ki[k];
  return ki;
}

// ---------- I/O (csak a CI) ----------

async function fbLatogatok(nap) {
  const token = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !account) throw new Error('nincs CF_ANALYTICS_TOKEN vagy CLOUDFLARE_ACCOUNT_ID');
  const since = nap + 'T00:00:00Z', until = new Date(Date.parse(since) + NAP_MS).toISOString();
  const query = `query($account: String!, $since: Time!, $until: Time!) { viewer { accounts(filter: {accountTag: $account}) {
    r: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until, requestPath_notlike: "/hu/%"}, limit: 500) {
      sum { visits } dimensions { refererHost } }
  } } }`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account, since, until } }), signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error('CF GraphQL HTTP ' + r.status);
  const j = await r.json();
  if (j.errors?.length) throw new Error('CF GraphQL: ' + String(j.errors[0].message).slice(0, 90));
  return (j.data?.viewer?.accounts?.[0]?.r || [])
    .filter(x => fbHost(x.dimensions?.refererHost)).reduce((s, x) => s + (x.sum?.visits || 0), 0);
}

function cikkMetak() {
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) return [];
  const ki = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { ki.push(JSON.parse(readFileSync(join(dir, f), 'utf-8'))._meta || {}); } catch { /* sérült fájl: kihagyjuk */ }
  }
  return ki;
}

async function main() {
  const allapot = existsSync(ALLAPOT) ? JSON.parse(readFileSync(ALLAPOT, 'utf-8')) : {};
  const ma = new Date().toISOString().slice(0, 10);
  const metak = cikkMetak();
  const uj = {};
  for (let i = 1; i <= 3; i++) {
    const nap = new Date(Date.parse(ma + 'T00:00:00Z') - i * NAP_MS).toISOString().slice(0, 10);
    try { uj[nap] = { fb: await fbLatogatok(nap), posztok: posztokNapra(metak, nap) }; }
    catch (e) { console.log(`  ${nap}: kihagyva — ${String(e.message).slice(0, 70)}`); }
  }
  const napok = osszevon(allapot.napok, uj, ma);
  const d = dontes(napok, allapot);
  let riasztva = allapot.riasztva || null;
  if (d.kuld) {
    const { sendMessage } = await import('./telegram.js');
    await sendMessage(d.uzenet);
    if (d.riaszt) riasztva = Object.keys(napok).sort().at(-1);
  }
  if (d.helyreallt) riasztva = null;
  writeFileSync(ALLAPOT, JSON.stringify({
    _meta: { note: 'FB-linkkorlát-őr. Írja: core/fb-link-guard.js a CI-ban. Helyben CSAK olvasd.' },
    // `at`: a napi riport frissesség-őre ebből látja, hogy az őr lefutott-e (core/guard-freshness.js).
    at: new Date().toISOString(),
    riasztva, utolsoDontes: d.ok, alap: d.alap, napok
  }, null, 2) + '\n', 'utf-8');
  console.log(`📘 FB-őr: ${Object.keys(uj).map(k => `${k} ${uj[k].fb} látogató/${uj[k].posztok} poszt`).join(' · ')} → ${d.ok}${d.kuld ? ' (Telegram elküldve)' : ''}`);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('fb-link-guard.js');
if (kozvetlen) main().catch(e => console.log('FB-őr hiba: ' + e.message));
