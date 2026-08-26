// ===================================================================
// BUFFER-POSZTER — X · Threads · Instagram (2026-08-14)
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
// ── AMI IGAZOLVA VAN ─────────────────────────────────────────────────
// A végpont (2026-08-14, kulcs nélkül mérve):
//     POST https://graph.buffer.com/  →  401
//     {"errors":[{"message":"An authentication JWT or Access Token is
//      required","extensions":{"code":"UNAUTHENTICATED"}}]}
// Vagyis a cím létezik és GraphQL-t beszél.
//
// ── AMI MÉG NINCS IGAZOLVA ───────────────────────────────────────────
// A `createPost` mutáció PONTOS alakját kulcs nélkül nem lehet ellenőrizni.
// Ezért NEM tippelünk vakon: a `--verify` mód a token megérkezésekor
// LEKÉRDEZI a séma valódi alakját, és megmondja, egyezik-e azzal, amit
// küldeni készülünk. Éles posztolás csak azután.
//
// FUTTATÁS:
//   node agents/social/buffer-poster.js --verify   -- séma-ellenőrzés (nem posztol)
//   node agents/social/buffer-poster.js --channels -- a bekötött csatornák + azonosítóik
//   node agents/social/buffer-poster.js --dry      -- mit küldenénk (token nélkül is)
//   node agents/social/buffer-poster.js            -- éles
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { selectSocialBatch } from '../../core/social-queue.js';
import { composePost, followCta, CHANNELS } from '../../core/social-text.js';
import { capFor, allowedNow, countSentToday } from '../../core/channel-cap.js';

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

// ⚠️ A HELYES CÍM az api.buffer.com (2026-08-14). A graph.buffer.com is él és
// introspektálható, de az adat-lekérdezéseknél maga a Buffer szól rá:
//     {"errors":[{"message":"Please use api.buffer.com"}]}
const ENDPOINT = 'https://api.buffer.com/';
const FRESH_DAYS = 7;

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

const token = () => (process.env.BUFFER_ACCESS_TOKEN || '').trim();

// ---------- GraphQL ----------
async function gql(query, variables = {}) {
  const t = token();
  if (!t) return { error: 'nincs BUFFER_ACCESS_TOKEN' };
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20000)
    });
    const j = await r.json().catch(() => ({}));
    if (j.errors?.length) return { error: String(j.errors[0].message).slice(0, 140), status: r.status };
    if (!r.ok) return { error: `HTTP ${r.status}`, status: r.status };
    return { data: j.data };
  } catch (e) { return { error: String(e.message).slice(0, 100) }; }
}

// ---------- 1. SÉMA-ELLENŐRZÉS ----------
// Ez a lépés váltja ki a találgatást. Introspekcióval megkérdezzük a Buffert,
// milyen mezőket vár valójában, és kiírjuk. Ha eltér attól, amit küldeni
// akarunk, ITT derül ki — nem egy néma, elveszett posztnál.
async function verifySchema() {
  console.log('🔬 BUFFER SÉMA-ELLENŐRZÉS');
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
async function orgId() {
  const r = await gql(`{ account { organizations { id } } }`);
  if (r.error) return { error: r.error };
  const id = r.data?.account?.organizations?.[0]?.id;
  return id ? { id } : { error: 'nincs szervezet a fiókhoz' };
}

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
  const r = await gql(
    `query($i: PostsInput!){ posts(input:$i){ edges { node { status sentAt } } } }`,
    { i: { organizationId, filter: { channelIds: [channelId] } } });
  if (r.error) return null;
  const edges = r.data?.posts?.edges;
  if (!Array.isArray(edges)) return null;
  return countSentToday(edges.map(e => e?.node).filter(Boolean));
}

