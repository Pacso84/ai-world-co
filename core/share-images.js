// ===================================================================
// MEGOSZTÁS-KÉPEK — címes borítók a friss cikkekhez (FB-posztokhoz)
// ===================================================================
//
// User-ötlet (2026-07-08): a profi oldalak ráírják a képre a címet + a
// márkát — sokkal kattinthatóbb a poszt. Ez a szkript a 7 napon belül
// publikált cikkek borítójából 1200x630-as képet készít: sötét átmenet
// alul + a cikk CÍME + AI WORLD HQ · aiworldhq.com márkasor.
//
// A build UTÁN fut (a website/public/assets/images/ már kész), a deploy
// ELŐTT — így a kép a cikkel együtt kerül élesre. A social poster ezt
// részesíti előnyben (assets/share/<slug>.jpg), ha létezik.
//
// FUTTATÁS:  node core/share-images.js [--force] [--days 7]
// ===================================================================

import { readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { selectFormats, queuedSlugs } from './image-targets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const IMG_DIR = join(ROOT, 'website', 'public', 'assets', 'images');
const OUT_BASE = join(ROOT, 'website', 'public', 'assets');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const di = args.indexOf('--days');
const DAYS = di !== -1 && args[di + 1] ? parseInt(args[di + 1], 10) || 7 : 7;

// FORMÁTUMOK:
//   share/  1200x630 fekvő — Facebook, Pinterest, og:image
//
// A rajzolás mérete a SZÉLESSÉGGEL arányos (k = W/1200) és a sorok száma a
// képaránytól függ, ezért új formátumot elég egy sorral felvenni ide — nem kell
// külön elrendezést karbantartani.
//
// VOLT ITT EGY `ig` (1080x1350 álló) formátum is az Instagramhoz, 2026-08-02-én
// néhány órán át. A user úgy döntött, hogy Instagram nem kell, ezért kivettük —
// fölösleges képeket gyártani és deployolni, amit senki nem néz meg.
// Visszahozni egyetlen sor:
//   { key: 'ig', w: 1080, h: 1350, grad: [0.55, 0.80] }
// PIN (2026-08-06): a Pinterest FÜGGŐLEGES, 2:3 arányú képekre épül — egy
// fekvő 1200x630 pin apró csíkként jelenik meg a feedben. 30 nap alatt 144
// pint küldtünk ki, és a Cloudflare szerint PONTOSAN 0 látogató érkezett
// Pinterestről; a fekvő kép a legvalószínűbb (bár nem bizonyított) ok.
// 1000x1500 a Pinterest hivatalos ajánlása.
//
// FB (2026-08-09): a Facebook-poszt FÉNYKÉP-feltöltés (Make: facebook-pages ·
// UploadPhoto), nem link-előnézet — tehát a kép arányát MI választjuk meg, és
// a mobil hírfolyamban az 1,91:1 fekvő kép vékony csík. A Meta ajánlása 4:5.
//
// MIÉRT ÉPP MOST: 2026-08-09-én megmértük, hogy az oldalnak 3 KÖVETŐJE van,
// miközben napi ~26 látogató érkezik a Facebookról. 3 követő ezt nem tudja
// előállítani → a teljes elérésünket a Meta ajánlómotorja adja, idegeneknek.
// Ilyenkor a kép mérete közvetlenül a figyelemért versenyez.
//
// ⚠️ ŐSZINTÉN A VÁRHATÓ HATÁSRÓL: ugyanez a javítás a Pinteresten eddig 0
// mérhető eredményt hozott (3 nap, ~44 álló pin → 0 látogató). A Facebook
// azért más eset, mert ott MÁR VAN elérésünk — a kép azoknak a posztoknak a
// teljesítményét javítja, amiket a rendszer amúgy is megmutat. Nem garancia.
//
// Az og:image MARAD az 1200x630-as share/ kép: azt a link-előnézeti kártya
// használja, ott az 1,91:1 a helyes arány. A két formátum két külön célra van.
const FORMATS = [
  { key: 'share', w: 1200, h: 630, grad: [0.35, 0.72] },
  { key: 'pin', w: 1000, h: 1500, grad: [0.50, 0.78] },
  { key: 'fb', w: 1080, h: 1350, grad: [0.55, 0.80] }
];

function slugify(t) { return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70); }
function xmlEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Cím tördelése max 3 sorra (~26 karakter/sor); ha hosszabb, "…"
function wrapTitle(title, maxChars = 26, maxLines = 3) {
  const words = String(title).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = (cur + ' ' + w).trim();
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  else if (lines.length === maxLines && cur) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{2}$/, '') + '…';
  return lines;
}

