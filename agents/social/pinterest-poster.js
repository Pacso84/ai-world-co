// ===================================================================
// PINTEREST POSTER — útmutatók pinelése (Make webhook → Pinterest)
// ===================================================================
//
// MIÉRT: a Pinterest a legjobb INGYENES forgalom-csatorna a vizuális how-to
// tartalomhoz — egy pin ÉVEKIG hoz látogatót (evergreen), szemben a hírrel.
// Ugyanazt a bevált Make-mintát használjuk, mint az FB-nél (agents/social/
// poster.js): a rendszer egy Make.com webhookra POST-ol, a Make egy
// "Create a Pin" modullal kirakja a user Pinterest-tábláJára. Így NINCS
// Pinterest API-token a repóban (a user sima Pinterest-belépéssel köti össze).
//
// AKTIVÁLÁS (a user teendője, egyszeri):
//   1) Make.com → új Scenario: Webhook (Custom) → Pinterest: "Create a Pin"
//   2) A Pinterest-modulban: kösd össze a Pinterest-fiókod + válassz táblát,
//      a mezőkre map-eld a webhook adatait: title→Title, description→Description,
//      link→Destination link, image→Image URL.
//   3) A webhook URL-jét tedd GitHub Secret-be: PINTEREST_MAKE_WEBHOOK_URL
//      (soha ne a repóba). Ennyi — innentől automatikus.
//
// SZABÁLYOK:
//   - ÚTMUTATÓK: evergreen → nincs frissesség-vágás, lassan az ÖSSZESET pineljük
//     (futásonként --limit, alap 3), a legfrissebbtől visszafelé. A régi jó
//     útmutató is hoz Pinterest-forgalmat.
//   - HÍREK: csak FRISS (7 napon belül) — a hír nem evergreen.
//   - a kiküldöttet posted_pin:true + posted_pin_at jelöli (nem megy ki kétszer)
//   - kép KÖTELEZŐ a pinhez (a core/share-images.js gyártotta borító)
//
// FUTTATÁS:  node agents/social/pinterest-poster.js [--limit 3] [--dry]
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const NEWS_FRESH_DAYS = 7;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 3 : 3;

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// slug → { publishedAt, isGuide } a cikkekből (frissesség + útmutató-felismerés)
function articleMap() {
  const map = {};
  if (!existsSync(ARTICLES_DIR)) return map;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const slug = slugify((m && m[1]) || d.original_title || f);
      const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');
      map[slug] = { publishedAt: d._meta?.published_at || '', isGuide };
    } catch { /* kihagyjuk */ }
  }
  return map;
}

// ===================================================================
// ELŐ-ELLENŐRZÉS (2026-07-27) — MIÉRT KELL:
// A Make webhookja AKKOR IS HTTP 200-at ad, ha a forgatókönyv semmit nem
// csinál a beérkező adattal. 2026-07-25 és 07-27 között 38 pin kapott
// "posted_pin: true" jelölést anélkül, hogy VALAHA megjelent volna a
// Pinteresten — a forgatókönyv (6701833) ugyanis CSAK a webhook-modult
// tartalmazta, Pinterest-modul nélkül, és soha le sem futott. Mivel a
// jelölés végleges, ezek a pinek örökre kiestek volna.
//
// A Make API `usedPackages` mezője pontosan megmutatja, MI van benne:
//   ["gateway"]                       = csak a webhook  → NÉMÁN NYEL
//   ["gateway","http","pinterest"]    = teljes lánc     → tényleg kimegy
// Ha hiányzik a kimeneti modul, NEM küldünk semmit: a sor érintetlen marad,
// és amint a forgatókönyv elkészül, minden pin szépen kimegy.
//
// TOKEN NÉLKÜL (helyi futás) nem tudunk ellenőrizni — ilyenkor átengedjük,
// de kiírjuk, hogy az ellenőrzés kimaradt.
// ===================================================================
const MAKE_SCENARIO_ID = (process.env.PINTEREST_MAKE_SCENARIO_ID || '6701833').trim();
const REQUIRED_PACKAGE = 'pinterest';