async function listChannels() {
  const o = await orgId();
  if (o.error) { console.log('   ❌ ' + o.error); return null; }
  const r = await gql(
    `query($i: ChannelsInput!){ channels(input:$i){ id service name isDisconnected isLocked } }`,
    { i: { organizationId: o.id } });
  if (r.error) { console.log('   ❌ ' + r.error); return null; }
  const ch = (r.data?.channels || []).filter(c => !c.isDisconnected && !c.isLocked);
  console.log('📡 BEKÖTÖTT CSATORNÁK');
  if (!ch.length) { console.log('   ⚠️ egy használható csatorna sincs'); return []; }
  for (const c of ch) console.log(`   ${String(c.service).padEnd(11)} ${c.name || '?'}   id: ${c.id}`);
  return ch.map(c => ({ ...c, serviceUsername: c.name }));
}

// A Buffer `service` neve → a mi csatorna-kulcsunk a social-text.js-ben.
const SERVICE_MAP = { twitter: 'x', x: 'x', threads: 'threads', instagram: 'instagram' };

// ---------- 3. A SOR (ugyanaz a rangsor, mint a Facebooknál) ----------
function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

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

// A social-fájl VALÓDI slugja az url-ből — a `slug` mező lehet csonka maradvány.
function realSlug(post) {
  const fromUrl = String(post.url || '').split('/article/')[1];
  return (fromUrl || post.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

/**
 * A még ki nem küldött posztok EGY csatornára.
 * A `field` (posted_x / posted_threads / posted_instagram) csatornánként
 * KÜLÖN — ugyanaz a cikk mindhármon kimehet, de mindegyiken csak egyszer.
 */
function queueFor(field, pub, now) {
  const out = [];
  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post; try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post[field]) continue;                       // erre a csatornára már kiment
    if (!post.facebook || !post.url) continue;       // a szöveg a `facebook` mezőben van

    const rec = pub[realSlug(post)] || pub[post.slug];
    if (!rec) continue;                              // nincs találat → VÁRUNK, nem dobunk
    const pubAt = rec.at || '';
    const isGuide = !!rec.guide;
    const age = pubAt ? (now - new Date(pubAt).getTime()) : Infinity;
    // HÍR: csak friss. ÚTMUTATÓ: örökzöld (ugyanaz a szabály, mint a Facebooknál).
    if (!isGuide && age > FRESH_DAYS * 24 * 3600e3) {
      post[field] = 'skipped-stale';
      if (!DRY) writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
      continue;
    }
    out.push({ path, post, pubAt, isGuide, isFresh: age <= FRESH_DAYS * 24 * 3600e3 });
  }
  return out;
}

// A 4:5 álló borítókép — ugyanaz, amit a Facebook kap. Az Instagram feed
// ideális aránya is 4:5, tehát nem kell külön képgyártás.
const imageUrl = slug => `${SITE}/assets/fb/${slug}.jpg`;

