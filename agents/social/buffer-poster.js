// ===================================================================
// BUFFER-POSZTER — X · Threads · TikTok (2026-08-14; TikTok 2026-10-07, az Instagram helyén)
// ===================================================================
//
// MIÉRT BUFFER, ÉS NEM A MAKE: a Facebookot a Make.com küldi, aminek havi
// 1000 művelet az INGYENES kerete, és egy poszt 3 műveletbe kerül. Emiatt
// esett ki a Pinterest, és emiatt fékez most a művelet-őr 9→6 posztra.
// A Buffernek SAJÁT, KÜLÖN ingyenes kerete van (250 kérés/nap, 3 csatorna),
// tehát az új csatornák NEM szorítják ki a Facebookot. Ez a lényegi
// különbség a Pinteresthez képest.
//
// MIÉRT NEM AZ X SAJÁT API-JA: fizetős — egy linkes poszt $0,200, napi 9
// poszt = $56/hó, a teljes havi keretünk ($25) kétszerese. Bufferen át $0.
//
// ── A GRAPHQL API (a hálózati réteg: core/buffer-api.js) ─────────────
// A Buffer saját dokumentációja szerint (developers.buffer.com):
//     POST https://api.buffer.com
//     Authorization: Bearer <API_KEY>
// A kulcs a https://publish.buffer.com/settings/api oldalon készül.
//
// ⚠️ A RÉGI REST API (`api.bufferapp.com/1/`) MÁR NEM ÉRINT MINKET: erre a
// GraphQL API-ra 2026-08-14-én álltunk át. A Buffer a régit 2027-02-01-én
// nyugdíjazza — nálunk egyetlen `bufferapp` hivatkozás sincs.
//
// ── A TOKEN LEJÁRHAT, ÉS EZ A LEGGYAKORIBB LEÁLLÁS ───────────────────
// 2026-09-16-án élesben ez jött a csatorna-lekérdezésre:
//     {"errors":[{"message":"Access token is not valid"}]}
// Ilyenkor a poszter NEM hibázik el némán: a `core/buffer-guard.js`
// CSATORNA_LEKERDEZES_BUKOTT leletet tesz a memory/buffer-guard.json-ba, és a
// napi riport kiírja. A megoldás egy ÚJ API-kulcs a fenti oldalról, a
// BUFFER_ACCESS_TOKEN titokba (GitHub → Settings → Secrets → Actions).
//
// FUTTATÁS:
//   node agents/social/buffer-poster.js --verify   -- séma-ellenőrzés (nem posztol)
//   node agents/social/buffer-poster.js --channels -- a bekötött csatornák + azonosítóik
//   node agents/social/buffer-poster.js --dry      -- mit küldenénk (token nélkül is)
//   node agents/social/buffer-poster.js            -- éles
// ===================================================================

import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { selectSocialBatch } from '../../core/social-queue.js';
import { composePost, followCta, CHANNELS } from '../../core/social-text.js';
// A SOR KÖZÖS DÖNTÉSE (2026-09-12) — ugyanaz, mint a Facebook-poszterben.
// Eddig karakterre lemásolva élt itt; most egy példány: core/social-published.js.
import { isArticleFile, buildPublishedMap, queueStatus, realSlug } from '../../core/social-published.js';
import { capFor, allowedNow, countSentToday, countTodayWithQueued, figyelendoCsatornak } from '../../core/channel-cap.js';
import { videoCsatornaMai } from '../../core/reel-queue.js';
// 2026-10-15 (user): a TikTokra a Facebookra kiment cikkek FOTÓ-posztként is mennek (napi max 3),
// a Threads pedig a napi videókat is megkapja. A döntés a core-ban (tesztelhető): core/tiktok-foto.js.
import { tiktokFotoSor, fotoKeret, maiMarkaDb, fotoLepes } from '../../core/tiktok-foto.js';
// 2026-10-15 (review I2): a jelölés MINDIG a friss fájlba megy (a tételek ugyanannak a fájlnak külön parse-jai).
import { jelolMezo } from '../../core/social-mark.js';
// ⚠️ AZ ŐRSZEM (2026-08-30). Enélkül ez a modul NÉMÁN áll le: lejárt token,
// levált csatorna vagy bukott createPost esetén csak a CI naplójába írt,
// ahová senki nem néz — és a fájl végi `catch` még 0-val is lépett ki, tehát
// a GitHub Actions is zöld pipát adott. A döntés-logika azért van a `core/`
// alatt, mert EZ A FÁJL NEM IMPORTÁLHATÓ (valódi posztot küldene), tehát
// tesztelni sem lehet. Lásd: core/buffer-guard.js + core/buffer-guard.test.js.
import { futtatBuffer } from '../../core/buffer-guard.js';
// ⚠️ A HÁLÓZATI RÉTEG IS KIKÖLTÖZÖTT (2026-09-16), ugyanabból az okból: ami
// ebben a fájlban lakik, az TESZTELHETETLEN. A Buffer-hívások — köztük a
// „HTTP 200 ≠ siker" döntés — most a core/buffer-api.js-ben vannak, injektált
// `fetch`-csel, teszt alatt: core/buffer-api.test.js.
import {
  BUFFER_ENDPOINT, REEL_CSEMPE_MS,
  bufferGql, lekerSzervezet, lekerCsatornak, lekerPosztok, createPost as createPostApi
} from '../../core/buffer-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
// A csatornánkénti napi plafon innen jön (limits.social_daily_caps).
// Hiányzó/hibás fájl NEM állítja meg a posztolást: plafon nélkül megy tovább.
const CONFIG = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')); }
  catch { return {}; }
})();
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const SITE = 'https://aiworldhq.com';

