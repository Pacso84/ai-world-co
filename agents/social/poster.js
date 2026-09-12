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
import { followCta, stripUrl } from '../../core/social-text.js';
import { postsPerRun, usedThisMonth, MONTHLY_CAP } from '../../core/make-budget.js';
// A SOR KÖZÖS DÖNTÉSE (2026-09-12): melyik poszt melyik élő cikkhez tartozik,
// és friss-e. Ugyanez a buffer-poster.js-ben is kellett, és KARAKTERRE
// lemásolva élt a két fájlban — semmi nem tartotta szinkronban. Most egy
// példány van: core/social-published.js (teszt + bekötés-őr mellette).
import { isArticleFile, buildPublishedMap, queueStatus } from '../../core/social-published.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 2 : 2;

// ===================================================================
// MŰVELET-ŐR (2026-08-10) — a keret ne fusson ki a hónap végén
// ===================================================================
// A Make ingyenes csomagja havi 1000 műveletet ad, egy poszt hármat visz.
// Ha a keret betelik, a Make nem futtatja a forgatókönyvet — a webhook ettől
// még 200-at ad, mi "kiküldve"-nek jelöljük a posztot, és soha nem próbáljuk
// újra. Nem lassulás lenne, hanem NÉMA VESZTESÉG.
//
// 🎬 A KERET A FIÓKÉ, NEM A FORGATÓKÖNYVÉ (2026-08-30). Ez a függvény
// korábban CSAK a Facebook-fotó forgatókönyvét (6452490) összegezte. A
// Facebook Reel 2026-08-25 óta a 7066389-esen fut, és naponta 2 műveletet
// vesz el UGYANABBÓL az 1000-ből — vagyis havi ~60 művelet hiányzott a
// számításból. A core/reel-post.js fejléce ezt előre leírta, csak a
// bekötéskor maradt el.
//
// A lekérdezés + összegzés ÁTKÖLTÖZÖTT a core/make-budget.js-be
// (`usedThisMonth`, `SHARED_SCENARIOS`) — ott TESZTELHETŐ mock fetch-csel,
// itt nem volt az. A forgatókönyv-azonosítók is ott élnek, egy helyen:
// egy kimásolt szám matematikai biztonsággal csúszik szét.
//
// A viselkedés változatlan: ha az adat nem jön, NEM fékezünk — egy API-hiba
// miatti visszavétel biztos kár, a kifutás bizonytalan és hó végi.