// ⚠️ A KÉP NEM MINDIG VAN MEG (2026-08-14, mérve: 18 sorban álló posztból 17-nek
// volt képe, egynek NEM). Ez azért számít, mert az INSTAGRAM KÖTELEZŐEN képet
// követel — kép nélkül ott a poszt elbukna, méghozzá egy homályos API-hibával.
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
// A MAI REEL — van-e ma legyártott álló videó, és kint van-e?
// ===================================================================
//
// A Facebook-Reel lánc (core/reel-queue.js + core/reel-post.js) naponta
// EGY útmutatóból gyárt videót, és a cikk `_meta.reel_at` mezőjét ma-i
// időbélyeggel jelöli meg. Ezt keressük meg — így ugyanaz a fájl megy ki
// az Instagramra is, plusz gyártás nélkül.
//
// ⚠️ A CÍMET LE IS ELLENŐRIZZÜK. A Buffer a saját szerveréről tölti le a
// videót, ugyanúgy, mint a Facebook. Ha a deploy elhasalt volna, a fájl
// nem lenne kint — és ezt élesben már megtanultuk (2026-08-23: háromszor
// küldtünk ki egy 404-es videó-címet, háromszor 422 jött vissza).
//
// BÁRMILYEN hiba → null, vagyis a MAI viselkedés (állóképes poszt megy).
// A Reel soha nem akadályozhatja meg, hogy egyáltalán posztoljunk.
async function maiReel() {
  try {
    const { reelVideoUrl } = await import('../../core/reel-post.js');
    const DIR = join(ROOT, 'content', 'articles');
    if (!existsSync(DIR)) return null;
    const ma = new Date().toISOString().slice(0, 10);

    for (const f of readdirSync(DIR)) {
      if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
      let j; try { j = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
      const m = j._meta || {};
      if (String(m.reel_at || '').slice(0, 10) !== ma || !m.slug) continue;

      const video = reelVideoUrl(m.slug);
      const h = await fetch(video, { method: 'HEAD', signal: AbortSignal.timeout(15000) }).catch(() => null);
      if (!h || !h.ok) { console.log('   ⚠️ a mai Reel nincs kint — marad az állóképes poszt'); return null; }

      // ⚠️ A BORÍTÓKÉPET IS ELLENŐRIZNI KELL, ÉS EZ ÉLESBEN MEGFOGOTT
      // (2026-08-25): a Reel-sor a LEGRÉGEBBI útmutatót választja, a
      // megosztás-képek (assets/fb, assets/share) viszont csak a friss
      // cikkekhez készülnek — a júniusi útmutatóra mindkettő 404 volt.
      // Egy 404-es `thumbnailUrl` átadása rosszabb, mint a hiánya: a
      // Buffer/Instagram enélkül a videó első kockájából csinál csempét.
      let kep = null;
      for (const j of [imageUrl(m.slug), `${SITE}/assets/images/${m.slug}.jpg`]) {
        const t = await fetch(j, { method: 'HEAD', signal: AbortSignal.timeout(10000) }).catch(() => null);
        if (t && t.ok) { kep = j; break; }
      }

      // A CIKK SAJÁT KÖZÖSSÉGI SZÖVEGE. Enélkül a videó egy idegen cikk
      // szövegével menne ki — a próbafutás pontosan ezt mutatta meg.
      const sp = join(SOCIAL_DIR, m.slug + '.json');
      if (!existsSync(sp)) { console.log('   ⚠️ a mai Reel cikkéhez nincs poszt-szöveg — marad az állókép'); return null; }
      let post; try { post = JSON.parse(readFileSync(sp, 'utf-8')); } catch { return null; }

      // ⚠️ HA MÁR POSZTOLTUK EZT A CIKKET INSTAGRAMRA, NEM KÜLDJÜK ÚJRA.
      // Más formátum, de UGYANAZ a tartalom — a user épp a téma-ismétlés
      // miatt szólt. Ilyenkor a rendes sor viszi tovább a napot.
      if (post.posted_instagram) { console.log('   ⏭️  a mai Reel cikkét már posztoltuk Instagramra — marad a sor'); return null; }

      return { slug: m.slug, video, kep, item: { path: sp, post } };
    }
    return null;
  } catch { return null; }
}

async function createPost({ channelId, text, image, video, thumbnail, channelKey }) {
  const mutation = `mutation ($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { id status } }
      ... on NotFoundError { message }
      ... on UnauthorizedError { message }
      ... on UnexpectedError { message }
      ... on RestProxyError { code message }
      ... on LimitReachedError { message }
      ... on InvalidInputError { message }
    }
  }`;
  // ── VIDEÓ VAGY KÉP ──────────────────────────────────────────────
  // A séma élesben lekérdezve (2026-08-25):
  //     AssetInput      = { document | image | video }
  //     VideoAssetInput = { url, thumbnailUrl, metadata }
  // Videó esetén a borítókép NEM elhagyható jószág: az Instagram ebből
  // rakja ki a Reel csempéjét a profilrácsban.
  const assets = video
    ? [{ video: { url: video, ...(thumbnail ? { thumbnailUrl: thumbnail } : {}) } }]
    : image ? [{ image: { url: image } }] : [];

  const input = {
    channelId,
    text,
    // Az assets NON_NULL: kép nélkül ÜRES lista megy (X/Threads elfogadja,
    // az Instagramot kép nélkül fentebb már kihagytuk).
    assets,
    mode: 'shareNow',
    schedulingType: 'automatic',
    needsApproval: false
  };

  // AZ INSTAGRAM KÜLÖN METAADATOT KÖVETEL. Enélkül a mutáció így felel:
  //    InvalidInputError: Instagram posts require a type (post, story, or reel)
  // — és ez a hibaüzenet CSAK azért látszik, mert az unió-variánsokat is
  // lekérdezzük. Korábban némán "sikernek" tűnt, miközben a poszt létre sem jött.
  //    PostType = carousel | event | ghost_post | offer | post | reel | short
  //               | story | thread | whats_new
  // Nekünk `post` (feed-poszt) kell; a shouldShareToFeed kötelező.
  // ── REEL VAGY FEED-POSZT (2026-08-25, user-döntés) ──────────────
  // „A napi 1 Instagram-poszt legyen Reel az állókép helyett."
  //
  // MIÉRT: 11 nap mérve az Instagram 0 látogatót hozott. Az ok nem a
  // csatorna volt, hanem a FORMÁTUM — az állóképes feed-posztot az
  // Instagram alig mutatja NEM-követőknek, a Reelt viszont külön fülön és
  // az ajánlóban is. A saját csatorna-szabályunk épp ezt kérdezi:
  // „mutatja-e a platform a tartalmat nem követőknek?"
  //
  // ⚠️ HELYETTE, NEM MELLÉ. A fiók 2026-08-23-án automatizálás miatt
  // hirdetési korlátozást kapott, és aznap vettük vissza napi 6 posztról
  // napi 1-re. A Reel a napi EGY alkalmat használja fel — a tevékenység
  // mennyisége NEM nő, csak a formátum lesz jobb.
  if (channelKey === 'instagram') {
    input.metadata = { instagram: { type: video ? 'reel' : 'post', shouldShareToFeed: true } };
  }

  const r = await gql(mutation, { input });
  if (r.error) return r;
  const p = r.data?.createPost;
  // A "nem Success" variáns HIBA, akkor is, ha a HTTP-válasz 200 volt.
  if (p?.__typename !== 'PostActionSuccess') {
    return { error: `${p?.__typename || 'ismeretlen válasz'}: ${p?.message || '(nincs üzenet)'}` };
  }
  return { data: p.post };
}

async function main() {
  console.log('📤 BUFFER-POSZTER (X · Threads · Instagram)');
  console.log('─'.repeat(60));

  if (VERIFY) { await verifySchema(); return; }
  if (LIST_CHANNELS) { await listChannels(); return; }

  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }

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
    if (!list) { console.log('   ⏭️  A csatornákat nem sikerült lekérdezni — kihagyom.'); return; }
    channels = list
      .map(c => ({ key: SERVICE_MAP[String(c.service).toLowerCase()], id: c.id, user: c.serviceUsername }))
      .filter(c => c.key && CHANNELS[c.key]);
    if (!channels.length) { console.log('   ⚠️ egyik bekötött csatornát sem ismerem.'); return; }
  }

  if (ONLY) {
    channels = channels.filter(c => c.key === ONLY);
    console.log(`   🎯 csak a(z) ${ONLY} csatorna`);
    if (!channels.length) { console.log('   ⚠️ ilyen bekötött csatorna nincs.'); return; }
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

  const pub = publishedMap();
  const now = Date.now();
  let kikuldve = 0, keres = 0;

  for (const ch of channels) {
    const cfg = CHANNELS[ch.key];
    const q = queueFor(cfg.field, pub, now);
    if (!q.length) { console.log(`\n💤 ${cfg.label}: nincs kiküldendő.`); continue; }

    // ── NAPI PLAFON (2026-08-24) ────────────────────────────────────
    // A `--limit` FUTÁSONKÉNT számol, a CI viszont naponta háromszor fut —
    // `--limit 2` így napi 6 posztot jelentett csatornánként. Indoklás és a
    // mért számok: core/channel-cap.js.
    const plafon = token() ? capFor(CONFIG, ch.key) : null;
    let keret = LIMIT;
    if (plafon !== null) {
      const maiDb = ORG ? await sentTodayFor(ORG, ch.id) : null;
      keret = allowedNow({ sentToday: maiDb, dailyCap: plafon, runLimit: LIMIT });
      console.log(`\n📊 ${cfg.label}: napi plafon ${plafon} · ma eddig `
        + `${maiDb === null ? '? (nem sikerült lekérdezni)' : maiDb} → most ${keret} mehet`);
      if (keret <= 0) {
        // ⚠️ PRÓBAMÓDBAN NEM UGRUNK ÁT. Egy próba, ami a plafon miatt
        // ELHALLGATJA, mi menne ki, pont a lényegét veszti el: így nem
        // lehet ellenőrizni a poszt FORMÁJÁT (2026-08-25-én ezen bukott
        // meg az Instagram-Reel próbája). Élesben viszont a plafon szent.
        if (!DRY) {
          console.log(`   ⏭️  ${cfg.label}: mára megvan a napi adag — kihagyom.`);
          continue;
        }
        console.log(`   🧪 (a plafon élesben itt megállna — próbában megmutatom, mi menne)`);
        keret = 1;
      }
    }

    // ── A MAI REEL LESZ AZ INSTAGRAM NAPI POSZTJA (2026-08-25) ──────
    //
    // ⚠️ NEM A SORBÓL VETT SZÖVEGHEZ RAGASZTJUK A VIDEÓT. Az első
    // változatom ezt tette, és a próbafutás megmutatta, mi lett belőle:
    //     szöveg: „AI Memory Games for Dementia Care…"
    //     videó : „How to Write a Clear Prompt…"
    // Két különböző cikk, egy poszton. A videót a Reel-sor választja
    // (legrégebbi útmutató), a szöveget a közösségi sor — a kettőnek
    // semmi köze egymáshoz.
    //
    // Ezért a Reel a SAJÁT cikkének kész közösségi szövegével megy ki, és
    // az a poszt kapja a „kiküldve" jelölést. A sorból kimaradó elem ott
    // marad, holnap sorra kerül — sor, nem határidő.
    const reel = ch.key === 'instagram' ? await maiReel() : null;

    // ── INSTAGRAMRA CSAK REEL MEGY (2026-08-26, user-döntés) ───────
    //
    // MI TÖRTÉNT: 08-26-án a Facebook Reel kiment, az Instagram viszont
    // ÁLLÓKÉPET kapott. Az éjféli futás még ffmpeg nélkül ment, ott a Reel
    // elbukott, tehát a rendszer a szokásos állóképet posztolta — és azzal
    // ELHASZNÁLTA a napi 1-es keretet. Mire reggel elkészült a Reel, már
    // nem volt hova kitenni.
    //
    // Az állókép tehát nem csak gyengébb: KISZORÍTJA a Reelt. Ezért most
    // inkább NEM posztolunk, mint hogy a nap egyetlen helyét egy olyan
    // formával töltsük ki, ami 11 nap alatt 0 látogatót hozott.
    //
    // ⚠️ CSAK AZ INSTAGRAMRA vonatkozik. A Threads szöveges csatorna, ott
    // a link kattintható és a mostani forma működik — azt nem érintjük.
    //
    // Ha egy nap nincs Reel (elfogytak az alkalmas útmutatók, vagy hibázott
    // a gyártás), az Instagram aznap NÉMA MARAD. Ez szándékos — és nem
    // észrevétlen: a bukást a 🎬 REEL-ŐRSZEM kiírja a napi riportba.
    if (ch.key === 'instagram' && !reel?.item) {
      console.log(`\n⏭️  ${cfg.label}: ma nincs kiküldhető Reel — kihagyom.`
        + ' (Az Instagramra CSAK Reel megy — user-döntés, 2026-08-26.)');
      continue;
    }

    const batch = reel?.item ? [reel.item] : selectSocialBatch(q, keret);
    console.log(`\n📨 ${cfg.label} (@${ch.user}) — ${q.length} várakozóból ${batch.length} megy ki`
      + (reel?.item ? '  🎬 (a mai Reel)' : ''));

    for (const item of batch) {
      const slug = realSlug(item.post);
      const cta = followCta(slug);
      // A követésre hívás a link UTÁN, hogy ne tolja el a mondanivalót.
      const alap = composePost({ text: item.post.facebook, url: item.post.url, channel: ch.key });
      if (!alap) { console.log(`   ⏭️  ${slug.slice(0, 40)} — nem fér ki erre a csatornára`); continue; }
      const szoveg = cta && (alap.weight + cta.length + 2) <= cfg.limit ? `${alap.body}\n\n${cta}` : alap.body;

      // ── A MAI REEL (2026-08-25) ─────────────────────────────────
      // Ugyanaz a videó, amit a Facebook Reelhez gyártottunk — egy fájl,
      // két helyre, nulla plusz költség. CSAK az Instagramnak: a Threads
      // szöveges csatorna, ott a link kattintható, a mostani forma jó.
      //
      // KÉP-ELLENŐRZÉS. Az Instagramnak KÖTELEZŐ — kivéve, ha Reel megy.
      const kep = imageUrl(slug);
      const vanKep = await imageExists(kep);
      if (!vanKep && !reel && ch.key === 'instagram') {
        console.log(`   ⏭️  ${slug.slice(0, 40)} — nincs borítókép, az Instagram viszont követeli`);
        continue;
      }

      if (DRY) {
        console.log(`   (próba) ${slug.slice(0, 44)}  [${alap.weight}/${cfg.limit}${alap.truncated ? ', csonkítva' : ''}]${vanKep ? '' : ' ⚠️ kép nélkül'}`);
        if (reel) {
          console.log(`      🎬 REEL-formátum: ${reel.video}`);
          console.log(`         csempe: ${reel.kep || '(nincs — a videó első kockája lesz)'}`);
        } else if (ch.key === 'instagram') {
          console.log('      🖼️  állóképes poszt (ma nincs legyártott Reel)');
        }
        continue;
      }

      const r = reel
        ? await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, video: reel.video, thumbnail: reel.kep })
        : await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, image: vanKep ? kep : null });
      if (reel) console.log(`   🎬 Reel-formátum: ${reel.slug.slice(0, 44)}`);
      keres++;
      if (r.error) { console.log(`   ❌ ${slug.slice(0, 40)} — ${r.error}`); continue; }

      // CSAK sikeres válasz után jelöljük kiküldöttnek. ⚠️ A "sikeres" API-válasz
      // nem jelenti, hogy a poszt MEG IS JELENT — a Facebooknál ezt már
      // megtanultuk (a webhook 200-a csak annyit tett: "átvettem"). Ezért a
      // csatornánkénti látogatót két hét múlva KÜLÖN megmérjük.
      item.post[cfg.field] = new Date().toISOString();
      writeFileSync(item.path, JSON.stringify(item.post, null, 2), 'utf-8');
      kikuldve++;
      console.log(`   ✅ ${slug.slice(0, 44)}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 Kiküldve: ${kikuldve} | API-kérés: ${keres}/${NAPI_KERET} napi keret`);
}

main().then(() => process.exit(0)).catch(e => {
  console.error('💥 BUFFER-POSZTER HIBA (nem kritikus):', String(e.message).slice(0, 200));
  process.exit(0);
});