// A Buffer ingyenes kerete: 250 kérés/nap, 3000/30 nap, 3 csatorna.
// Nekünk 3 csatorna × 9 poszt = 27 kérés/nap kell — a keret KILENCSZERESE
// áll rendelkezésre. Ezért itt NINCS művelet-őr (a Make-nél azért van, mert
// ott a keret tényleg szűk). Ha valaha 80 poszt/nap fölé mennénk, SZÁMOLJ ÚJRA.
const NAPI_KERET = 250;

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const VERIFY = args.includes('--verify');
const LIST_CHANNELS = args.includes('--channels');
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 3 : 3;
// Egyetlen csatornára szűkítés — az ELSŐ ÉLES próbához kell: előbb egy poszt
// egy csatornára, kézzel ellenőrizve, csak utána a többi.
const oi = args.indexOf('--only');
const ONLY = oi !== -1 && args[oi + 1] ? String(args[oi + 1]).toLowerCase() : null;

// ⚠️ CSAK A TELJES, ÉLES FUTÁS ÍRJA AZ ŐRSZEM-FÁJLT. Egy helyi `--dry` vagy
// `--only threads` futás különben friss `at`-ot és üres `problems`-et hagyna a
// memory/buffer-guard.json-ban — vagyis épp azt hazudná a napi riportnak, hogy
// az éles poszter rendben lefutott. (Ugyanaz a csapda, mint a magyar
// helyesírás-őrnél: 773 cikkből 12-t nézett, és „0 hibát" jelentett.)
const ELES = !DRY && !VERIFY && !LIST_CHANNELS && !ONLY;

const token = () => (process.env.BUFFER_ACCESS_TOKEN || '').trim();

// ---------- GraphQL ----------
// A hívás maga a core/buffer-api.js-ben; itt már csak a tokent adjuk hozzá.
// Token nélkül a réteg el sem indítja a kérést — „alszik, nem hibázik".
const api = () => ({ token: token() });
const gql = (query, variables = {}) => bufferGql(query, variables, api());

// ---------- 1. SÉMA-ELLENŐRZÉS ----------
// Ez a lépés váltja ki a találgatást. Introspekcióval megkérdezzük a Buffert,
// milyen mezőket vár valójában, és kiírjuk. Ha eltér attól, amit küldeni
// akarunk, ITT derül ki — nem egy néma, elveszett posztnál.
async function verifySchema() {
  console.log('🔬 BUFFER SÉMA-ELLENŐRZÉS');
  console.log('   végpont: ' + BUFFER_ENDPOINT);
  const r = await gql(`{
    __type(name: "Mutation") { fields { name args { name type { name kind ofType { name kind } } } } }
  }`);
  if (r.error) { console.log('   ❌ ' + r.error); return false; }

  const fields = r.data?.__type?.fields || [];
  console.log(`   a Mutation ${fields.length} műveletet kínál`);
  const post = fields.filter(f => /post|update|draft/i.test(f.name));
  if (!post.length) { console.log('   ⚠️ nincs poszt-jellegű mutáció — a séma MÁS, mint amire számítottunk'); return false; }
  for (const f of post) {
    console.log(`   • ${f.name}(${f.args.map(a => a.name).join(', ')})`);
  }
  console.log('\n   👉 Ha a fenti NEM tartalmaz "createPost"-ot, szólj — átírom arra, ami van.');
  return true;
}

// ---------- 2. A BEKÖTÖTT CSATORNÁK ----------
// A Buffer csatorna-AZONOSÍTÓval dolgozik, nem névvel. Ez listázza ki őket,
// hogy a .env-be tehessük — így a poszter nem függ attól, hány csatorna van
// bekötve (most 2, az X után 3).
// ⚠️ A csatorna-lekérdezés KÖTELEZŐEN kér szervezet-azonosítót, és az
// `account.currentOrganization` út FORBIDDEN ezzel a tokennel — az
// `account.organizations` viszont működik. (Mindkettőt élesben mértem.)
const orgId = () => lekerSzervezet(api());

// Hány poszt ment MA ki erre a csatornára — a BUFFERTŐL kérdezve, nem a
// saját jelölésünkből. Ugyanez a lecke 2026-08-06-ról: a napi riport
// „Facebook-poszt: N" sora a saját jelölésünkből jött és torzított; azóta a
// Make naplójából megy. A láncot a VÉGÉRŐL kell mérni.
//
// ⚠️ HIBÁNÁL `null` JÖN VISSZA, NEM 0. A kettő különböző: a 0 azt jelenti,
// „ma még nem ment ki semmi" (mehet a poszt), a null azt, hogy „nem tudom".
// Az allowedNow() a null-ra bezár. Ha a hibát 0-nak adnánk, a plafon némán
// kikapcsolna — pont az a néma hiba, ami ellen az egész modul készült.
//
// A `filter.channelIds` alak ÉLESBEN MÉRVE (2026-08-24): a `channelIds`
// NEM a PostsInput gyökerében van, hanem a `filter` alatt (a gyökérbe téve
// „Field channelIds is not defined by type PostsInput" jön).
//
// ⚠️ ISMERT KORLÁT: a Buffer lapozva válaszol, mérve 10 posztot ad vissza,
// LEGÚJABB ELÖL (2026-08-24: 08-24-ről 6, 08-23-ról 4). Ha egy csatornán egy
// nap 10-nél több poszt menne ki, a mai darabszám alulmérne. A napi plafonos
// csatornákon ez nem fordulhat elő (épp azért van plafon), a plafon nélkülieket
// pedig le sem kérdezzük. A hiba IRÁNYA is szelíd: alulmérésből több poszt
// menne ki, nem kevesebb — tehát nem némít el némán semmit. Ha valaha 10 fölé
// emelnénk egy plafont, ITT kell lapozást írni.
async function sentTodayFor(organizationId, channelId) {
  const r = await lekerPosztok({ organizationId, channelId }, api());
  if (r.error) return null;
  return countSentToday(r.nodes);
}

