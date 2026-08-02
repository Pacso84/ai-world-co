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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
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
const FORMATS = [
  { key: 'share', w: 1200, h: 630, grad: [0.35, 0.72] }
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
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="${grad[0]}" stop-color="#0d0f14" stop-opacity="0"/>
      <stop offset="${grad[1]}" stop-color="#0d0f14" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#0d0f14" stop-opacity="0.94"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff">${tspans}</text>
  <text x="${pad}" y="${brandY}" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${r(26)}" font-weight="700" fill="#e8c15a">AI WORLD HQ</text>
  <text x="${r(252)}" y="${brandY}" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-size="${r(26)}" fill="#c9c4ba">· aiworldhq.com</text>
</svg>`);
}

async function main() {
  console.log('🖼️  MEGOSZTÁS-KÉP GENERÁTOR INDUL');
  console.log('─'.repeat(60));
  if (!existsSync(IMG_DIR)) { console.log('   ⏭️  Nincs website/public/assets/images — előbb futtasd a buildet.'); return; }
  for (const f of FORMATS) mkdirSync(join(OUT_BASE, f.key), { recursive: true });

  const now = Date.now();
  let made = 0, skipped = 0, noCover = 0;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d;
    try { d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8')); } catch { continue; }
    const pub = new Date(d._meta?.published_at || 0).getTime();
    if (now - pub > DAYS * 24 * 3600e3) continue;
    const title = ((d.article_markdown || '').match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || d.original_title || '';
    if (!title) continue;
    const slug = slugify(title);
    // HETI ÖSSZEFOGLALÓ KABALA (2026-07-26): a weekly-digest OG/megosztás-kép is a
    // fix kabala-borítóból készül (a cím ráíródik a bal sötét sávra), nem a slugból.
    const isWeekly = /weekly-digest/.test((d.article_markdown || '').slice(0, 600));
    const mascot = join(IMG_DIR, 'mascot-weekly.jpg');
    const src = (isWeekly && existsSync(mascot)) ? mascot : join(IMG_DIR, slug + '.jpg');
    if (!existsSync(src)) { noCover++; continue; }

    let didWork = false;
    for (const fmt of FORMATS) {
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
