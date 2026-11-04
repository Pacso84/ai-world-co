// ===================================================================
// INDEXNOW — azonnali kereső-értesítés (Bing/Yandex/Seznam/Naver…)
// ===================================================================
//
// A deploy UTÁN hívódik (publisher agent): a FRISS (48 órán belül publikált
// vagy frissített) tartalmak URL-jeit bejelenti az api.indexnow.org-nak,
// mind az 5 nyelvi változatban + a nyelvi főoldalakat. Így az új cikkeket
// a Bing (= a ChatGPT-kereső indexe) percek alatt észreveszi, nem várunk
// a feltérképezésre.
//
// A kulcs a config.json company.indexnow_key — SZÁNDÉKOSAN nyilvános (a
// protokoll a webhelyen kiszolgált kulcsfájllal igazolja a tulajdonjogot).
// A kulcsfájlt (<kulcs>.txt) a website/build.js teszi ki a gyökérbe.
//
// FUTTATÁS önállóan:  node core/indexnow.js            (48 órás friss kör)
//                     node core/indexnow.js --all      (MINDEN URL, első bejelentéshez)
// ===================================================================

import 'dotenv/config';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { noindexNyelv } from './noindex-langs.js';
import { toroltUrlek } from './guide-prune.js';
import { valodiModositas } from './sitemap-lastmod.js';
import { osszevontUrlek } from './utmutato-osszevonas.js';
import { frissit as halottFrissit, esedekes as halottEsedekes, bejelentve as halottBejelentve } from './halott-url.js';   // 🪦 2026-10-31

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
// 2026-07-31: a /de és /fr kivezetve (301 az angol cikkre). NE jelentsük be
// őket a keresőknek — különben ÁTIRÁNYÍTÓ címeket hirdetnénk, ami pontosan az
// a hiba, amit július 27-én javítottunk ki mindenhonnan.
// ⚠️ A NOINDEXELT nyelvi ágakat NEM jelentjük be (2026-09-08; 10-18 óta nincs ilyen — a /hu/ is megy). Bejelenteni egy
// címet, majd a lapon megtiltani az indexelést, ellentmondás — ugyanaz a hiba,
// mint a /de /fr esetében: átirányító, illetve nem kívánt címeket hirdetnénk.
const LANGS = ['', '/hu', '/es']
  .filter(l => !noindexNyelv(l.slice(1)));   // '' = angol gyökér, az mindig marad
const FRESH_HOURS = 48;                            // a 8 órás cron mellé bő ráhagyás

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

function titleOf(md, fallback) {
  const m = (md || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1] : fallback;
}