// A RIPORT mai TikTok-száma (2026-10-15): az elküldöttek + a most feladott, még küldés alatt
// állók. Enélkül a futás végén a friss poszt még nem „sent", és a riport hamis ⚠️-t írt (2/3).
async function maiTiktokDb(organizationId, channelId) {
  const r = await lekerPosztok({ organizationId, channelId }, api());
  if (r.error) return null;
  return countTodayWithQueued(r.nodes);
}

// ── AZ ŐRSZEM NYERSANYAGA (2026-08-30) ──────────────────────────────
// A `listChannels()` eddig NÉMÁN kiszűrte a levált/zárolt csatornákat, és
// hibánál csak `null`-t adott. Kívülről tehát a „leesett az Instagram" és a
// „ma nem volt mit posztolni" EGYFORMÁN nézett ki. A szűretlen listát és a
// hiba OKÁT ezért félretesszük — a napi riport ebből tudja meg, mi történt.
let NYERS_CSATORNAK = null;   // a Buffer válasza, SZŰRÉS ELŐTT
let CSATORNA_HIBA = null;     // miért nem jött meg (a Buffer saját üzenete)

async function listChannels() {
  const o = await orgId();
  if (o.error) { CSATORNA_HIBA = o.error; console.log('   ❌ ' + o.error); return null; }
  const r = await lekerCsatornak(o.id, api());
  if (r.error) { CSATORNA_HIBA = r.error; console.log('   ❌ ' + r.error); return null; }
  NYERS_CSATORNAK = r.csatornak || [];
  const ch = NYERS_CSATORNAK.filter(c => !c.isDisconnected && !c.isLocked);
  console.log('📡 BEKÖTÖTT CSATORNÁK');
  if (!ch.length) { console.log('   ⚠️ egy használható csatorna sincs'); return []; }
  for (const c of ch) console.log(`   ${String(c.service).padEnd(11)} ${c.name || '?'}   id: ${c.id}`);
  return ch.map(c => ({ ...c, serviceUsername: c.name }));
}

// A Buffer `service` neve → a mi csatorna-kulcsunk a social-text.js-ben.
// (A Reel-csempe pillanatát — REEL_CSEMPE_MS — a core/buffer-api.js adja: ott
// van a poszt bemenete is, ami ténylegesen elküldi.)
const SERVICE_MAP = { twitter: 'x', x: 'x', threads: 'threads', tiktok: 'tiktok' };   // Instagram: kivezetve 2026-10-07

// ---------- 3. A SOR (ugyanaz a rangsor, mint a Facebooknál) ----------
// Itt csak a fájl-olvasás él. A térkép, a `realSlug` és a frissesség-vágás a
// core/social-published.js-ben — UGYANAZ a példány, amit a poster.js hív.
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

/**
 * A még ki nem küldött posztok EGY csatornára.
 * A `field` (posted_x / posted_threads / posted_tiktok) csatornánként
 * KÜLÖN — ugyanaz a cikk mindhármon kimehet, de mindegyiken csak egyszer.
 */
function queueFor(field, pub, now) {
  const out = [];
  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post; try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post[field]) continue;                       // erre a csatornára már kiment
    if (!post.facebook || !post.url) continue;       // a szöveg a `facebook` mezőben van

    const st = queueStatus(pub, post, now);
    if (!st) continue;                               // nincs találat → VÁRUNK, nem dobunk
    // HÍR: csak friss. ÚTMUTATÓ: örökzöld (ugyanaz a szabály, mint a Facebooknál).
    if (st.stale) {
      post[field] = 'skipped-stale';
      if (!DRY) jelolMezo(path, field, 'skipped-stale', { fallback: post });
      continue;
    }
    out.push({ path, post, pubAt: st.pubAt, isGuide: st.isGuide, isFresh: st.isFresh });
  }
  return out;
}

/**
 * A TikTok FOTÓ-posztok nyersanyaga (2026-10-15): az ÖSSZES közösségi bejegyzés a cikk korával.
 * NEM ír semmit (a queueFor 'skipped-stale' jelölést tenne száz fájlra — ide az nem kell), és a
 * kiválasztás (FB-n kint, friss, nincs TikTok-videó/-fotó, napi max) a core/tiktok-foto.js dolga.
 */
function fotoNyersanyag(pub, now) {
  const out = [];
  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post; try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (!post.facebook || !post.url) continue;
    const st = queueStatus(pub, post, now);
    out.push({ path, post, pubAt: st ? st.pubAt : '', isGuide: !!st?.isGuide, isFresh: !!st?.isFresh });
  }
  return out;
}

