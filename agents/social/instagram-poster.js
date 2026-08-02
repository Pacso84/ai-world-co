// ===================================================================
// INSTAGRAM POSTER — képes posztok (Make webhook → Instagram Business)
// ===================================================================
//
// User-kérés (2026-08-02): "csináljunk instagramot mint a facebook".
// Ugyanaz a bevált Make-minta, mint az FB-nél és a Pinterestnél: a rendszer
// egy Make.com webhookra POST-ol, a Make egy "Create a Photo Post" modullal
// kirakja. Így NINCS Instagram API-token a repóban.
//
// ⚠️ AMIT ELŐRE TUDNI KELL — EZ NEM FORGALOM-CSATORNA:
// Az Instagram a poszt SZÖVEGÉBEN nem enged kattintható linket (2026-ban is
// csak a Meta Verified előfizetők egy szűk tesztcsoportja kap ilyet). Egyedül
// a PROFIL BIO linkje kattintható (max 5) és a Sztori link-matricája. Ezért:
//   - a képaláírás "link a bióban"-ra irányít, és KIÍRJA a domaint szövegesen,
//   - a valódi hozam márkajelenlét + hashtag-felfedezés, NEM átkattintás.
// Összehasonlításul, saját mérésből: a Pinterest (ahol a link KATTINTHATÓ) egy
// hét alatt 0 látogatót hozott, míg a Facebook 205-öt. Az elvárás legyen józan.
//
// AKTIVÁLÁS (a user teendője, egyszeri):
//   1) Instagram: a fiók legyen ÜZLETI/ALKOTÓI (Professional) és legyen
//      összekötve az "AI World HQ" Facebook-oldallal.
//   2) Make.com → új Scenario: Webhook (Custom) → "Instagram for Business:
//      Create a Photo Post". Mező-map: image→Photo URL, caption→Caption.
//   3) A webhook URL-jét tedd GitHub Secret-be: INSTAGRAM_MAKE_WEBHOOK_URL
//      (SOHA ne a repóba).
//
// SZABÁLYOK (a Pinteresttel azonos, bevált logika):
//   - ÚTMUTATÓK: evergreen → nincs frissesség-vágás
//   - HÍREK: csak FRISS (7 napon belül)
//   - a kiküldöttet posted_ig:true + posted_ig_at jelöli (nem megy ki kétszer)
//   - kép KÖTELEZŐ: az ÁLLÓ (1080x1350) változat, mert az Instagram
//     hírfolyamában a fekvő kép bélyegképnyire zsugorodik
//
// FUTTATÁS:  node agents/social/instagram-poster.js [--limit 2] [--dry]
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
const CAPTION_MAX = 2200;          // Instagram képaláírás felső határa

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 2 : 2;

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
      const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');
      const rec = { publishedAt: d._meta?.published_at || '', isGuide };
      if (d._meta?.slug) map[d._meta.slug] = rec;
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const legacy = slugify((m && m[1]) || d.original_title || f);
      if (legacy && !map[legacy]) map[legacy] = rec;
    } catch { /* kihagyjuk */ }
  }
  return map;
}