function overlaySvg(title, fmt) {
  const { w: W, h: H, grad } = fmt;
  const k = W / 1200;                                     // minden méret a szélességgel arányos
  const r = n => Math.round(n * k);
  // Álló képen van függőleges hely 4 sorra — a fekvőn nincs. (Most csak fekvő
  // formátumunk van, tehát ez mindig 3; a szabály akkor él, ha új arány jön.)
  const lines = wrapTitle(title, 26, H > W ? 4 : 3);
  const fs = r(lines.length >= 3 ? 56 : 62);              // 3+ sornál kicsit kisebb betű
  const lh = Math.round(fs * 1.18);
  const pad = r(60);
  const brandY = H - r(48);
  const baseY = H - r(58) - (lines.length - 1) * lh - r(44);   // 44 = márkasor helye
  const tspans = lines.map((l, i) =>
    `<tspan x="${pad}" y="${baseY + i * lh}">${xmlEsc(l)}</tspan>`).join('');

  // A tömör sáv CSAK a Facebook-formátumon (lásd az indoklást lentebb).
  const sav = fmt.key === 'fb';
  // A sáv teteje a legfelső címsor fölé kerül, egy sornyi levegővel.
  const savMagas = H - (baseY - fs - r(30));
  // KÖVETÉSRE HÍVÁS A KÉPEN (2026-08-20). MIÉRT ITT: a caption-be épített
  // hívás a ~358. karakternél kezdődik, a Facebook viszont mobilon 125-180
  // karakter után levág — a forgalmunk 82%-a mobil, tehát azt gyakorlatilag
  // SENKI nem látja. A kép soha nem vágódik le.
  const masodikSor = sav ? '· Follow for daily AI tips' : '· aiworldhq.com';
  // ⚠️ TÖMÖR SÁV, NEM LÁGY ÁTMENET — a Facebook-formátumon (2026-08-20).
  //
  // MIÉRT: a borítóink gépi képek, és az aljukon gyakran GÉPI ZAGYVASÁG van —
  // egy élő posztunkon a telefon képernyőjén ez állt: „Voice Create", „Voice
  // trigger", „93 %", „Thermostat 0 0". Ez a leggyakoribb árulkodó jel, amiről
  // az emberek felismerik az AI-képet, és „tartalomgyárat" olvasnak ki belőle.
  // A lágy átmenet ezt átengedte, ráadásul a cím RÁÚSZOTT a kép tartalmára
  // (a „Thermostat" szó átütött rajta).
  //
  // A tömör sáv egyszerre három dolgot old meg: a cím élesen olvasható, a
  // zagyva alsó sáv eltűnik, és az egész MEGTERVEZETTNEK látszik — miközben a
  // fotó felső, valóban figyelemfogó része megmarad.
  //
  // A `share` (link-előnézet) és a `pin` formátum marad átmenetes: ott a kép
  // más szerepet tölt be, és nincs meg ez a hiba-minta.
  const savTeteje = sav ? H - savMagas : 0;
  const hatter = sav
    ? `<rect x="0" y="${savTeteje}" width="${W}" height="${savMagas}" fill="#14120f"/>
  <rect x="0" y="${savTeteje - r(6)}" width="${W}" height="${r(6)}" fill="#14120f" opacity="0.55"/>
  <rect x="0" y="${savTeteje}" width="${W}" height="${r(4)}" fill="#e8c15a"/>`
    : `<rect width="${W}" height="${H}" fill="url(#g)"/>`;
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="${grad[0]}" stop-color="#0d0f14" stop-opacity="0"/>
      <stop offset="${grad[1]}" stop-color="#0d0f14" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#0d0f14" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  ${hatter}
  <text font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff">${tspans}</text>
  <text x="${pad}" y="${brandY}" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${r(26)}" font-weight="700" fill="#e8c15a">AI WORLD HQ</text>
  <text x="${r(252)}" y="${brandY}" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${r(26)}" fill="#c9c4ba">${xmlEsc(masodikSor)}</text>
</svg>`);
}

async function main() {
  console.log('🖼️  MEGOSZTÁS-KÉP GENERÁTOR INDUL');
  console.log('─'.repeat(60));
  if (!existsSync(IMG_DIR)) { console.log('   ⏭️  Nincs website/public/assets/images — előbb futtasd a buildet.'); return; }
  for (const f of FORMATS) mkdirSync(join(OUT_BASE, f.key), { recursive: true });

  // Melyik cikkre vár még kiküldés? Azoknak a 7 napos ablakon kívül is kell kép.
  let queued = new Set();
  try {
    queued = queuedSlugs(readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))
      .map(x => { try { return JSON.parse(readFileSync(join(SOCIAL_DIR, x), 'utf-8')); } catch { return null; } })
      .filter(Boolean));
    console.log(`   📮 ${queued.size} cikk vár még kiküldésre — nekik a koruktól függetlenül kell kép`);
  } catch { /* nincs social mappa: marad a puszta 7 napos ablak */ }

  const now = Date.now();
  let made = 0, skipped = 0, noCover = 0;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d;
    try { d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8')); } catch { continue; }
    const title = ((d.article_markdown || '').match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || d.original_title || '';
    if (!title) continue;
    // A KANONIKUS slug a mérvadó, NEM a címből képzett (2026-08-09).
    // Mérve: 654 cikkből 72-nél (11%) eltért a kettő — a brit→amerikai
    // helyesírás-javítás ("organise"→"organize") és a cím-átírások miatt.
    // A borítók viszont a kanonikus néven állnak az images/ mappában, ezért a
    // generátor ezt a 72-t MEG SEM TALÁLTA (ez volt a "borító nélkül" tétel),
    // és a posztjuk cím nélküli sima borítóval ment ki.
    const slug = d._meta?.slug || slugify(title);
    const pub = new Date(d._meta?.published_at || 0).getTime();
    const formats = selectFormats({
      ageDays: (now - pub) / 86400e3,
      freshDays: DAYS,
      isQueued: queued.has(slug),
      all: FORMATS
    });
    if (!formats.length) continue;
    // HETI ÖSSZEFOGLALÓ KABALA (2026-07-26): a weekly-digest OG/megosztás-kép is a
    // fix kabala-borítóból készül (a cím ráíródik a bal sötét sávra), nem a slugból.
    const isWeekly = /weekly-digest/.test((d.article_markdown || '').slice(0, 600));
    const mascot = join(IMG_DIR, 'mascot-weekly.jpg');
    const src = (isWeekly && existsSync(mascot)) ? mascot : join(IMG_DIR, slug + '.jpg');
    if (!existsSync(src)) { noCover++; continue; }

    let didWork = false;
    for (const fmt of formats) {
      const out = join(OUT_BASE, fmt.key, slug + '.jpg');
      if (existsSync(out) && !FORCE) continue;
      try {
        // WEEKLY-DIGEST: a kabala-kép már kész, márkás kártya (saját felirattal) →
        // NEM rakunk rá cím-overlay-t (dupla/kevert szöveg lenne). A többi cikknél
        // marad a megszokott cím + márkasor overlay.
        //
        // A kabalát ÁLLÓ formátumban NEM vágjuk (2026-08-02): a kép fekvő, és a
        // rajta lévő "AIWORLDHQ" feliratot egy 4:5-ös vágás levágná. Inkább
        // sötét háttérre illesztjük teljes egészében — a user saját rajza sértetlen.
        const portrait = fmt.h > fmt.w;
        let pipe = sharp(src).resize(fmt.w, fmt.h, (isWeekly && portrait)
          ? { fit: 'contain', background: { r: 13, g: 15, b: 20 } }
          : { fit: 'cover', position: isWeekly ? 'centre' : 'attention' });
        if (!isWeekly) pipe = pipe.composite([{ input: overlaySvg(title, fmt) }]);
        await pipe.jpeg({ quality: 82 }).toFile(out);
        didWork = true;
      } catch (e) {
        console.log(`   ⚠️ ${slug.slice(0, 40)} [${fmt.key}]: ${e.message.slice(0, 50)}`);
      }
    }
    if (didWork) { made++; console.log(`   ✅ ${slug.slice(0, 60)}`); }
    else skipped++;
  }
  console.log('─'.repeat(60));
  console.log(`📊 Kész: ${made} új | megvolt: ${skipped} | borító nélkül: ${noCover}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 SHARE-IMAGES HIBA:', e); process.exit(1); });