async function scenarioReady() {
  const token = (process.env.MAKE_API_TOKEN || '').trim();
  if (!token) { console.log('   ⚠️  Nincs MAKE_API_TOKEN — a forgatókönyv-ellenőrzés kimarad.\n'); return true; }
  try {
    const r = await fetch(`https://eu1.make.com/api/v2/scenarios/${MAKE_SCENARIO_ID}`, {
      headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) { console.log(`   ⚠️  Make API HTTP ${r.status} — az ellenőrzés kimarad, küldök.\n`); return true; }
    const s = (await r.json()).scenario || {};
    if (s.isActive === false || s.isPaused === true) {
      console.log('   ⛔ A Make-forgatókönyv INAKTÍV — nem küldök (a sor érintetlen marad).');
      console.log('      Kapcsold vissza: eu1.make.com → Scenarios → kapcsoló a sor végén.\n');
      return false;
    }
    const pkgs = s.usedPackages || [];
    if (!pkgs.includes(REQUIRED_PACKAGE)) {
      console.log(`   ⛔ A Make-forgatókönyv (${MAKE_SCENARIO_ID}) NEM tartalmaz Pinterest-modult — csak: [${pkgs.join(', ')}]`);
      console.log('      A webhook 200-at ad, de a pin SEHOVA nem kerül ki → nem küldök, a sor megmarad.');
      console.log('      Javítás: eu1.make.com → a forgatókönyv → + → Pinterest → Create a Pin → mentés.\n');
      return false;
    }
    return true;
  } catch { console.log('   ⚠️  A Make-ellenőrzés hibára futott — küldök.\n'); return true; }
}

async function main() {
  console.log('📌 PINTEREST POSTER INDUL');
  console.log('─'.repeat(60));

  const hook = (process.env.PINTEREST_MAKE_WEBHOOK_URL || '').trim();
  if (!hook) { console.log('   ⏭️  Nincs PINTEREST_MAKE_WEBHOOK_URL — kihagyom (állítsd be a Make-scenario után GitHub Secrets-ben).'); return; }
  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }
  if (!(await scenarioReady())) return;

  const info = articleMap();
  const now = Date.now();
  const queue = [];

  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post;
    try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post.posted_pin) continue;                 // már pinelve / lezárva
    if (!post.url || !post.title) continue;

    const meta = info[post.slug] || { publishedAt: '', isGuide: false };
    // HÍR: csak friss. ÚTMUTATÓ: evergreen — nincs vágás.
    if (!meta.isGuide) {
      const age = meta.publishedAt ? (now - new Date(meta.publishedAt).getTime()) : Infinity;
      if (age > NEWS_FRESH_DAYS * 24 * 3600e3) {
        post.posted_pin = 'skipped-stale-news';
        // A PRÓBA NE ÍRJON (2026-08-02) — lásd instagram-poster.js
        if (!DRY) writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        continue;
      }
    }
    queue.push({ path, post, meta });
  }

  if (!queue.length) { console.log('   💤 Nincs pinelendő tartalom.'); return; }
  // ÚTMUTATÓK elöl (evergreen prioritás), azon belül legfrissebb előre
  queue.sort((a, b) =>
    (b.meta.isGuide - a.meta.isGuide) ||
    (b.meta.publishedAt || '').localeCompare(a.meta.publishedAt || ''));
  const batch = queue.slice(0, LIMIT);
  console.log(`   📋 Pinelhető a sorban: ${queue.length} (útmutató elöl) | most: ${batch.length}${DRY ? ' (PRÓBA)' : ''}\n`);

  let sent = 0, failed = 0;
  for (const { path, post, meta } of batch) {
    const site = post.url.replace(/(https?:\/\/[^/]+).*/, '$1');
    // Kép KÖTELEZŐ a pinhez: címes megosztás-kép → sima borító → og-default
    let image = `${site}/assets/og-default.jpg`;
    for (const cand of [`${site}/assets/share/${post.slug}.jpg`, `${site}/assets/images/${post.slug}.jpg`]) {
      try { const h = await fetch(cand, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (h.ok) { image = cand; break; } }
      catch { /* következő jelölt */ }
    }
    // Pin-leírás: a FB-szöveg (URL nélkül) jó, kulcsszavas leírás; ha nincs, az alcím.
    const desc = String(post.facebook || post.subtitle || '')
      .split(post.url).join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
      || String(post.title);
    const title = String(post.title).slice(0, 100);   // Pinterest-cím max ~100

    console.log(`📌 ${meta.isGuide ? '📘' : '📰'} ${title.slice(0, 55)}...`);
    if (DRY) { console.log(`   (próba) desc: ${desc.slice(0, 70)}…`); continue; }
    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: desc, link: post.url, image }),
        signal: AbortSignal.timeout(20000)
      });
      if (r.ok) {
        post.posted_pin = true;
        post.posted_pin_at = new Date().toISOString();
        writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        sent++;
        console.log('   ✅ Kiküldve a Make-nek (→ Pinterest)');
      } else {
        failed++;
        console.log(`   ❌ Webhook HTTP ${r.status} — marad a sorban`);
      }
    } catch (e) {
      failed++;
      console.log(`   ❌ ${e.message.slice(0, 60)} — marad a sorban`);
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 PINTEREST POSTER: ${sent} kiküldve, ${failed} sikertelen, sorban maradt: ${queue.length - batch.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 PINTEREST POSTER HIBA:', e); process.exit(1); });