// A social-fájl VALÓDI slugja: elsődlegesen az url-ből (a `slug` mező lehet
// régi/csonka maradvány — ez 2026-08-02-én 210 fájlnál okozott néma vesztést).
function realSlug(post) {
  const fromUrl = String(post.url || '').split('/article/')[1];
  return (fromUrl || post.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

// ── HASHTAGEK — INGYEN, a meglévő adatból ────────────────────────────
// Nem hívunk AI-t értük ($0). Fix alapkészlet + a cikk saját márkája, ha van.
// Kitalált vagy félrevezető címkét SOHA nem teszünk ki (ugyanaz az elv, mint
// a hitelesség-kapunál): csak olyat, ami a tartalomra tényleg igaz.
const BASE_TAGS = ['#ai', '#artificialintelligence', '#aitools', '#aiforbeginners', '#technews'];
const GUIDE_TAGS = ['#howto', '#tutorial', '#productivity'];

function hashtags(post, isGuide) {
  const tags = [...BASE_TAGS, ...(isGuide ? GUIDE_TAGS : [])];
  for (const raw of [post.company, post.tool]) {
    const t = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (t.length >= 2 && !tags.includes('#' + t)) tags.push('#' + t);
  }
  return tags.slice(0, 12).join(' ');    // 12 bőven elég; a spamgyanús 30 nem cél
}

function buildCaption(post, isGuide) {
  // A FB-szövegből indulunk (már megírt, jó hangvételű), de az URL-t KIVESSZÜK:
  // az Instagramon úgysem kattintható, csak csúnyítja a képaláírást.
  const body = String(post.facebook || post.subtitle || post.title || '')
    .split(post.url).join('')
    .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const host = String(post.url || '').replace(/^https?:\/\//, '').split('/')[0];
  const tags = hashtags(post, isGuide);
  const cta = `🔗 Full ${isGuide ? 'guide' : 'story'} — link in bio · ${host}`;
  let caption = `${body}\n\n${cta}\n\n${tags}`;
  if (caption.length > CAPTION_MAX) {
    // A hashtageket és a CTA-t MEGTARTJUK, a törzsszöveget rövidítjük —
    // fordítva a poszt elveszítené a felfedezhetőségét és az irányítást.
    const room = CAPTION_MAX - (cta.length + tags.length + 6);
    caption = `${body.slice(0, Math.max(0, room - 1)).trimEnd()}…\n\n${cta}\n\n${tags}`;
  }
  return caption;
}

// ===================================================================
// ELŐ-ELLENŐRZÉS — ugyanaz a lecke, mint a Pinterestnél (2026-07-27):
// a Make webhookja AKKOR IS HTTP 200-at ad, ha a forgatókönyv semmit nem
// csinál az adattal. Akkor 38 pin kapott "kiküldve" jelölést úgy, hogy
// SOHA nem jelent meg sehol — mert a forgatókönyv csak a webhook-modulból
// állt. A jelölés végleges, tehát a tartalom örökre elveszett volna.
//
// A Make API `usedPackages` mezője megmutatja, mi van benne valójában:
//   ["gateway"]                          = csak a webhook → NÉMÁN NYEL
//   ["gateway","instagram-business"]     = teljes lánc    → tényleg kimegy
// Ha a kimeneti modul hiányzik, EGYETLEN posztot sem küldünk: a sor sértetlen.
// ===================================================================
const REQUIRED_HINT = 'instagram';

async function findScenario(token) {
  const fixed = (process.env.INSTAGRAM_MAKE_SCENARIO_ID || '').trim();
  if (fixed) return fixed;
  // Nincs megadva azonosító → megkeressük a csapat forgatókönyvei közt azt,
  // amelyik Instagram-modult használ. Így a usernek nem kell ID-t vadásznia.
  try {
    const r = await fetch('https://eu1.make.com/api/v2/scenarios?teamId=2087225', {
      headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return '';
    const list = (await r.json()).scenarios || [];
    const hit = list.find(s => (s.usedPackages || []).some(p => p.includes(REQUIRED_HINT)));
    return hit ? String(hit.id) : '';
  } catch { return ''; }
}

async function scenarioReady() {
  const token = (process.env.MAKE_API_TOKEN || '').trim();
  if (!token) { console.log('   ⚠️  Nincs MAKE_API_TOKEN — a forgatókönyv-ellenőrzés kimarad.\n'); return true; }

  const id = await findScenario(token);
  if (!id) {
    console.log('   ⛔ Nincs Instagram-modult tartalmazó Make-forgatókönyv — nem küldök (a sor sértetlen).');
    console.log('      Létrehozás: eu1.make.com → Create a new scenario → Webhooks: Custom webhook');
    console.log('      → + → Instagram for Business → Create a Photo Post (image→Photo URL, caption→Caption).\n');
    return false;
  }
  try {
    const r = await fetch(`https://eu1.make.com/api/v2/scenarios/${id}`, {
      headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) { console.log(`   ⚠️  Make API HTTP ${r.status} — az ellenőrzés kimarad, küldök.\n`); return true; }
    const s = (await r.json()).scenario || {};
    if (s.isActive === false || s.isPaused === true) {
      console.log(`   ⛔ A Make-forgatókönyv (${id}) INAKTÍV — nem küldök (a sor sértetlen marad).`);
      console.log('      Kapcsold vissza: eu1.make.com → Scenarios → kapcsoló a sor végén.\n');
      return false;
    }
    const pkgs = s.usedPackages || [];
    if (!pkgs.some(p => p.includes(REQUIRED_HINT))) {
      console.log(`   ⛔ A forgatókönyv (${id}) NEM tartalmaz Instagram-modult — csak: [${pkgs.join(', ')}]`);
      console.log('      A webhook 200-at adna, de a poszt SEHOVA nem kerülne ki → nem küldök.\n');
      return false;
    }
    console.log(`   ✅ Make-forgatókönyv rendben (#${id}: ${pkgs.join(', ')})\n`);
    return true;
  } catch { console.log('   ⚠️  A Make-ellenőrzés hibára futott — küldök.\n'); return true; }
}

async function main() {
  console.log('📷 INSTAGRAM POSTER INDUL');
  console.log('─'.repeat(60));

  const hook = (process.env.INSTAGRAM_MAKE_WEBHOOK_URL || '').trim();
  if (!hook) { console.log('   ⏭️  Nincs INSTAGRAM_MAKE_WEBHOOK_URL — kihagyom (a Make-scenario után tedd GitHub Secrets-be).'); return; }
  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }
  if (!(await scenarioReady())) return;

  const info = articleMap();
  const now = Date.now();
  const queue = [];

  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post;
    try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post.posted_ig) continue;                  // már kiment / lezárva
    if (!post.url || !post.title) continue;

    const meta = info[realSlug(post)] || info[post.slug];
    // Ha nincs találat a térképben, NEM dobjuk el — kihagyjuk erre a körre.
    // A néma eldobás visszafordíthatatlan, a várakozás nem. (2026-08-02 lecke:
    // a Facebooknál pont ez tüntetett el 149 posztolható tartalmat.)
    if (!meta) continue;
    if (!meta.isGuide) {
      const age = meta.publishedAt ? (now - new Date(meta.publishedAt).getTime()) : Infinity;
      if (age > NEWS_FRESH_DAYS * 24 * 3600e3) {
        post.posted_ig = 'skipped-stale-news';
        writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        continue;
      }
    }
    queue.push({ path, post, meta });
  }

  if (!queue.length) { console.log('   💤 Nincs kiküldendő tartalom.'); return; }
  // ÚTMUTATÓK elöl (evergreen, örökké érvényes), azon belül legfrissebb előre
  queue.sort((a, b) =>
    (b.meta.isGuide - a.meta.isGuide) ||
    (b.meta.publishedAt || '').localeCompare(a.meta.publishedAt || ''));
  const batch = queue.slice(0, LIMIT);
  console.log(`   📋 Kiküldhető a sorban: ${queue.length} (útmutató elöl) | most: ${batch.length}${DRY ? ' (PRÓBA — nem küldöm)' : ''}\n`);

  let sent = 0, failed = 0, noImage = 0;
  for (const { path, post, meta } of batch) {
    const site = post.url.replace(/(https?:\/\/[^/]+).*/, '$1');
    const slug = realSlug(post);
    // KÉP: az ÁLLÓ (1080x1350) változat az elsődleges — az Instagram
    // hírfolyamában ez tölti ki a képernyőt. Csak ha nincs, esünk vissza a
    // fekvőre. og-default NINCS a végén: kép nélküli poszt itt értelmetlen,
    // és jobb kihagyni, mint egy sablonképpel elhasználni a tartalmat.
    let image = '';
    for (const cand of [`${site}/assets/ig/${slug}.jpg`, `${site}/assets/share/${slug}.jpg`]) {
      try { const h = await fetch(cand, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (h.ok) { image = cand; break; } }
      catch { /* következő jelölt */ }
    }
    if (!image) { noImage++; console.log(`   ⏭️  ${String(post.title).slice(0, 46)} — nincs képe, marad a sorban`); continue; }

    const caption = buildCaption(post, meta.isGuide);
    console.log(`📷 ${meta.isGuide ? '📘' : '📰'} ${String(post.title).slice(0, 52)}...`);
    if (DRY) {
      // A próba a TELJES aláírást mutatja: ennek épp az a célja, hogy küldés
      // előtt lássuk, mi menne ki — egy csonkolt előnézet nem bizonyít semmit.
      console.log(`   kép: ${image.replace(site, '')}`);
      console.log(`   aláírás (${caption.length}/${CAPTION_MAX} karakter):`);
      console.log(caption.split('\n').map(l => '   │ ' + l).join('\n'));
      console.log();
      continue;
    }
    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, caption, title: post.title, link: post.url }),
        signal: AbortSignal.timeout(20000)
      });
      if (r.ok) {
        post.posted_ig = true;
        post.posted_ig_at = new Date().toISOString();
        writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        sent++;
        console.log('   ✅ Kiküldve a Make-nek (→ Instagram)');
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
  console.log(`📊 INSTAGRAM POSTER: ${sent} kiküldve, ${failed} sikertelen${noImage ? `, ${noImage} kép nélkül kihagyva` : ''}, sorban maradt: ${queue.length - batch.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 INSTAGRAM POSTER HIBA:', e); process.exit(1); });
