// ===================================================================
// ÉLŐ-ŐRSZEM (live-guard) — kintről befelé nézés, 2026-07-31
// ===================================================================
//
// MIÉRT: a user kérdése — "de ezt hogy nem vettük észre?" — után született.
// A Google-megfelelőségi audit egy óra alatt HÁROM hibát talált (www-duplikáció,
// dupla H1, localhost-link), és mindhárom AZÉRT maradt rejtve hetekig, mert
// minden őrszemünk a SAJÁT GYÁRTOTT FÁJLJAINKAT nézi. A www például nem fájl,
// hanem kiszolgálói beállítás — azt csak úgy lehet észrevenni, ha valaki
// KINTRŐL, a Google szemével kéri le az oldalt. Ezt eddig SENKI nem tette.
//
// EZ AZ ŐRSZEM PONT EZT CSINÁLJA, minden futásban, a deploy UTÁN:
// valódi HTTP-kérésekkel ellenőrzi az ÉLŐ oldalt. Nem a szándékot méri
// (mit generáltunk), hanem a VALÓSÁGOT (mit lát egy látogató és a Google).
//
// A tanulság mögötte: az őrszem a múlt hibái ellen véd, az audit a jövőé —
// ez a fájl az egyszeri audit ISMÉTLŐDŐVÉ tétele.
//
// FUTTATÁS: node core/live-guard.js
// Kilépési kód mindig 0 — a lelet a napi Telegram-riportba megy (🌐).
// ===================================================================

import { writeFileSync, mkdirSync, readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE = join(ROOT, 'memory', 'live-guard.json');
const SITE = 'https://aiworldhq.com';

const problems = [];
const add = (code, msg) => problems.push({ code, msg });
const bust = () => `?v=${Math.floor(Math.random() * 1e9)}`;   // a Cloudflare él-gyorsítótár kétszer megvezetett már

async function probe(url, { redirect = 'manual' } = {}) {
  try {
    const r = await fetch(url, { redirect, signal: AbortSignal.timeout(20000) });
    return { status: r.status, location: r.headers.get('location') || '', body: null, r };
  } catch (e) {
    return { status: 0, location: '', error: String(e.message).slice(0, 60) };
  }
}

async function main() {
  console.log('🌐 ÉLŐ-ŐRSZEM (kintről befelé)');
  console.log('─'.repeat(60));

  // ── 1. HOST-DUPLIKÁCIÓK: www és http egyetlen címre tereljen ──────
  // (A www 8 hétig 200-zal szolgált ki mindent — ma javítottuk.)
  const www = await probe(`https://www.aiworldhq.com/${bust()}`);
  if (www.status === 200) add('WWW_DUPLICATE', 'a www.aiworldhq.com 200-zal KISZOLGÁL átirányítás helyett — minden oldal két címen él');
  else if (www.status !== 301 && www.status !== 308) add('WWW_ODD', `www: HTTP ${www.status}${www.error ? ' (' + www.error + ')' : ''}`);

  const http = await probe(`http://aiworldhq.com/${bust()}`);
  if (http.status !== 301 && http.status !== 308) add('HTTP_NO_REDIRECT', `a http:// nem irányít át (HTTP ${http.status})`);

  // ── 2. A 404 LEGYEN VALÓDI 404 (a soft-404 indexelési méreg) ──────
  const nf = await probe(`${SITE}/article/nincs-ilyen-oldal-elo-orszem-${Date.now()}`);
  if (nf.status !== 404) add('SOFT_404', `nem létező oldal HTTP ${nf.status}-at ad 404 helyett`);

  // ── 3. KIVEZETETT NYELVEK: a /de/ és /fr/ tényleg átirányít-e ─────
  for (const l of ['de', 'fr']) {
    const p = await probe(`${SITE}/${l}/${bust()}`);
    if (p.status !== 301 && p.status !== 308) add('RETIRED_LANG_ALIVE', `/${l}/ nem irányít át (HTTP ${p.status}) — a kivezetett nyelv él`);
  }

  // ── 4. EGY VALÓDI CIKK, ÚGY, AHOGY A GOOGLE LÁTJA ─────────────────
  // A legfrissebb publikált cikket kérjük le, és a KAPOTT HTML-t nézzük:
  // canonical kiterjesztés nélkül + PONTOSAN 1 H1 + Discover-jelzés.
  // (A dupla H1 nyolc hétig volt kint — a build-oldali őr mellett az élő
  // oldalt is nézzük, mert a kettő között ott a deploy meg a gyorsítótár.)
  let slug = null;
  try {
    const A = join(ROOT, 'content', 'articles');
    let newest = '';
    for (const f of readdirSync(A).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(A, f), 'utf-8'));
      if (d._meta?.published_at && d._meta?.slug && d._meta.published_at > newest) { newest = d._meta.published_at; slug = d._meta.slug; }
    }
  } catch { /* lentebb kezelve */ }

  if (slug) {
    try {
      const r = await fetch(`${SITE}/article/${slug}${bust()}`, { signal: AbortSignal.timeout(20000) });
      if (r.status !== 200) add('ARTICLE_DOWN', `a legfrissebb cikk HTTP ${r.status} (${slug.slice(0, 40)})`);
      else {
        const html = await r.text();
        const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1] || '';
        if (!canonical) add('NO_CANONICAL_LIVE', 'nincs canonical az élő cikkoldalon');
        else if (canonical.endsWith('.html')) add('CANONICAL_HTML_LIVE', '.html-es canonical az élő oldalon');
        const h1 = (html.match(/<h1[\s>]/g) || []).length;
        if (h1 !== 1) add('H1_COUNT_LIVE', `${h1} H1 az élő cikkoldalon (kell: pontosan 1)`);
        if (!/max-image-preview:\s*large/i.test(html)) add('NO_DISCOVER_LIVE', 'hiányzik a max-image-preview:large az élő oldalról');
        if (/href="http:\/\/(localhost|127\.0\.0\.1)/.test(html)) add('LOCAL_URL_LIVE', 'localhost-link az élő oldalon');
      }
    } catch (e) { add('ARTICLE_UNREACHABLE', `a cikk-próba elhalt: ${String(e.message).slice(0, 50)}`); }
  }

  // ── 5. SITEMAP ÉLŐBEN: elérhető, észszerű méretű, tiszta ──────────
  try {
    const r = await fetch(`${SITE}/sitemap.xml${bust()}`, { signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) add('SITEMAP_DOWN', `sitemap.xml HTTP ${r.status}`);
    else {
      const xml = await r.text();
      const n = (xml.match(/<loc>/g) || []).length;
      if (n < 500) add('SITEMAP_SHRUNK', `csak ${n} URL a sitemapban — gyanúsan kevés`);
      if (/\.html<\/loc>/.test(xml)) add('SITEMAP_HTML_LIVE', '.html-es URL az élő sitemapban');
    }
  } catch (e) { add('SITEMAP_UNREACHABLE', `sitemap-próba elhalt: ${String(e.message).slice(0, 50)}`); }

  // ── EREDMÉNY ──────────────────────────────────────────────────────
  if (!problems.length) console.log('   ✅ Kintről nézve minden rendben (www/http 301, 404 valódi, cikk ép, sitemap tiszta).');
  else for (const p of problems) console.log(`   ⚠️  [${p.code}] ${p.msg}`);

  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), problems }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('💥 ÉLŐ-ŐRSZEM HIBA (nem kritikus):', String(e.message).slice(0, 200));
  process.exit(0);
});