// A cikkek BEOLVASÁSA — csak a fájlművelet él itt. A slug → { at, guide }
// térkép felépítése (a RÖGZÍTETT _meta.slug a kulcs, 2026-08-02; a 18 némán
// elveszett friss poszt története) a core/social-published.js-ben van.
// Olvashatatlan fájl: kihagyjuk (mint eddig).
function loadArticles() {
  const out = [];
  if (!existsSync(ARTICLES_DIR)) return out;
  for (const file of readdirSync(ARTICLES_DIR).filter(isArticleFile)) {
    try { out.push({ file, data: JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')) }); }
    catch { /* kihagyjuk */ }
  }
  return out;
}

async function main() {
  console.log('📤 SOCIAL POSTER INDUL');
  console.log('─'.repeat(60));

  const hook = (process.env.MAKE_WEBHOOK_URL || '').trim();
  if (!hook) { console.log('   ⏭️  Nincs MAKE_WEBHOOK_URL — kihagyom (állítsd be a .env-ben / GitHub Secrets-ben).'); return; }
  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }

  const pub = buildPublishedMap(loadArticles());
  const now = Date.now();
  const queue = [];

  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post;
    try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post.posted_fb) continue;                       // már kiment / lezárva
    if (!post.facebook || !post.url) continue;

    // HÍR: csak friss (az archívum ne árassza el az oldalt).
    // ÚTMUTATÓ: EVERGREEN — nincs vágás (2026-08-02). Ugyanaz a szabály,
    // amit a Pinterestnél már 07-29-én bevezettünk; a Facebook oldalán
    // ottfelejtettük, és emiatt 131 évelő útmutató esett ki "elavultként"
    // arról a csatornáról, ami a mérés szerint a forgalmunk zömét hozza.
    // Ha nincs találat a térképben (null), NEM dobjuk el: inkább kihagyjuk erre
    // a körre. A néma eldobás visszafordíthatatlan, a várakozás nem.
    const st = queueStatus(pub, post, now);
    if (!st) continue;
    if (st.stale) {
      post.posted_fb = 'skipped-stale';
      // A PRÓBA NE ÍRJON (2026-08-02): enélkül a --dry végleges jelölést írt a
      // fájlokba. Ártalmatlanul, de a "próba" azt ígéri, hogy semmi nem történik.
      if (!DRY) writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
      continue;
    }
    // FRISS TARTALOM ELŐL — DE a helyek fele az örökzöld útmutatóé (2026-08-04).
    // A régi rangsor tisztán kor szerint ment, és mivel napi 12 megosztható
    // tartalom készül 6 hely mellett, a friss sor SOSEM fogyott el: a 7 napnál
    // öregebb útmutató örökre a sor végén maradt (mérve: 156 db). Részletek és
    // a fenntartás logikája: core/social-queue.js. Az `isFresh` a közös
    // modulból jön — ugyanaz a vágás, mint a Buffer-csatornákon.
    queue.push({ path, post, pubAt: st.pubAt, isGuide: st.isGuide, isFresh: st.isFresh });
  }

  if (!queue.length) { console.log('   💤 Nincs kiküldendő friss poszt.'); return; }

  // MŰVELET-ŐR: a havi Make-keret vetítése alapján visszaveszünk, ha kifutnánk.
  // MINDEN forgatókönyv beleszámít, ami ugyanebből a fiók-keretből eszik:
  // a Facebook-poszt ÉS a Facebook Reel (core/make-budget.js → SHARED_SCENARIOS).
  const MA = new Date().toISOString().slice(0, 10);
  const elhasznalt = DRY ? null : await usedThisMonth({ token: process.env.MAKE_API_TOKEN, day: MA });
  const limit = postsPerRun({ used: elhasznalt, day: MA, defaultLimit: LIMIT });
  if (limit !== LIMIT) {
    console.log(elhasznalt === null
      ? `   ⚙️  Make-keret: ismeretlen — maradok a teljes tempón (${LIMIT})`
      : `   🚦 Make-keret (FB-poszt + Reel): ${elhasznalt}/${MONTHLY_CAP} elhasználva ebben a hónapban → ${LIMIT} helyett ${limit} poszt megy ki`);
  }
  if (limit === 0) {
    console.log('   ⛔ A havi Make-keret elfogyott — NEM küldök, mert a poszt némán elveszne.');
    return;
  }
  const batch = selectSocialBatch(queue, limit);
  const evergreenWaiting = queue.filter(x => !x.isFresh && x.isGuide).length;
  const nEver = batch.filter(x => !x.isFresh).length;
  console.log(`   📋 Sorban: ${queue.length} (ebből örökzöld útmutató: ${evergreenWaiting}) | most kiküldendő: ${batch.length} (${batch.length - nEver} friss + ${nEver} örökzöld)${DRY ? ' (PRÓBA — nem küldöm)' : ''}\n`);

  let sent = 0, failed = 0;
  for (const { path, post } of batch) {
    // A FB-szövegben benne van az URL — kiszedjük, mert a linket KÜLÖN mezőben
    // küldjük (abból lesz a szép előnézeti kártya; duplán csúnya lenne).
    // A szabály EGY példányban él: core/social-text.js → stripUrl() (2026-09-12;
    // eddig itt beírt másolata volt — 974 valódi poszton mérve azonos kimenet).
    const message = stripUrl(post.facebook, post.url);
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
