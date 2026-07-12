// ===================================================================
// HETI KERESŐ-RIPORT — Google Search Console + Bing → Telegram
// ===================================================================
//
// User-kérés (2026-07-07): lássuk hetente, hogyan talál ránk a világ —
// és a Főnök szóljon magától, amikor a forgalom eléri a hírlevél-küszöböt.
//
// Vasárnaponként fut (a cron minden nap hívja, de csak vasárnap 7-15 UTC
// közt küld, heti dedup-pal). Kulcsok (mind OPCIONÁLIS — ami hiányzik,
// azt a riport kihagyja):
//   GSC_SA_JSON        — Google service-account JSON (GitHub Secret!)
//                        (a service-account e-mailt fel kell venni a GSC-ben olvasóként)
//   BING_WM_API_KEY    — Bing Webmaster API kulcs (GitHub Secret!)
//
// FUTTATÁS:  node core/search-report.js [--force]
// ===================================================================

import 'dotenv/config';
import crypto from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendMessage } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'memory', 'search-report-state.json');
const FORCE = process.argv.includes('--force');

const SITE = 'https://aiworldhq.com/';               // GSC property (URL-prefix)
const NEWSLETTER_DAILY_CLICKS = 50;                   // hírlevél-lámpa küszöb (napi átlag katt)

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil((((t - y) / 86400000) + 1) / 7)).padStart(2, '0');
}

function guard() {
  if (FORCE) return true;
  const now = new Date();
  if (now.getUTCDay() !== 0) { console.log('⏭️  Kereső-riport: nem vasárnap van — kihagyom.'); return false; }
  const h = now.getUTCHours();
  if (h < 7 || h > 15) { console.log('⏭️  Kereső-riport: a 7-15 UTC sávon kívül — kihagyom.'); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_week === isoWeek()) { console.log('⏭️  Kereső-riport: ezen a héten már ment.'); return false; }
  } catch { /* első futás */ }
  return true;
}

// ---------- Google Search Console (service-account JWT, SDK nélkül) ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function gscToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  const jwt = `${header}.${claims}.${b64url(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error('GSC token HTTP ' + r.status);
  return (await r.json()).access_token;
}
async function gscQuery(token, startDate, endDate, dimensions = []) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: dimensions.length ? 5 : 1 }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error('GSC query HTTP ' + r.status);
  return (await r.json()).rows || [];
}
function dstr(daysAgo) { return new Date(Date.now() - daysAgo * 86400e3).toISOString().slice(0, 10); }

async function getGoogle() {
  const raw = (process.env.GSC_SA_JSON || '').trim();
  if (!raw) return null;
  const sa = JSON.parse(raw);
  const token = await gscToken(sa);
  // A GSC adata ~2 napot késik → e hét: 9→3 napja; múlt hét: 16→10 napja
  const [cur] = await gscQuery(token, dstr(9), dstr(3));
  const [prev] = await gscQuery(token, dstr(16), dstr(10));
  const topQueries = await gscQuery(token, dstr(9), dstr(3), ['query']);
  return {
    clicks: cur?.clicks || 0, impressions: cur?.impressions || 0,
    prevClicks: prev?.clicks || 0,
    top: topQueries.map(q => `${q.keys[0]} (${q.clicks})`).slice(0, 3)
  };
}

// ---------- Bing Webmaster ----------
async function getBing() {
  const key = (process.env.BING_WM_API_KEY || '').trim();
  if (!key) return null;
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(SITE)}&apikey=${key}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('Bing HTTP ' + r.status);
  const rows = (await r.json()).d || [];
  const cutoff = Date.now() - 7 * 86400e3;
  let clicks = 0, impressions = 0;
  for (const row of rows) {
    const t = parseInt((String(row.Date).match(/\d+/) || [0])[0], 10);
    if (t >= cutoff) { clicks += row.Clicks || 0; impressions += row.Impressions || 0; }
  }
  return { clicks, impressions };
}

function pct(cur, prev) {
  if (!prev) return cur > 0 ? 'új!' : '—';
  const p = Math.round(((cur - prev) / prev) * 100);
  return (p >= 0 ? '+' : '') + p + '%';
}

// ---------- Cloudflare Web Analytics (ÖSSZES látogató, nem csak kereső) ----------
// Kulcsok: CF_ANALYTICS_TOKEN (Account Analytics: Read) + CLOUDFLARE_ACCOUNT_ID.
// Tisztán GraphQL, FIÓK-szinten összesítve (a rum/site_info REST-hez ez a jog
// nem elég — 403; a fiókban úgyis csak az aiworldhq.com mér, 2026-07-11).
async function getVisitors() {
  const token = (process.env.CF_ANALYTICS_TOKEN || '').trim();
  const account = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token || !account) return null;
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const until = new Date().toISOString();
  const q = `query($account: String!, $since: Time!, $until: Time!) {
    viewer { accounts(filter: {accountTag: $account}) {
      total: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until}, limit: 10) {
        count sum { visits }
      }
      pages: rumPageloadEventsAdaptiveGroups(filter: {datetime_geq: $since, datetime_leq: $until}, limit: 6, orderBy: [count_DESC]) {
        count dimensions { requestPath }
      }
    } }
  }`;
  const gr = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables: { account, since, until } }),
    signal: AbortSignal.timeout(20000)
  });
  if (!gr.ok) throw new Error('CF GraphQL HTTP ' + gr.status);
  const data = await gr.json();
  if (data.errors?.length) throw new Error('CF GraphQL: ' + JSON.stringify(data.errors[0].message).slice(0, 80));
  const acc = data.data?.viewer?.accounts?.[0];
  if (!acc) return null;
  let visits = 0, pageviews = 0;
  for (const row of (acc.total || [])) { visits += row.sum?.visits || 0; pageviews += row.count || 0; }
  const pages = (acc.pages || [])
    .filter(p => p.dimensions?.requestPath)
    .map(p => `${p.dimensions.requestPath} (${p.count})`).slice(0, 3);
  return { visits, pageviews, pages };
}

