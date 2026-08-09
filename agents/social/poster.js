// ===================================================================
// SOCIAL POSTER — a megírt posztok TÉNYLEGES kiküldése (Make webhook → FB)
// ===================================================================
//
// A social agent által gyártott content/social/<slug>.json posztokat küldi
// ki a Make.com webhookra, ami a Facebook-oldalra ("AI World HQ") posztol.
// (Make-et azért használjuk, mert a Meta fejlesztői regisztráció SMS/e-mail
// hitelesítése megbízhatatlan volt — a Make a saját Meta-appjával posztol,
// a felhasználó sima FB-belépéssel kötötte össze. 2026-07-05)
//
// SZABÁLYOK:
//   - csak FRISS (7 napon belül publikált) cikk posztja megy ki — a régieket
//     'skipped-stale' jelöléssel lezárjuk (ne árasszuk el az oldalt archívummal)
//   - futásonként legfeljebb --limit (alap 2) poszt — kulturált oldal-tempó
//   - a kiküldöttet posted_fb:true + posted_at jelöli (nem megy ki kétszer)
//   - a webhook URL-je a MAKE_WEBHOOK_URL env-ből (GitHub Secrets / .env) —
//     SOHA nem kerül a repóba
//
// FUTTATÁS:  node agents/social/poster.js [--limit 2] [--dry]
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { selectSocialBatch } from '../../core/social-queue.js';
import { followCta } from '../../core/social-text.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const FRESH_DAYS = 7;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 2 : 2;

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// slug → { published_at, guide } térkép a cikkekből.
//
// A KULCS A RÖGZÍTETT _meta.slug (2026-08-02). Korábban a CÍMBŐL képeztük
// újra a slugot — csakhogy a cikkek 2026-07-27 óta rögzített slugot kapnak,
// és a social-fájlokban maradt egy régi, 60 karakterre CSONKÍTOTT változat.
// Ha a keresés nem talált egyezést, a kor "végtelen" lett, és a posztoló
// AZONNAL elavultnak jelölte — akkor is, ha a cikk aznap jelent meg.
// Mérve: 210 social-fájl slugja nem felelt meg egyetlen élő cikknek sem;
// emiatt 18 FRISS poszt némán elveszett. A slugify-os visszafejtés tehát
// nem csak felesleges, hanem kártékony volt.
// Tartaléknak a címből képzett kulcsot is felvesszük (régi fájlokhoz).
function publishedMap() {
  const map = {};
  if (!existsSync(ARTICLES_DIR)) return map;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');
      const rec = { at: d._meta?.published_at || '', guide: isGuide };
      if (d._meta?.slug) map[d._meta.slug] = rec;
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const legacy = slugify((m && m[1]) || d.original_title || f);
      if (legacy && !map[legacy]) map[legacy] = rec;
    } catch { /* kihagyjuk */ }
  }
  return map;
}

