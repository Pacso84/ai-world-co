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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
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
async function createPost({ channelId, text, image, channelKey }) {
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
  const input = {
    channelId,
    text,
    // Az assets NON_NULL: kép nélkül ÜRES lista megy (X/Threads elfogadja,
    // az Instagramot kép nélkül fentebb már kihagytuk).
    assets: image ? [{ image: { url: image } }] : [],
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
  if (channelKey === 'instagram') {
    input.metadata = { instagram: { type: 'post', shouldShareToFeed: true } };
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

  const pub = publishedMap();
  const now = Date.now();
  let kikuldve = 0, keres = 0;

  for (const ch of channels) {
    const cfg = CHANNELS[ch.key];
    const q = queueFor(cfg.field, pub, now);
    if (!q.length) { console.log(`\n💤 ${cfg.label}: nincs kiküldendő.`); continue; }

    const batch = selectSocialBatch(q, LIMIT);
    console.log(`\n📨 ${cfg.label} (@${ch.user}) — ${q.length} várakozóból ${batch.length} megy ki`);

    for (const item of batch) {
      const slug = realSlug(item.post);
      const cta = followCta(slug);
      // A követésre hívás a link UTÁN, hogy ne tolja el a mondanivalót.
      const alap = composePost({ text: item.post.facebook, url: item.post.url, channel: ch.key });
      if (!alap) { console.log(`   ⏭️  ${slug.slice(0, 40)} — nem fér ki erre a csatornára`); continue; }
      const szoveg = cta && (alap.weight + cta.length + 2) <= cfg.limit ? `${alap.body}\n\n${cta}` : alap.body;

      // KÉP-ELLENŐRZÉS. Az Instagramnak KÖTELEZŐ; a másik kettőnek jólesik.
      const kep = imageUrl(slug);
      const vanKep = await imageExists(kep);
      if (!vanKep && ch.key === 'instagram') {
        console.log(`   ⏭️  ${slug.slice(0, 40)} — nincs borítókép, az Instagram viszont követeli`);
        continue;
      }

      if (DRY) {
        console.log(`   (próba) ${slug.slice(0, 44)}  [${alap.weight}/${cfg.limit}${alap.truncated ? ', csonkítva' : ''}]${vanKep ? '' : ' ⚠️ kép nélkül'}`);
        continue;
      }

      const r = await createPost({ channelId: ch.id, channelKey: ch.key, text: szoveg, image: vanKep ? kep : null });
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