// A 4:5 álló borítókép — ugyanaz, amit a Facebook kap (Threads/X/TikTok-fotó; a TikTok videót is kap).
const imageUrl = slug => `${SITE}/assets/fb/${slug}.jpg`;
// 🧵 THREADS-MÉRÉS (2026-10-22): a Threads-app nem küld hivatkozót → a link jelölve (?src=th); a honlap
// middleware-je ebből számol (functions/_middleware.js → Worker /src-hit → napi riport).
const forrasJel = (u, s) => { try { const x = new URL(u); x.searchParams.set('src', s); return x.toString(); } catch { return u; } };

// ⚠️ A KÉP NEM MINDIG VAN MEG (2026-08-14, mérve: 18 sorban álló posztból 17-nek
// volt képe, egynek NEM). Az (akkori) Instagram KÖTELEZŐEN képet követelt —
// kép nélkül ott a poszt elbukott volna, homályos API-hibával.
// Az X és a Threads viszont kép nélkül is elmegy.
// A képek a build UTÁN készülnek (core/share-images.js), tehát helyben nincsenek
// meg — az ÉLES címet kell megnézni, azt tölti le a Buffer is.
const kepCache = new Map();
async function imageExists(url) {
  if (kepCache.has(url)) return kepCache.get(url);
  let ok = false;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12000) });
    ok = r.status === 200;
  } catch { ok = false; }        // hálózati hiba: inkább kihagyjuk, mint hibás posztot küldjünk
  kepCache.set(url, ok);
  return ok;
}

// ---------- 4. A POSZTOLÁS ----------
// A séma ÉLESBEN LEKÉRDEZVE (2026-08-14) — az első tippem HÁROM ponton tévedett
// volna, és a poszt elbukott volna:
//    tippem: channelIds:[id]      valóság: channelId (EGYES SZÁM), kötelező
//    tippem: assets opcionális    valóság: assets KÖTELEZŐ
//    tippem: —                    valóság: mode + needsApproval +
//                                          schedulingType MIND kötelező
// Az értékkészletek is a szerverről:
//    ShareMode      = addToQueue | customScheduled | shareNext | shareNow
//    SchedulingType = automatic | notification
// A `notification` az a kézi-tolós mód, amit nem-profi Instagram-fióknál
// kapnánk; nekünk `automatic` kell — a fiók `business` típusú, tehát mehet.
// ⚠️ A VÁLASZ UNIÓ TÍPUS (PostActionPayload) — és ez élesben MEGVEZETETT:
// az első változatom csak `__typename`-et kért, és mivel GraphQL-szintű hiba
// nem jött, MINDEN variánst sikernek vett. A Threadsnél véletlenül igaz volt,
// az Instagramnál viszont a poszt LÉTRE SEM JÖTT, miközben a naplóm ✅-t írt.
// Variánsok: PostActionSuccess | NotFoundError | UnauthorizedError |
//            UnexpectedError | RestProxyError | LimitReachedError |
//            InvalidInputError
// Ezért MINDEGYIKET lekérdezzük, és csak a Success számít sikernek.
// ===================================================================
// A MAI VIDEÓK — a videós csatorna (TikTok) sora
// ===================================================================
//
// A Facebook-Reel lánc (core/reel-queue.js + core/reel-post.js) naponta
// KÉT útmutatóból gyárt videót (két külön CI-futásban), és a cikk
// `_meta.reel_at` mezőjét ma-i időbélyeggel jelöli meg. Ugyanez a fájl megy
// ki a TikTokra is, plusz gyártás nélkül (2026-10-07; 08-25 és 10-07 között
// az Instagram kapta — az a csatorna kivezetve).
//
// A döntés (mai-e, ment-e már ide, van-e saját szövege) a TESZTELT
// core/reel-queue.js `videoCsatornaMai()`-ban él — ez a fájl nem importálható.
//
// ⚠️ A CÍMET LE IS ELLENŐRIZZÜK. A Buffer a saját szerveréről tölti le a
// videót. Ha a deploy elhasalt volna, a fájl nem lenne kint — és ezt élesben
// már megtanultuk (2026-08-23: háromszor küldtünk ki egy 404-es videó-címet,
// háromszor 422 jött vissza).
//
// ⚠️ CSEMPE-KERESÉS ITT NINCS, ÉS EZ SZÁNDÉKOS (2026-08-27): a Buffer a
// `thumbnailUrl`-t ELUTASÍTJA („social networks do not accept custom video
// thumbnail images…"). A csempe a videó egy PILLANATA (thumbnailOffset).
//
// BÁRMILYEN hiba → üres lista: a videós csatorna aznap kimarad, a többi
// csatorna posztolását nem akadályozza.
async function maiVideok(field, cikkLista) {
  try {
    const { reelVideoUrl, varjVideora } = await import('../../core/reel-post.js');
    // 2026-10-11: + a napi csak-TikTok videó (tiktok_video_at, core/reel-post.js prepareTiktokExtra).
    const cikkek = cikkLista.map(({ data }) => ({ slug: data?._meta?.slug || '', reel_at: data?._meta?.reel_at || '',
      tiktok_video_at: data?._meta?.tiktok_video_at || '' }));
    const postOf = slug => {
      const sp = join(SOCIAL_DIR, slug + '.json');
      if (!existsSync(sp)) { console.log(`   ⚠️ ${slug.slice(0, 40)} — a mai Reel cikkéhez nincs poszt-szöveg`); return null; }
      try { return JSON.parse(readFileSync(sp, 'utf-8')); } catch { return null; }
    };
    const ki = [];
    for (const { slug, post } of videoCsatornaMai(cikkek, postOf, field)) {
      const video = reelVideoUrl(slug);
      // 2026-10-12: újrapróba + lecsengés (a friss deploy után a Cloudflare nem azonnal adja mindenhonnan).
      const h = await varjVideora(video);
      if (!h.ok) { console.log(`   ⚠️ ${slug.slice(0, 40)} — a videó nincs kint (HTTP ${h.status || '—'})`); continue; }
      ki.push({ path: join(SOCIAL_DIR, slug + '.json'), post, video });
    }
    return ki;
  } catch (e) {
    console.log('   ⚠️ a mai videók listája nem állt össze — ' + String(e.message).slice(0, 80));
    return [];
  }
}

