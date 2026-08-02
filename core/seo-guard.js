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

// ── 1b. A TÖBBI kimenet se hirdessen .html-es (átirányító) címet ─────
// 2026-07-28: az őrszem eredetileg CSAK a sitemap.xml-t nézte. A Google
// viszont a hír-sitemapból, az RSS-ből és az AI-kereső llms.txt-jéből is
// vesz címeket, a kereső/chatbot pedig a search.json-ból és a kb.json-ból
// linkel. Ha ezek bármelyike visszaesne .html-re, ugyanaz a 308-as
// "átirányítást tartalmazó oldal" hiba jönne vissza, csak más kapun.
function checkOtherOutputs() {
  const targets = ['news-sitemap.xml', 'llms.txt'];
  for (const l of ['', 'hu', 'es', 'de', 'fr']) {
    for (const f of ['feed.xml', 'search.json', 'kb.json']) targets.push(l ? `${l}/${f}` : f);
  }
  const rx = /aiworldhq\.com[^"'<>)\s]*\.html/g;
  for (const t of targets) {
    const p = join(PUBLIC, t);
    if (!existsSync(p)) continue;
    const hits = readFileSync(p, 'utf-8').match(rx);
    if (hits?.length) {
      add('OUTPUT_HTML', `${t}: ${hits.length} db .html-es (átirányító) saját URL — pl. ${hits[0]}`);
    }
  }
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
    // GOOGLE DISCOVER (2026-07-29): enélkül a Google csak bélyegképet mutathat,
    // és a Discover — a telefonokra magától kitolt hírfolyam — ki sem próbál
    // minket. Hónapokig észrevétlen volt, mert a honlap tökéletesen működött.
    if (!/name="robots"[^>]*max-image-preview:\s*large/i.test(html)) {
      add('NO_DISCOVER_META', `Hiányzik a max-image-preview:large (Google Discover kizárva): ${rel}`);
    }
  }
}

