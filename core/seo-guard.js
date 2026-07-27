// ===================================================================
// SEO-ŐRSZEM (seo-guard) — 2026-07-27
// ===================================================================
//
// MIÉRT: egy nap alatt HÁROM olyan hiba derült ki a Search Console-ból,
// amit hónapokig senki nem vett észre, mert minden "működött":
//   1. A canonical / hreflang / og:url / sitemap a .html-es alakot hirdette,
//      amit a Cloudflare 308-cal átirányít → 314 "átirányítást tartalmazó
//      oldal" + 109 "alternatív oldal kanonikus címkével" a GSC-ben.
//   2. Az URL a CÍMBŐL készült, így egy cím-átdolgozás NÉMÁN elköltöztette az
//      oldalt, a Google által indexelt régi cím pedig 404 lett (rangsor-erővel
//      együtt). 232 útmutatóból 197-et érintett.
//   3. Voltak cikkek, amikre a saját sitemapünk mutatott, de nem volt mögöttük
//      fájl.
//
// Mindhárom NÉMA hiba: a honlap tökéletesen működött közben. Ezért kell gép,
// ami MINDEN futásnál megnézi — a build UTÁN, a deploy ELŐTT.
//
// A javítások a helyükön vannak (canonicalPath(), rögzített _meta.slug,
// slug-history 301-ek); ez az őrszem azt biztosítja, hogy ha valaki (én)
// később elrontja őket, az KIDERÜLJÖN, ne fél év múlva a Google-tól.
//
// FUTTATÁS: node core/seo-guard.js        (a website/public-ot vizsgálja)
// Kilépési kód mindig 0 — nem állítjuk meg tőle a kiadást; a napi Telegram-
// riport viszi ki a leletet (mint a minőség-őrnél és az i18n-őrszemnél).
// ===================================================================

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'website', 'public');
const ARTICLES = join(ROOT, 'content', 'articles');
const STATE = join(ROOT, 'memory', 'seo-guard.json');

const problems = [];
const add = (code, msg) => problems.push({ code, msg });

// ── 1. A sitemap SOHA ne hirdessen .html-es (átirányító) címet ───────
function checkSitemap() {
  const p = join(PUBLIC, 'sitemap.xml');
  if (!existsSync(p)) return add('NO_SITEMAP', 'Nincs sitemap.xml a build kimenetben!');
  const xml = readFileSync(p, 'utf-8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (!urls.length) return add('EMPTY_SITEMAP', 'A sitemap.xml ÜRES!');

  const withExt = urls.filter(u => u.endsWith('.html'));
  if (withExt.length) {
    add('SITEMAP_HTML', `${withExt.length} sitemap-URL .html-es (a Cloudflare átirányítja) — pl. ${withExt[0]}`);
  }

  // Minden hirdetett cím mögött LEGYEN kiszolgáló fájl (különben saját 404).
  const missing = [];
  for (const u of urls) {
    const path = u.replace(/^https?:\/\/[^/]+/, '');
    const file = (path === '/' || path === '') ? 'index.html'
      : path.endsWith('/') ? path.slice(1) + 'index.html'
        : path.slice(1) + (path.endsWith('.html') ? '' : '.html');
    if (!existsSync(join(PUBLIC, file))) missing.push(u);
  }
  if (missing.length) {
    add('SITEMAP_404', `${missing.length} sitemap-URL mögött NINCS fájl (saját magunknak gyártunk 404-et) — pl. ${missing[0]}`);
  }
  return urls.length;
}

// ── 2. A lap-szintű jelzések se hirdessenek átirányító címet ─────────
// Mintát nézünk (nem mind a 2700 oldalt): gyökér + 1 cikk nyelvenként.
function checkPageSignals() {
  const samples = [];
  for (const lang of ['', 'hu', 'es', 'de', 'fr']) {
    const base = lang ? join(PUBLIC, lang) : PUBLIC;
    const idx = join(base, 'index.html');
    if (existsSync(idx)) samples.push(idx);
    const adir = join(base, 'article');
    if (existsSync(adir)) {
      const first = readdirSync(adir).filter(f => f.endsWith('.html'))[0];
      if (first) samples.push(join(adir, first));
    }
  }
  for (const f of samples) {
    const html = readFileSync(f, 'utf-8');
    const rel = f.replace(PUBLIC, '').replace(/\\/g, '/');
    const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
    if (canonical && canonical.endsWith('.html')) add('CANONICAL_HTML', `.html-es canonical: ${rel}`);
    if (!canonical) add('NO_CANONICAL', `Hiányzó canonical: ${rel}`);
    const badHreflang = (html.match(/hreflang="[a-z-]+" href="[^"]*\.html"/g) || []).length;
    if (badHreflang) add('HREFLANG_HTML', `${badHreflang} db .html-es hreflang: ${rel}`);
    const og = (html.match(/og:url" content="([^"]+)"/) || [])[1];
    if (og && og.endsWith('.html')) add('OGURL_HTML', `.html-es og:url: ${rel}`);
    if (/name="robots"[^>]*noindex|noindex[^>]*name="robots"/i.test(html)) {
      add('NOINDEX', `noindex címke egy indexelendő oldalon: ${rel}`);
    }
  }
}

// ── 3. Rögzített slug — enélkül egy cím-átdolgozás elköltözteti az oldalt ──
function checkPinnedSlugs() {
  if (!existsSync(ARTICLES)) return;
  const files = readdirSync(ARTICLES).filter(f => f.endsWith('.json'));
  const unpinned = [];
  for (const f of files) {
    let j; try { j = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8')); } catch { continue; }
    if (!j.article_markdown) continue;
    if (!j._meta?.slug) unpinned.push(f);
  }
  if (unpinned.length) {
    add('UNPINNED_SLUG', `${unpinned.length} cikknek NINCS rögzített _meta.slug-ja — egy cím-átdolgozás elköltöztetné (404) — pl. ${unpinned[0]}`);
  }
}

// ── 4. Az átirányítás-lista férjen bele a Cloudflare-korlátba ────────
function checkRedirects() {
  const p = join(PUBLIC, '_redirects');
  if (!existsSync(p)) return add('NO_REDIRECTS', 'Nincs _redirects — a pages.dev domain-egyesítés sem működik!');
  const lines = readFileSync(p, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length > 2100) {
    add('REDIRECT_LIMIT', `${lines.length} átirányítás > 2100 (Cloudflare-plafon) — a fájl VÉGE érvénytelen lehet!`);
  }
  if (!lines.some(l => l.includes('pages.dev'))) {
    add('NO_DOMAIN_MERGE', 'Hiányzik a pages.dev → saját domain 301 — duplikált tartalom a Google szemében!');
  }
}

function main() {
  console.log('🔍 SEO-ŐRSZEM');
  console.log('─'.repeat(60));
  if (!existsSync(PUBLIC)) { console.log('   ⏭️  Nincs build kimenet — kihagyom.'); return; }

  const urlCount = checkSitemap();
  checkPageSignals();
  checkPinnedSlugs();
  checkRedirects();

  if (!problems.length) {
    console.log(`   ✅ Rendben (${urlCount} sitemap-URL, minden jelzés kiterjesztés nélküli, minden slug rögzített).`);
  } else {
    for (const p of problems) console.log(`   ⚠️  [${p.code}] ${p.msg}`);
    console.log(`\n🚨 SEO-őrszem: ${problems.length} lelet — javítandó!`);
  }

  // A napi riport innen olvassa ki (mint a forrás-bizonyítványt).
  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(STATE, JSON.stringify({ at: new Date().toISOString(), urlCount, problems }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
}

main();