// A poszt-küldés ÉS a válasz értékelése a core/buffer-api.js-ben lakik —
// ott áll teszt alatt, hogy a HTTP 200-ban érkező hibaüzenet (MutationError)
// HIBÁNAK számít, nem sikernek. Itt már csak a tokent adjuk hozzá.
const createPost = args => createPostApi(args, api());
// A Buffer „még nem érem el a videót" hibája (10-13 élesben) — erre van értelme újrapróbálni.
const VIDEO_NEM_OLVASHATO = /could not be read from its URL/i;

async function main() {
  console.log('📤 BUFFER-POSZTER (X · Threads · TikTok)');
  console.log('─'.repeat(60));

  // ⚠️ A VISSZATÉRÉSI ÉRTÉK NEM DÍSZ: ebből épül a memory/buffer-guard.json,
  // amit a napi riport olvas. MINDEN kilépési ág mondja meg, mi történt —
  // különben a néma visszafordulás megint láthatatlan marad.
  const hibak = [];
  const alapAllapot = () => ({ tokenVan: !!token(), socialMappa: true, csatornaLekerdezes: 'kihagyva', hibak, kikuldve: 0, keres: 0 });

  if (VERIFY) { await verifySchema(); return null; }
  if (LIST_CHANNELS) { await listChannels(); return null; }

  if (!existsSync(SOCIAL_DIR)) {
    console.log('   💤 Nincs social mappa.');
    return { ...alapAllapot(), socialMappa: false };
  }

  // Melyik csatornákra dolgozunk? Élesben a Buffertől kérdezzük (így az X
  // bekötése után magától bővül); próbában mind a hármat mutatjuk.
  let channels;   // eslint-disable-line prefer-const
  if (!token()) {
    // Token nélkül nincs mit lekérdezni — a beépített lista csak a szöveg
    // formázását mutatja meg.
    channels = Object.keys(CHANNELS).map(k => ({ key: k, id: `(próba-${k})`, user: '?' }));
    console.log('   🧪 PRÓBA — nincs token, csak a szövegformázást mutatom');
  } else if (DRY) {
    // ⚠️ PRÓBÁBAN IS A VALÓDI CSATORNÁKAT kérdezzük le. Az első változat a
    // beépített listát mutatta, és ezért mind a HÁRMAT kiírta, pedig csak
    // kettő van bekötve — egy próba, ami nem a valóságot mutatja, félrevezet.
    const list = await listChannels();
    channels = (list || [])
      .map(c => ({ key: SERVICE_MAP[String(c.service).toLowerCase()], id: c.id, user: c.serviceUsername }))
      .filter(c => c.key && CHANNELS[c.key]);
    console.log('   🧪 PRÓBA — nincs kiküldés');
  } else {
    const list = await listChannels();
    if (!list) {
      // ⚠️ ITT ÁLL LE A LEJÁRT TOKEN. Eddig ez egy sor volt a CI-naplóban, és
      // a folyamat 0-val lépett ki — a Threads és az Instagram napokig
      // hallgathatott volna anélkül, hogy bárki megtudja.
      console.log('   ⏭️  A csatornákat nem sikerült lekérdezni — kihagyom.');
      return { ...alapAllapot(), csatornaLekerdezes: 'bukott', csatornaHiba: CSATORNA_HIBA };
    }
    channels = list
      .map(c => ({ key: SERVICE_MAP[String(c.service).toLowerCase()], id: c.id, user: c.serviceUsername }))
      .filter(c => c.key && CHANNELS[c.key]);
    if (!channels.length) {
      console.log('   ⚠️ egyik bekötött csatornát sem ismerem.');
      return { ...alapAllapot(), csatornaLekerdezes: 'ok', csatornak: figyelendoCsatornak(NYERS_CSATORNAK, CONFIG, SERVICE_MAP), ismertCsatornak: [] };
    }
  }

  if (ONLY) {
    channels = channels.filter(c => c.key === ONLY);
    console.log(`   🎯 csak a(z) ${ONLY} csatorna`);
    if (!channels.length) { console.log('   ⚠️ ilyen bekötött csatorna nincs.'); return null; }
  }

  // A napi plafonhoz kell a szervezet-azonosító — de CSAK akkor kérjük le,
  // ha van egyáltalán plafonos csatorna. Fölösleges kérés nem terheli a
  // napi 250-es Buffer-keretet.
  let ORG = null;
  if (token() && channels.some(c => capFor(CONFIG, c.key) !== null)) {
    const o = await orgId();
    if (o.error) console.log('   ⚠️ a szervezet-azonosító nem jött meg — a plafonos csatornák kimaradnak');
    else ORG = o.id;
  }

  const cikkLista = loadArticles();
  const pub = buildPublishedMap(cikkLista);
  const now = Date.now();
  let kikuldve = 0, keres = 0;

  for (const ch of channels) {
    const cfg = CHANNELS[ch.key];
    // ── VIDEÓS CSATORNA (TikTok, 2026-10-07): a VIDEÓS sorba a mai Reel megy ──
    // (2026-10-11 óta + a napi 1 csak-TikTok videó — core/reel-queue.js tiktokExtra)
    // (2026-10-15 óta a videók UTÁN a Facebookra kiment friss cikkek FOTÓ-posztként is,
    // napi max 3 — lent, a core/tiktok-foto.js döntése szerint.)
    // A videós sora NEM a közösségi sor: azon a queueFor() a régi híreket
    // 'skipped-stale'-lel jelölné — száz fájl írása egy olyan csatornára,
    // ahová a link-poszt amúgy sem mehet.
    //
    // ⚠️ NEM A SORBÓL VETT SZÖVEGHEZ RAGASZTJUK A VIDEÓT (2026-08-25-i lecke:
    // a próbán a szöveg és a videó két különböző cikkről szólt). A videó a
    // SAJÁT cikkének kész közösségi szövegével megy, és az kapja a jelölést.
    //
    // Ha egy nap nincs Reel (elfogytak az útmutatók, hibázott a gyártás), a
    // TikTok videó nélkül marad — szándékosan; a bukást a 🎬 REEL-ŐRSZEM jelzi.
    const q = cfg.videoOnly ? await maiVideok(cfg.field, cikkLista) : queueFor(cfg.field, pub, now);
    // THREADS-VIDEÓK (2026-10-15): a link-posztok UTÁN a mai videók is, saját jelölővel
    // (posted_threads_video) — a cikk link-posztja napokkal korábban kimehetett. Ugyanaz a
    // videó-készlet, mint a TikToké (maiVideok), ugyanaz a 404-védelem és újrapróba.
    const vq = cfg.videoField ? (await maiVideok(cfg.videoField, cikkLista)).map(x => ({ ...x, markField: cfg.videoField })) : [];
    // TIKTOK-FOTÓK (2026-10-15): jelöltek a core-ból; a keretet a videók után számoljuk.
    const fotoNy = cfg.photoField ? fotoNyersanyag(pub, now) : [];
    const fotoLehet = cfg.photoField ? tiktokFotoSor(fotoNy, { now, keret: Infinity }) : { sor: [], hely: 0 };
    if (!q.length && !vq.length && !(fotoLehet.sor.length && fotoLehet.hely > 0)) {
      console.log(`\n💤 ${cfg.label}: nincs kiküldendő.` + (cfg.videoOnly ? ' (videó: a mai Reel · fotó: friss, FB-n kint lévő cikk)' : ''));
      continue;
    }

    // ── NAPI PLAFON (2026-08-24) ────────────────────────────────────
    // A `--limit` FUTÁSONKÉNT számol, a CI viszont naponta háromszor fut —
    // `--limit 2` így napi 6 posztot jelentett csatornánként. Indoklás és a
    // mért számok: core/channel-cap.js.
    const plafon = token() ? capFor(CONFIG, ch.key) : null;
    let keret = LIMIT;
    let maiDb = null;          // a fotó-keret is ebből számol (2026-10-15)
    if (plafon !== null) {
      maiDb = ORG ? await sentTodayFor(ORG, ch.id) : null;
      keret = allowedNow({ sentToday: maiDb, dailyCap: plafon, runLimit: LIMIT });
      console.log(`\n📊 ${cfg.label}: napi plafon ${plafon} · ma eddig `
        + `${maiDb === null ? '? (nem sikerült lekérdezni)' : maiDb} → most ${keret} mehet`);
      if (keret <= 0) {
        // ⚠️ PRÓBAMÓDBAN NEM UGRUNK ÁT. Egy próba, ami a plafon miatt
        // ELHALLGATJA, mi menne ki, pont a lényegét veszti el: így nem
        // lehet ellenőrizni a poszt FORMÁJÁT (2026-08-25-én ezen bukott
        // meg az (akkori) Instagram-Reel próbája). Élesben a plafon szent.
        if (!DRY) {
          console.log(`   ⏭️  ${cfg.label}: mára megvan a napi adag — kihagyom.`);
          continue;
        }
        console.log(`   🧪 (a plafon élesben itt megállna — próbában megmutatom, mi menne)`);
        keret = 1;
      }
    }

    // 2026-09-27 (user): „a lemaradásokat töröljük, csak a frissek menjenek" — a Threadsre is.
    // A videós csatorna sora eleve csak a MAI Reeleket tartalmazza, a korábbi elöl.
    const linkBatch = cfg.videoOnly ? q.slice(0, keret) : selectSocialBatch(q, keret, { csakFriss: true });
    // A Threads: a link-posztok UTÁN a mai videók (vq) — a --limit a link-posztokra számol, a videókat
    // a saját napi készletük (és a posted_threads_video jelölő) korlátozza.
    const batch = [...linkBatch, ...vq];
    console.log(`\n📨 ${cfg.label} (@${ch.user}) — ${q.length + vq.length} várakozóból ${batch.length} megy ki`
      + (cfg.videoOnly ? '  🎬 (a mai Reel)' : '') + (vq.length ? `  🎬 (+${vq.length} videó-poszt)` : ''));

    // EGY tétel kiküldése: videó, link-poszt (képpel) vagy TikTok-fotó. Visszaadja, sikerült-e.
    const kuldTetel = async item => {
      const slug = realSlug(item.post);
      const cta = followCta(slug);
      // A követésre hívás a link UTÁN, hogy ne tolja el a mondanivalót.
      const alap = composePost({ text: item.post.facebook, url: ch.key === 'threads' ? forrasJel(item.post.url, 'th') : item.post.url, channel: ch.key });
      if (!alap) { console.log(`   ⏭️  ${slug.slice(0, 40)} — nem fér ki erre a csatornára`); return false; }
      const szoveg = cta && (alap.weight + cta.length + 2) <= cfg.limit ? `${alap.body}\n\n${cta}` : alap.body;

      // ── VIDEÓ VAGY KÉP ──────────────────────────────────────────
      // A videós sor (TikTok) és a Threads-videó a napi Facebook-Reel UGYANAZON fájlját kapja —
      // egy fájl, több helyre, nulla plusz költség. A szöveges csatornák (Threads,
      // X) a 4:5 borítóképet, ha kint van; kép nélkül is elmennek. A TikTok-fotó
      // (item.kep) képe már ellenőrzött: a kiválasztáskor megvolt az imageExists.
      const video = item.video || null;
      const kep = item.kep || imageUrl(slug);
      const vanKep = video ? false : (item.kep ? true : await imageExists(kep));
      const markField = item.markField || cfg.field;

      if (DRY) {
        console.log(`   (próba) ${slug.slice(0, 44)}  [${alap.weight}/${cfg.limit}${alap.truncated ? ', csonkítva' : ''}]${video || vanKep ? '' : ' ⚠️ kép nélkül'}`);
        if (video) {
          console.log(`      🎬 VIDEÓ: ${video}`);
          console.log(`         csempe: a videó ${REEL_CSEMPE_MS} ms-nál lévő képkockája (a horog-kártya)`);
        }
        if (item.kep) console.log(`      🖼️ FOTÓ-poszt: ${item.kep}  (jelölő: ${markField})`);
        return false;
      }

      let r = video
        ? await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, video })
        : item.kep
          ? await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, image: item.kep })
          : await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, image: vanKep ? kep : null });
      // 2026-10-13: a Buffer a SAJÁT szervereiről tölti le a videót — nálunk már 200 volt,
      // náluk még nem („Video could not be read from its URL"). Várunk, és újra próbáljuk.
      // 2026-10-29: a FOTÓRA is (éles eset: a Databricks-hír képe a deploy után 1,5 perccel még
      // „Image could not be read from its URL” — nálunk 200 volt, a Buffer még nem érte el).
      for (let ujra = 1; (video || item.kep) && r.error && VIDEO_NEM_OLVASHATO.test(r.error) && ujra <= 2; ujra++) {
        console.log(`   ⏳ a Buffer még nem éri el a ${video ? 'videót' : 'fotót'} — ${ujra}. újrapróba 60 mp múlva`);
        await new Promise(res => setTimeout(res, 60000));
        r = video
          ? await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, video })
          : await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, image: item.kep });
      }
      if (video) console.log(`   🎬 videó: ${slug.slice(0, 44)}`);
      if (item.kep) console.log(`   🖼️ fotó: ${slug.slice(0, 44)}`);
      keres++;
      if (r.error) {
        // A bukás nem csak a naplóba megy: az őrszem-fájlon át a napi
        // riportba is. Egy elutasított poszt („LimitReachedError",
        // „UnauthorizedError") pontosan olyan néma leállás, mint a lejárt token.
        hibak.push({ csatorna: ch.key, slug: slug.slice(0, 60), hiba: r.error });
        console.log(`   ❌ ${slug.slice(0, 40)} — ${r.error}`);
        return false;
      }

      // CSAK sikeres válasz után jelöljük kiküldöttnek. ⚠️ A "sikeres" API-válasz
      // nem jelenti, hogy a poszt MEG IS JELENT — a Facebooknál ezt már
      // megtanultuk (a webhook 200-a csak annyit tett: "átvettem"). Ezért a
      // csatornánkénti látogatót két hét múlva KÜLÖN megmérjük.
      // A jelölő tételenként más lehet: link-poszt `posted_threads`, Threads-videó
      // `posted_threads_video`, TikTok-fotó `posted_tiktok_photo`.
      // ⚠️ Nem az item.post-ot írjuk vissza (az elavult: a link-poszt, a videó és a fotó külön parse-ok
      // ugyanabból a fájlból) — a core/social-mark.js újraolvas, és csak ezt az egy mezőt állítja.
      item.post = jelolMezo(item.path, markField, new Date().toISOString(), { fallback: item.post });
      kikuldve++;
      console.log(`   ✅ ${slug.slice(0, 44)}`);
      return true;
    };

    let videoKikuldve = 0;
    const videoUtak = new Set();   // a futásban VIDEÓKÉNT kiment cikkek — a fotó-sor ezeket kihagyja (review I1)
    for (const item of batch) {
      const ok = await kuldTetel(item);
      if (ok && (item.video || cfg.videoOnly)) { videoKikuldve++; videoUtak.add(item.path); }
    }

    // ── TIKTOK FOTÓ-POSZTOK (2026-10-15, user: „minden közösségi médiában ugyanazok jelenjenek meg") ──
    // A videók UTÁN: a Facebookra már kiment, friss cikkek 4:5 képe, a legfrissebb elöl, napi max 3 és
    // soha a csatorna napi plafonján (6) túl. A válogatás a core/tiktok-foto.js-ben (tesztelt); itt csak
    // a kép létét ellenőrizzük (hiányzó kép nem viszi el a helyet), és küldünk. NINCS isAiGenerated:
    // a TikTok fotónál elutasítja — az MI-jelölés a szövegben van (core/buffer-api.js).
    if (cfg.photoField) {
      let fk = fotoKeret({ plafon, maiDb, videoKikuldve });
      // Próbában a plafon nem némítja el, mi menne (lásd fent) — de a napi 3-nál így is megáll.
      if (DRY && fk <= 0) fk = 1;
      const { sor, hely } = tiktokFotoSor(fotoNy, { now, keret: fk, kizar: videoUtak });
      console.log(`\n🖼️ ${cfg.label} FOTÓ-posztok: ${sor.length} jelölt (FB-n kint, friss, nincs videó/fotó) · hely most: ${hely}`);
      let elkuldve = 0;
      for (const j of sor) {
        if (elkuldve >= hely) break;
        const kep = imageUrl(realSlug(j.post));
        if (!(await imageExists(kep))) { console.log(`   ⏭️  ${realSlug(j.post).slice(0, 40)} — a kép nincs kint, kihagyom`); continue; }
        // 2026-10-15 (végső review I1): minden createPost-KÍSÉRLET helyet használ, és az első
        // Buffer-hibánál megállunk — különben egy elutasító Buffer mellett minden futás a teljes
        // jelölt-listán égetné a kvótát. A döntés a core/tiktok-foto.js fotoLepes-ében (tesztelt).
        const keresElotte = keres;
        const ok = await kuldTetel({ ...j, kep, markField: cfg.photoField });
        const lepes = fotoLepes({ keresElotte, keresUtana: keres, ok, dry: DRY });
        if (lepes.hely) elkuldve++;
        if (lepes.megall) { console.log('   ⛔ a Buffer elutasította a fotót — a többit nem próbálom ebben a futásban'); break; }
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 Kiküldve: ${kikuldve} | API-kérés: ${keres}/${NAPI_KERET} napi keret`);

  // 🎵 TIKTOK NAPI SZÁM A RIPORTNAK (2026-10-13, user: „fontos lenne a forgalom miatt!"):
  // a futás VÉGÉN még egyszer megkérdezzük a Buffert, hány videó ment ki ma — a
  // napi jelentés ebből ír „🎵 TikTok ma: 3/3" vagy „⚠️ … csak 1/3" sort (core/buffer-guard.js).
  let tiktokMa = null;
  const ttCsat = channels.find(c => c.key === 'tiktok');
  if (ttCsat && ORG && !DRY) {
    // A külön videó- és fotó-szám a SAJÁT mai jelölésekből (friss olvasás) — a fotó nem takarhatja el a hiányzó videót.
    const jelolesek = fotoNyersanyag(pub, Date.now());
    tiktokMa = { nap: new Date().toISOString().slice(0, 10), db: await maiTiktokDb(ORG, ttCsat.id), plafon: capFor(CONFIG, 'tiktok'),
      video: maiMarkaDb(jelolesek, 'posted_tiktok'), foto: maiMarkaDb(jelolesek, 'posted_tiktok_photo') };
    console.log(`🎵 TikTok ma összesen: ${tiktokMa.db === null ? '?' : tiktokMa.db}/${tiktokMa.plafon}`);
  }

  return {
    tiktokMa,
    tokenVan: !!token(),
    socialMappa: true,
    csatornaLekerdezes: token() ? 'ok' : 'kihagyva',
    csatornaHiba: CSATORNA_HIBA,
    // A szándékosan leállított (0-s plafonú) csatorna leválása nem riaszt (10-05, core/channel-cap.js).
    csatornak: figyelendoCsatornak(NYERS_CSATORNAK, CONFIG, SERVICE_MAP),
    ismertCsatornak: channels.map(c => c.key),
    hibak, kikuldve, keres
  };
}

// ===================================================================
// A LÁNC VÉGE — előbb az őrszem, AZTÁN a kilépőkód (2026-08-30)
// ===================================================================
//
// ⚠️ ITT KORÁBBAN `process.exit(0)` ÁLLT A HIBAÁGON IS („nem kritikus"),
// szemben a poster.js-szel és a reel-post.js-szel, amik 1-gyel lépnek ki.
// Egy összeomlott poszter így ZÖLD CI-futásnak látszott.
//
// ⚠️ ÉS A SORREND SEM MINDEGY. A reel-post.js-ben pontosan ez a hiba volt: ott
// a `process.exit(1)` MEGELŐZTE az őrszem-írást, az pedig azonnal megöli a
// folyamatot — a bukás sosem került a guard-fájlba, a riport hallgatott. A
// `futtatBuffer()` ezért ELŐBB írja az őr-fájlt, és a hibát csak utána adja
// tovább ide.
//
// A kilépőkód a CI-nak szól, az őr-fájl a napi riportnak: a kettő nem
// helyettesíti egymást. A workflow `|| true`-ja (auto.yml) miatt az 1-es
// kilépőkód NEM állítja meg a pipeline-t — a user felé az őrszem-sor visz.
futtatBuffer({ ROOT, join, fn: main, eles: ELES })
  .then(() => process.exit(0))
  .catch(e => {
    console.error('💥 BUFFER-POSZTER HIBA:', String(e.message).slice(0, 200));
    process.exit(1);
  });
