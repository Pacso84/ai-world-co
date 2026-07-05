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

// slug → published_at térkép a cikkekből (a frissesség-szűréshez)
function publishedMap() {
  const map = {};
  if (!existsSync(ARTICLES_DIR)) return map;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const slug = slugify((m && m[1]) || d.original_title || f);
      map[slug] = d._meta?.published_at || '';
    } catch { /* kihagyjuk */ }
  }
  return map;
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

    const pubAt = pub[post.slug] || '';
    const age = pubAt ? (now - new Date(pubAt).getTime()) : Infinity;
    if (age > FRESH_DAYS * 24 * 3600e3) {
      // Régi cikk: lezárjuk, hogy sose árassza el az oldalt az archívum
      post.posted_fb = 'skipped-stale';
      writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
      continue;
    }
    queue.push({ path, post, pubAt });
  }

  if (!queue.length) { console.log('   💤 Nincs kiküldendő friss poszt.'); return; }
  queue.sort((a, b) => (b.pubAt || '').localeCompare(a.pubAt || ''));   // legfrissebb előre
  const batch = queue.slice(0, LIMIT);
  console.log(`   📋 Friss poszt a sorban: ${queue.length} | most kiküldendő: ${batch.length}${DRY ? ' (PRÓBA — nem küldöm)' : ''}\n`);

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
    const imgUrl = `${site}/assets/images/${post.slug}.jpg`;
    let image = imgUrl;
    try { const h = await fetch(imgUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) }); if (!h.ok) image = `${site}/assets/og-default.jpg`; }
    catch { image = `${site}/assets/og-default.jpg`; }
    const caption = `${message}\n\n👉 ${post.url}`;
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