export async function submitIndexNow({ all = false, dry = false } = {}) {
  let key = '', site = '';
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company || {};
    key = (c.indexnow_key || '').trim();
    site = (c.website_url || '').replace(/\/$/, '');
  } catch { /* lent kezeljük */ }
  if (!key || !site) { console.log('   ⏭️  IndexNow: nincs kulcs/site a configban — kihagyom.'); return { submitted: 0 }; }

  // Friss cikkek összegyűjtése
  const urls = new Set();
  const now = Date.now();
  const eloSlugok = [];   // 🪦 a halott-link őrnek: MINDEN élő cikk, nem csak a friss
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        // 2026-10-19: a MÓDOSÍTOTT cikk is friss (felújító, tény-ellenőrző javítása) — ugyanaz a dátum,
        // ami az oldalon „Frissítve”-ként és a sitemapban lastmod-ként látszik (core/sitemap-lastmod.js).
        if (d._meta?.slug) eloSlugok.push(d._meta.slug);
        const pub = new Date(valodiModositas(d._meta) || 0).getTime();
        const written = new Date(d._meta?.written_at || 0).getTime();
        if (!all && (now - Math.max(pub, written)) > FRESH_HOURS * 3600e3) continue;
        // ===================================================================
        // 2026-07-28 — KÉT JAVÍTÁS EGY SORBAN:
        // 1) A RÖGZÍTETT slug (_meta.slug) az igazság, nem a címből számolt.
        //    A címből képzett slug egy átdolgozás után MÁS URL-t adna, mint
        //    ami az oldalon van → nem létező címet jelentettünk volna be.
        // 2) NINCS .html végződés. A Cloudflare a .html-es alakot 308-cal
        //    átirányítja, tehát eddig minden futásban ÁTIRÁNYÍTÓ címeket
        //    hirdettünk a keresőknek — pont azt a hibát táplálva, amit a
        //    Search Console "átirányítást tartalmazó oldal" néven jelzett.
        // ===================================================================
        const slug = d._meta?.slug || slugify(titleOf(d.article_markdown, d.original_title || f));
        for (const lp of LANGS) urls.add(`${site}${lp}/article/${slug}`);
      } catch { /* rossz fájl kihagyva */ }
    }
  }
  // TÖRÖLT ÚTMUTATÓK (2026-10-14, core/guide-prune.js): a megszűnt címet is bejelentjük — az
  // IndexNow-nál ez azt jelenti: „nézd meg újra", a kereső 404-et talál, és kiveszi a találatai közül.
  try {
    const lista = JSON.parse(readFileSync(join(ROOT, 'memory', 'torolt-utmutatok.json'), 'utf-8'));
    for (const u of toroltUrlek(lista, site, LANGS, now, FRESH_HOURS)) urls.add(u);
  } catch { /* nincs törölt útmutató — nem baj */ }
  // TÖRÖLT HÍREK (2026-10-21, user: „…és értesítés a keresőknek!”): ugyanígy, a Házmester listájából.
  try {
    const lista = JSON.parse(readFileSync(join(ROOT, 'memory', 'torolt-hirek.json'), 'utf-8'));
    for (const u of toroltUrlek(lista, site, LANGS, now, FRESH_HOURS)) urls.add(u);
  } catch { /* nincs törölt hír — nem baj */ }
  // 🪦 HALOTT-LINK ŐR (2026-10-31, core/halott-url.js): ami az előző futás óta eltűnt — BÁRMILYEN okból —, azt is
  // bejelentjük; kipipálni CSAK sikeres válasz után (lent), így egy elbukott futás után a következő pótolja.
  const HALOTT_UT = join(ROOT, 'memory', 'halott-url-allapot.json');
  let halott = null, halottSlugok = [];
  try {
    let elozo = null; try { elozo = JSON.parse(readFileSync(HALOTT_UT, 'utf-8')); } catch { /* első futás: alapállapot */ }
    if (eloSlugok.length > 50) {   // ha a cikkmappa valamiért üres/sérült, NE jelentsünk mindent halottnak
      halott = halottFrissit(elozo, eloSlugok, now);
      halottSlugok = halottEsedekes(halott, now);
      for (const s of halottSlugok) for (const lp of LANGS) urls.add(`${site}${lp}/article/${s}`);
      if (halottSlugok.length) console.log(`   🪦 halott link bejelentésre: ${halottSlugok.length} (${halottSlugok.slice(0, 3).join(', ')}${halottSlugok.length > 3 ? '…' : ''})`);
    }
  } catch (e) { console.log('   ⚠️ halott-link őr hiba (nem kritikus): ' + e.message.slice(0, 80)); }
  // ÖSSZEVONT ÚTMUTATÓK (2026-10-19, core/utmutato-osszevonas.js): a régi cím (most 301) és a megmaradó.
  try {
    const naplo = JSON.parse(readFileSync(join(ROOT, 'content', 'osszevonas-naplo.json'), 'utf-8'));
    for (const u of osszevontUrlek(naplo, site, LANGS, now, FRESH_HOURS)) urls.add(u);
  } catch { /* még nem volt összevonás */ }
  // Ha van friss tartalom, a listaoldalak is változtak
  if (urls.size > 0 || all) {
    for (const lp of LANGS) { urls.add(`${site}${lp}/`); urls.add(`${site}${lp}/guides`); urls.add(`${site}${lp}/tools`); }
  }
  if (urls.size === 0) {
    if (halott && !dry) { try { writeFileSync(HALOTT_UT, JSON.stringify(halott, null, 2) + '\n'); } catch { /* nem kritikus */ } }   // az élő-lista így is frissüljön
    console.log('   💤 IndexNow: nincs friss URL — nincs bejelentés.'); return { submitted: 0 };
  }

  const list = [...urls].slice(0, 10000);   // protokoll-limit

  // PRÓBA-ÜZEMMÓD (2026-07-28): bejelentés NÉLKÜL megmutatja, MIT küldenénk.
  // Azért kellett, mert évekig észrevétlenül .html-es (átirányító) címeket
  // hirdettünk — pont azt a hibát táplálva, amit a Search Console jelzett.
  // Ilyet csak úgy lehet elkapni, ha meg tudjuk NÉZNI a kimenetet küldés nélkül.
  const halottMent = (ok) => {   // az állapot mentése; kipipálás CSAK sikeres bejelentés után
    if (!halott || dry) return;
    try { writeFileSync(HALOTT_UT, JSON.stringify(ok ? halottBejelentve(halott, halottSlugok, now) : halott, null, 2) + '\n'); } catch { /* nem kritikus */ }
  };
  if (dry) {
    console.log(`   🧪 PRÓBA — ${list.length} URL menne ki, bejelentés NÉLKÜL:`);
    for (const u of list.slice(0, 8)) console.log('      ' + u);
    const bad = list.filter(u => u.endsWith('.html'));
    console.log(bad.length ? `   ❌ ${bad.length} db .html-es (átirányító) cím!` : '   ✅ egyetlen .html-es cím sincs.');
    return { submitted: 0, dry: true, urls: list };
  }

  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: site.replace(/^https?:\/\//, ''),
        key,
        keyLocation: `${site}/${key}.txt`,
        urlList: list
      }),
      signal: AbortSignal.timeout(20000)
    });
    // 200 = feldolgozva, 202 = elfogadva (első alkalommal tipikus, amíg a kulcsot ellenőrzi)
    if (r.status === 200 || r.status === 202) {
      console.log(`   📣 IndexNow: ${list.length} URL bejelentve (HTTP ${r.status})`);
      halottMent(true);
      return { submitted: list.length };
    }
    console.log(`   ⚠️ IndexNow HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    console.log(`   ⚠️ IndexNow hiba (nem kritikus): ${e.message.slice(0, 80)}`);
  }
  halottMent(false);
  return { submitted: 0 };
}

// Önálló futtatás
if (process.argv[1] && process.argv[1].endsWith('indexnow.js')) {
  submitIndexNow({ all: process.argv.includes('--all'), dry: process.argv.includes('--dry') }).then(() => process.exit(0));
}