// ── 2c. SZERKEZETT ADAT (JSON-LD) TELJESSÉGE ────────────────────────
// 2026-08-01, a "mennyire kereső-barát a munkánk?" átvilágításból.
// LELET VOLT: a hír-cikkek teljes NewsArticle-jelölést kaptak (dátum,
// szerző, kiadó), az ÚTMUTATÓK viszont — 254 cikk, a fő forgalomszerzőnk —
// dátum és szerző NÉLKÜL mentek ki. Élőben mérve 24 véletlen cikkből 10
// volt hiányos, és mind a 10 útmutató. A hiba azért maradt rejtve, mert a
// két oldaltípust két külön függvény építi: a hír ága jó volt, a másik nem.
//
// Miért fontos: a dátum a frissesség-jelzés (ez látszik a találatban is),
// a szerző/kiadó az E-E-A-T jelzés. 100%-ban AI-írt tartalomnál a
// hitelesség-jelzés nem díszítés.
//
// Az ELROMLOTT JSON-LD-t is fogja: egy hibás séma rosszabb a hiányzónál,
// mert a Google az egész blokkot eldobja — némán.
function checkSchema() {
  const SAMPLE = 40;
  const adir = join(PUBLIC, 'article');
  if (!existsSync(adir)) return;
  const files = readdirSync(adir).filter(f => f.endsWith('.html'));
  // Egyenletes mintavétel a teljes listából (nem csak az első néhány):
  // az útmutatók és a hírek keverve vannak, egy elejéről vett minta
  // kihagyhatná az egyik típust — pont ezt a hibát kerestük.
  const step = Math.max(1, Math.floor(files.length / SAMPLE));
  const pick = files.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const miss = { date: [], author: [], broken: [] };
  for (const f of pick) {
    const html = readFileSync(join(adir, f), 'utf-8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
    if (!blocks.length) { miss.date.push(f); miss.author.push(f); continue; }
    let all = [];
    for (const b of blocks) {
      try { const j = JSON.parse(b); all = all.concat(Array.isArray(j) ? j : [j]); }
      catch { miss.broken.push(f); }
    }
    const main = all.find(o => /HowTo|NewsArticle|Article|BlogPosting/.test(o?.['@type'] || ''));
    if (!main) continue;
    if (!main.datePublished) miss.date.push(f);
    if (!main.author) miss.author.push(f);
  }
  const n = pick.length;
  if (miss.broken.length) add('SCHEMA_BROKEN', `${miss.broken.length}/${n} cikk JSON-LD-je ELROMLOTT (a Google az egész blokkot eldobja) — pl. ${miss.broken[0]}`);
  if (miss.date.length) add('SCHEMA_NO_DATE', `${miss.date.length}/${n} cikk szerkezett adatában nincs datePublished (a Google nem látja a frissességet) — pl. ${miss.date[0]}`);
  if (miss.author.length) add('SCHEMA_NO_AUTHOR', `${miss.author.length}/${n} cikk szerkezett adatában nincs author (E-E-A-T jelzés hiányzik) — pl. ${miss.author[0]}`);
}

// ── 2b. A Discover 1200 px-nél szélesebb képet kér ───────────────────
// A jelzés önmagában nem elég: ha a borítókép kisebb, a cikk ugyanúgy
// kimarad a Discoverből. A generátor 1280-at ad, de ezt eddig 1000-re
// vágtuk vissza — a LEGFRISSEBB képeket nézzük, mert a Discover úgyis
// csak a friss tartalommal foglalkozik.
// A "FRISS" A CIKK MEGJELENÉSÉBŐL JÖN, NEM A FÁJL MTIME-JÁBÓL (2026-08-02).
//
// Ugyanaz a csapda, mint a házmester naplótörlésénél: a git nem tárolja a
// módosítási időt, a GitHub Actions friss klónja mindennek a klónozás idejét
// adja. Így élesben a "12 legfrissebb kép" gyakorlatilag véletlen merítés volt
// — bizonyíték: a 2026-08-02-i futás egy 2026-07-08-i (25 napos) képet jelentett
// frissként. Az egyetlen, git-en átélő frissesség-jelzés a cikk published_at-je.
function checkDiscoverImages() {
  const dir = join(ROOT, 'website', 'assets', 'images');
  if (!existsSync(dir) || !existsSync(ARTICLES)) return;

  const arts = [];
  for (const f of readdirSync(ARTICLES).filter(x => x.endsWith('.json'))) {
    try {
      const m = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8'))._meta || {};
      if (m.slug && m.published_at) arts.push({ slug: m.slug, at: m.published_at });
    } catch { /* kihagyjuk */ }
  }
  if (!arts.length) return;
  arts.sort((a, b) => b.at.localeCompare(a.at));

  const recent = [];
  for (const a of arts) {
    if (recent.length >= 12) break;
    const p = join(dir, `${a.slug}.jpg`);
    if (existsSync(p)) recent.push({ f: `${a.slug}.jpg`, p });
  }
  if (!recent.length) return;

  const small = [];
  for (const { f, p } of recent) {
    const w = jpegWidth(p);
    if (w && w < 1200) small.push(`${f} (${w}px)`);
  }
  if (small.length) {
    add('DISCOVER_IMG_SMALL', `${small.length}/${recent.length} friss borítókép 1200 px alatt (Discover-kizáró) — pl. ${small[0]}`);
  }
}

// JPEG-szélesség a fájl fejlécéből (néhány bájt, nincs hozzá csomag)
function jpegWidth(path) {
  try {
    const buf = readFileSync(path);
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return buf.readUInt16BE(i + 7);
      i += 2 + buf.readUInt16BE(i + 2);
    }
  } catch { /* olvashatatlan fájl */ }
  return null;
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

// ── 3b. A KÖZÖSSÉGI posztok LÉTEZŐ oldalra mutassanak ────────────────
// 2026-07-29: kiderült, hogy 407 Facebook/Pinterest posztból 210 NEM LÉTEZŐ
// oldalra mutatott (élőben HTTP 404), és MIND a 407 .html-es (átirányító) volt.
// Ok: a közösségi agent a CÍMBŐL számolta a slugot 60 karakterre vágva, a build
// viszont a RÖGZÍTETT _meta.slug-ot használja 70-ig.
//
// MIÉRT MARADT REJTVE HETEKIG: a poszt kiment, a webhook 200-at adott, a napi
// riport "kiküldve"-t írt. Minden réteg sikert jelentett — a láncot a LINKIG
// senki nem követte végig. Ugyanaz a minta, mint a hiányzó Pinterest-modulnál:
// az utolsó láncszemet kell mérni, nem a köztes visszajelzéseket.
function checkSocialLinks() {
  const dir = join(ROOT, 'content', 'social');
  if (!existsSync(dir)) return;
  const real = new Set();
  if (existsSync(ARTICLES)) {
    for (const f of readdirSync(ARTICLES).filter(x => x.endsWith('.json'))) {
      try { const s = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8'))._meta?.slug; if (s) real.add(s); } catch { /* skip */ }
    }
  }
  if (!real.size) return;

  let withExt = 0; const dead = []; const textMismatch = [];
  const URL_RX = /https:\/\/aiworldhq\.com\/article\/[A-Za-z0-9\-]+(?:\.html)?/g;

  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let p; try { p = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    if (!p.url) continue;
    if (p.url.endsWith('.html')) withExt++;
    const slug = p.url.replace(/^.*\/article\//, '').replace(/\.html$/, '');
    if (!real.has(slug)) dead.push(slug);

    // A POSZT SZÖVEGÉBEN LÉVŐ LINK IS SZÁMÍT (2026-07-29).
    // Ezt először KIHAGYTAM: csak az url mezőt javítottam, a Facebook-szövegbe
    // viszont generáláskor BELE VAN ÉGETVE a link. A poszter így dolgozik:
    //     message = post.facebook.split(post.url).join('')
    // vagyis a szövegből a post.url-t vágja ki. Ha a kettő eltér, a kivágás
    // NEM TALÁL, és a régi (törött) link bennragad a kiküldött posztban —
    // ráadásul a helyes link is odakerül a végére, tehát KÉT link megy ki,
    // az egyik halott. Az adatjavítás fele nem javítás.
    for (const u of (String(p.facebook || '').match(URL_RX) || [])) {
      if (u !== p.url) { textMismatch.push(f); break; }
    }
  }
  if (withExt) add('SOCIAL_HTML', `${withExt} közösségi poszt .html-es (átirányító) linkkel`);
  if (dead.length) {
    add('SOCIAL_404', `${dead.length} közösségi poszt NEM LÉTEZŐ cikkre mutat (az olvasó 404-et kap) — pl. ${dead[0]}`);
  }
  if (textMismatch.length) {
    add('SOCIAL_TEXT_URL', `${textMismatch.length} poszt SZÖVEGÉBEN más link van, mint az url mezőben (a poszter nem tudja kivágni → törött link megy ki) — pl. ${textMismatch[0]}`);
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
  // HOST-EGYESÍTÉS (2026-07-31-től): NEM a _redirects-ben van! Kintről mérve
  // kiderült, hogy a Cloudflare az abszolút címes forrás-szabályt némán
  // eldobja — a régi pages.dev-sor halott volt a kezdetektől. A működő út a
  // functions/_middleware.js; itt azt őrizzük, hogy LÉTEZIK és a fő domainre
  // kanonizál. (Hogy élesben tényleg 301-et ad-e, azt a live-guard méri.)
  const mw = join(ROOT, 'functions', '_middleware.js');
  if (!existsSync(mw) || !readFileSync(mw, 'utf-8').includes("'aiworldhq.com'")) {
    add('NO_DOMAIN_MERGE', 'Hiányzik/sérült a functions/_middleware.js — a www és a pages.dev duplán szolgálná ki az oldalt!');
  }
}

function main() {
  console.log('🔍 SEO-ŐRSZEM');
  console.log('─'.repeat(60));
  if (!existsSync(PUBLIC)) { console.log('   ⏭️  Nincs build kimenet — kihagyom.'); return; }

  const urlCount = checkSitemap();
  checkOtherOutputs();
  checkPageSignals();
  checkSchema();
  checkDiscoverImages();
  checkSocialLinks();
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
