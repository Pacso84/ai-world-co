// ===================================================================
// BORÍTÓKÉP-ŐRSZEM — van-e képe a friss cikkeknek
// ===================================================================
//
// ELŐZMÉNY (2026-08-14, a USER vette észre a főoldalon): a CÍMLAPSZTORI
// borítója üres bézs felület volt egyetlen csillogás-emojival. Nem dizájn-hiba:
// a képfájl NEM LÉTEZETT, és a főoldal ilyenkor tartalék keretet tesz ki.
//
// A designer mindhárom aznapi cikkre "Cloudflare HTTP 400"-at kapott (a
// Cloudflare kivezette a width/height paramétert a Flux API-ból), és ezt
// SZÉPEN BE IS ÍRTA — a CI naplójába, ahová senki nem néz.
//
// UGYANAZ A MINTA, mint a 08-10-i i18n-őrszemnél: **az őrszem csak akkor őr,
// ha oda szól, ahol a user néz.** Ezért ez állapotfájlt ír
// (memory/image-guard.json), és a napi Telegram-riport beolvassa.
//
// A SZIMPTÓMÁT mérjük (hiányzik a kép), NEM az okot. Így bármilyen jövőbeli ok
// — API-változás, kvóta, hálózat, elrontott slug — ugyanúgy kiderül; nem csak
// az, amit ma megjavítottunk.
//
// FUTTATÁS: node core/image-guard.js
// Kilépési kód mindig 0 — a lelet a napi riportba megy (🖼️).
// ===================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/** Ennyi napra visszamenőleg firtatjuk a képhiányt. A régi hiány más ügy
 *  (felújítás), és minden nap ugyanazt sorolva a riport-sor zajjá válna. */
export const COVER_FRESH_DAYS = 5;

/**
 * Melyik friss cikknek hiányzik a borítóképe?
 *
 * @param {object} p
 * @param {Array<{slug:string, pub:string, guide?:boolean, digest?:boolean}>} p.articles
 * @param {(slug:string)=>boolean} p.hasCover  van-e képe? (a hívó dönti el, hogyan)
 * @param {string} p.now  a "most" ISO-ban (teszthez injektálható)
 * @returns {Array<{slug:string, pub:string, cimlap:boolean}>} legfrissebb elöl
 */
export function findMissingCovers({ articles, hasCover, now } = {}) {
  if (!Array.isArray(articles) || typeof hasCover !== 'function') return [];
  const most = Date.parse(now || new Date().toISOString());
  const hatar = most - COVER_FRESH_DAYS * 864e5;

  const frissek = articles
    .filter(a => a && a.slug && a.pub && Date.parse(a.pub) >= hatar)
    .sort((a, b) => String(b.pub).localeCompare(String(a.pub)));

  const hianyzik = [];
  for (const a of frissek) {
    let van = true;
    // ÓVATOSSÁG: ha az ellenőrzés hibára fut, NEM állítjuk, hogy hiányzik.
    // Egy fájlrendszer-hiba ne kiáltson farkast a napi riportban.
    try { van = !!hasCover(a.slug); } catch { van = true; }
    if (!van) hianyzik.push({ slug: a.slug, pub: a.pub, cimlap: false });
  }
  // A CÍMLAPSZTORI külön súlyú: azt MINDEN látogató elsőként látja.
  // ⚠️ A szabály a website/build.js-t tükrözi, és NEM "a legfrissebb cikk":
  // a főoldal hír-blokkja kihagyja az ÚTMUTATÓKAT (azok a /guides alatt élnek)
  // és a HETI ÖSSZEFOGLALÓT (az külön ki van tűzve). Élesben ellenőrizve:
  // a legfrissebb cikk aznap egy útmutató volt, a címlapon mégis a legfrissebb
  // HÍR állt. Az első változatom emiatt NEM jelölte volna meg a valódi esetet.
  const cimlapSlug = articles
    .filter(a => a && a.slug && a.pub && !a.guide && !a.digest)
    .sort((a, b) => String(b.pub).localeCompare(String(a.pub)))[0]?.slug;
  for (const h of hianyzik) if (h.slug === cimlapSlug) h.cimlap = true;
  // A címlapsztori kerüljön a lista elejére — a riport az első kettőt mutatja.
  hianyzik.sort((a, b) => (b.cimlap ? 1 : 0) - (a.cimlap ? 1 : 0));
  return hianyzik;
}

// ---------- önálló futtatás (a CI hívja) ----------
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('core/image-guard.js')) {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const A = join(ROOT, 'content', 'articles');
  const IMG = join(ROOT, 'website', 'assets', 'images');

  const articles = [];
  try {
    for (const f of readdirSync(A).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(A, f), 'utf-8'));
        if (!d._meta?.slug || !d._meta?.published_at) continue;
        // A guide/digest jelölés a build.js szabályát tükrözi (lásd fent).
        const md = d.article_markdown || '';
        articles.push({
          slug: d._meta.slug,
          pub: d._meta.published_at,
          guide: d._meta.type === 'guide' || f.startsWith('ARTICLE_GUIDE'),
          digest: /weekly-digest/.test(JSON.stringify(d._meta.tags || []) + md.slice(0, 600))
        });
      } catch { /* rossz fájl kihagyva */ }
    }
  } catch { /* nincs cikk-mappa */ }

  const problems = findMissingCovers({
    articles,
    hasCover: slug => existsSync(join(IMG, `${slug}.jpg`))
  }).map(x => ({ code: x.cimlap ? 'COVER_MISSING_FRONT' : 'COVER_MISSING', slug: x.slug, pub: x.pub, cimlap: x.cimlap }));

  console.log('🖼️  BORÍTÓKÉP-ŐRSZEM');
  console.log('─'.repeat(60));
  if (!problems.length) console.log(`   ✅ Az elmúlt ${COVER_FRESH_DAYS} nap minden cikkének van borítóképe.`);
  else for (const p of problems) console.log(`   ⚠️  [${p.code}] ${p.slug.slice(0, 60)}`);

  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(join(ROOT, 'memory', 'image-guard.json'),
      JSON.stringify({ at: new Date().toISOString(), problems }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
  process.exit(0);
}

export default { findMissingCovers, COVER_FRESH_DAYS };