// A social-fájl VALÓDI slugja: elsődlegesen az url-ből, mert az a
// publikált cím — a `slug` mező lehet régi/csonka maradvány.
function realSlug(post) {
  const fromUrl = String(post.url || '').split('/article/')[1];
  return (fromUrl || post.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

async function main() {
  console.log('📤 SOCIAL POSTER INDUL');
  console.log('─'.repeat(60));

  const hook = (process.env.MAKE_WEBHOOK_URL || '').trim();
  if (!hook) { console.log('   ⏭️  Nincs MAKE_WEBHOOK_URL — kihagyom (állítsd be a .env-ben / GitHub Secrets-ben).'); return; }
  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }

  const pub = publishedMap();
  const now = Date.now();
  const queue = [];

  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post;
    try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post.posted_fb) continue;                       // már kiment / lezárva
    if (!post.facebook || !post.url) continue;

    const rec = pub[realSlug(post)] || pub[post.slug];
    const pubAt = rec?.at || '';
    const isGuide = !!rec?.guide;
    // HÍR: csak friss (az archívum ne árassza el az oldalt).
    // ÚTMUTATÓ: EVERGREEN — nincs vágás (2026-08-02). Ugyanaz a szabály,
    // amit a Pinterestnél már 07-29-én bevezettünk; a Facebook oldalán
    // ottfelejtettük, és emiatt 131 évelő útmutató esett ki "elavultként"
    // arról a csatornáról, ami a mérés szerint a forgalmunk zömét hozza.
    // Ha nincs találat a térképben, NEM dobjuk el: inkább kihagyjuk erre a
    // körre. A néma eldobás visszafordíthatatlan, a várakozás nem.
    if (!rec) continue;
    if (!isGuide) {
      const age = pubAt ? (now - new Date(pubAt).getTime()) : Infinity;
      if (age > FRESH_DAYS * 24 * 3600e3) {
        post.posted_fb = 'skipped-stale';
        // A PRÓBA NE ÍRJON (2026-08-02): enélkül a --dry végleges jelölést írt a
        // fájlokba. Ártalmatlanul, de a "próba" azt ígéri, hogy semmi nem történik.
        if (!DRY) writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        continue;
      }
    }
    queue.push({ path, post, pubAt, isGuide });
  }

  if (!queue.length) { console.log('   💤 Nincs kiküldendő friss poszt.'); return; }
  // FRISS TARTALOM ELŐL — DE a helyek fele az örökzöld útmutatóé (2026-08-04).
  // A régi rangsor tisztán kor szerint ment, és mivel napi 12 megosztható
  // tartalom készül 6 hely mellett, a friss sor SOSEM fogyott el: a 7 napnál
  // öregebb útmutató örökre a sor végén maradt (mérve: 156 db). Részletek és
  // a fenntartás logikája: core/social-queue.js.
  const freshCut = now - FRESH_DAYS * 24 * 3600e3;
  for (const x of queue) x.isFresh = !!(x.pubAt && new Date(x.pubAt).getTime() >= freshCut);
  const batch = selectSocialBatch(queue, LIMIT);
  const evergreenWaiting = queue.filter(x => !x.isFresh && x.isGuide).length;
  const nEver = batch.filter(x => !x.isFresh).length;
  console.log(`   📋 Sorban: ${queue.length} (ebből örökzöld útmutató: ${evergreenWaiting}) | most kiküldendő: ${batch.length} (${batch.length - nEver} friss + ${nEver} örökzöld)${DRY ? ' (PRÓBA — nem küldöm)' : ''}\n`);

  let sent = 0, failed = 0;
  for (const { path, post } of batch) {
    // A FB-szövegben benne van az URL — kiszedjük, mert a linket KÜLÖN mezőben
    // küldjük (abból lesz a szép előnézeti kártya; duplán csúnya lenne).
    const message = String(post.facebook).split(post.url).join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    // FOTÓS poszt (user-kérés 2026-07-05: "képet mellékelni, mint a cégek"):
    // a borítóképet KÖZVETLENÜL posztoljuk, a link a caption végére kerül.
    // (A link-kártyás módban a Facebook az új domain képét megbízhatatlanul
    // töltötte be — a fotós poszt mindig nagy, szép képpel jelenik meg.)
    const site = post.url.replace(/(https?:\/\/[^/]+).*/, '$1');
    // Kép-prioritás: 4:5 ÁLLÓ (fb/) → címes fekvő (share/) → sima borító → og-default
    // (mindet a core/share-images.js gyártja build után, 2026-07-08)
    //
    // AZ ÁLLÓ KÉP ELSŐ (2026-08-09): ez FÉNYKÉP-poszt, nem link-előnézet, tehát
    // az arányt mi választjuk. A mobil hírfolyamban a 4:5 kb. kétszer annyi
    // függőleges helyet foglal, mint az 1,91:1 — és a forgalmunk 82%-a mobil.
    // A share/ marad tartaléknak: a 7 napnál régebbi cikkekhez már nem készül
    // új kép, de a régiek megvannak, és az örökzöld útmutatók fenntartott
    // helyen mennek ki (core/social-queue.js) — nekik az images/ a hálójuk.
    let image = `${site}/assets/og-default.jpg`;
    for (const cand of [`${site}/assets/fb/${post.slug}.jpg`, `${site}/assets/share/${post.slug}.jpg`, `${site}/assets/images/${post.slug}.jpg`]) {
      try { const h = await fetch(cand, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (h.ok) { image = cand; break; } }
      catch { /* következő jelölt */ }
    }
    // KÖVETÉSRE HÍVÁS a link UTÁN (2026-08-09). Mérve: 3 követőnk van, de
    // napi ~26 látogatónk a Facebookról — vagyis idegenek látnak minket az
    // ajánlómotoron át, kattintanak, és elmennek. Eddig egyetlen sor sem
    // hívta őket követésre. A hívás a végére kerül, hogy ne tolja el a
    // mondanivalót. Kikapcsolás: core/social-text.js → FOLLOW_CTAS = [].
    const cta = followCta(post.slug);
    const caption = `${message}\n\n👉 ${post.url}${cta ? `\n\n${cta}` : ''}`;
    console.log(`📘 ${String(post.title).slice(0, 55)}...`);
    if (DRY) { console.log(`   (próba) caption: ${caption.slice(0, 70)}…`); continue; }
    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, link: post.url, title: post.title || '', image, caption }),
        signal: AbortSignal.timeout(20000)
      });
      if (r.ok) {
        post.posted_fb = true;
        post.posted_at = new Date().toISOString();
        writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        sent++;
        console.log('   ✅ Kiküldve a Make-nek (→ Facebook)');
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
  console.log(`📊 SOCIAL POSTER: ${sent} kiküldve, ${failed} sikertelen, sorban maradt: ${queue.length - batch.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 POSTER HIBA:', e); process.exit(1); });