async function main() {
  if (!guard()) return;

  let g = null, b = null;
  try { g = await getGoogle(); } catch (e) { console.log('⚠️ GSC: ' + e.message.slice(0, 80)); }
  try { b = await getBing(); } catch (e) { console.log('⚠️ Bing: ' + e.message.slice(0, 80)); }

  if (!g && !b) { console.log('⏭️  Kereső-riport: nincs beállított kulcs (GSC_SA_JSON / BING_WM_API_KEY) — kihagyom.'); return; }

  const lines = [`📈 *Heti kereső-riport — ${isoWeek()}*`, ``];
  let weeklyClicks = 0;
  if (g) {
    weeklyClicks += g.clicks;
    lines.push(`🔍 Google: *${g.clicks} kattintás* (${pct(g.clicks, g.prevClicks)}) · ${g.impressions} megjelenés`);
    if (g.top.length) lines.push(`   top keresések: ${g.top.join(' · ')}`);
  } else lines.push('🔍 Google: nincs kulcs beállítva');
  if (b) {
    weeklyClicks += b.clicks;
    lines.push(`🔎 Bing: *${b.clicks} kattintás* · ${b.impressions} megjelenés`);
  } else lines.push('🔎 Bing: nincs kulcs beállítva');

  // ÖSSZES látogató (Cloudflare Web Analytics) — nem csak a keresőkből!
  try {
    const v = await getVisitors();
    if (v) {
      lines.push(`👥 Látogatók a héten: *${v.visits}* · ${v.pageviews} oldalletöltés`);
      if (v.pages.length) lines.push(`   legnézettebb: ${v.pages.join(' · ')}`);
    }
  } catch (e) { console.log('⚠️ CF Analytics: ' + e.message.slice(0, 80)); }

  // OLVASÓI 👍/👎 összesítés (a Worker KV-jából, ha van export-kulcs)
  try {
    const expKey = (process.env.FEEDBACK_EXPORT_KEY || '').trim();
    if (expKey) {
      const fr = await fetch('https://aiworld-telegram.pacsi84.workers.dev/feedback-export',
        { headers: { 'X-Export-Key': expKey }, signal: AbortSignal.timeout(15000) });
      if (fr.ok) {
        const fb = await fr.json();
        const entries = Object.entries(fb).filter(([s]) => s !== 'proba-cikk' && s !== '__nl_signups');
        // Hírlevél-jelentkezések (2026-07-12): a Worker KV-számlálója
        if (fb.__nl_signups > 0) lines.push(`📬 Hírlevél-feliratkozás eddig összesen: *${fb.__nl_signups}*`);
        const votes = entries.reduce((n, [, v]) => n + (v.up || 0) + (v.down || 0), 0);
        if (votes > 0) {
          // slug → MAGYAR cím (a Főnök magyarul jelent — user-kérés 2026-07-08)
          const { readdirSync } = await import('fs');
          const slugify = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
          const huTitle = {};
          try {
            for (const f of readdirSync(join(ROOT, 'content', 'articles')).filter(x => x.endsWith('.json'))) {
              const d = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'));
              const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
              const slug = slugify((m && m[1]) || d.original_title || f);
              try {
                const hu = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')).hu || '';
                const hm = hu.match(/^title:\s*["']?(.+?)["']?\s*$/m);
                huTitle[slug] = hm ? hm[1] : (m && m[1]) || slug;
              } catch { huTitle[slug] = (m && m[1]) || slug; }
            }
          } catch { /* marad a slug */ }
          const name = (s) => (huTitle[s] || s).slice(0, 50);
          const best = entries.sort((a, b) => (b[1].up || 0) - (a[1].up || 0))[0];
          const worst = entries.sort((a, b) => (b[1].down || 0) - (a[1].down || 0))[0];
          lines.push(``, `🗳️ Olvasói szavazat a héten: ${votes}`);
          if (best && best[1].up > 0) lines.push(`   👍 kedvenc: ${name(best[0])} (${best[1].up})`);
          if (worst && worst[1].down > 0) lines.push(`   👎 leggyengébb: ${name(worst[0])} (${worst[1].down})`);
        }
      }
    }
  } catch { /* a visszajelzés-blokk hibája ne állítsa meg a riportot */ }

  // HÍRLEVÉL-LÁMPA: ha a napi átlag kattintás eléri a küszöböt, ideje hírlevelet indítani
  const daily = Math.round(weeklyClicks / 7);
  lines.push(``, daily >= NEWSLETTER_DAILY_CLICKS
    ? `🟢 *HÍRLEVÉL-LÁMPA: ZÖLD!* Napi ~${daily} kattintás — megérett az idő a hírlevélre, szólj a fejlesztőnek! 📬`
    : `🚦 Hírlevél-lámpa: még piros (napi ~${daily} katt, küszöb: ${NEWSLETTER_DAILY_CLICKS}) — türelem, gyűlik.`);

  await sendMessage(lines.join('\n'));
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_week: isoWeek() }, null, 2), 'utf-8'); } catch { /* ok */ }
  console.log('✅ Heti kereső-riport elküldve.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 KERESŐ-RIPORT HIBA:', e); process.exit(1); });
