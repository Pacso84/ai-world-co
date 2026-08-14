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

const ENDPOINT = 'https://graph.buffer.com/';
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
async function listChannels() {
  console.log('📡 BEKÖTÖTT CSATORNÁK');
  const r = await gql(`{ account { channels { id service serviceUsername } } }`);
  if (r.error) { console.log('   ❌ ' + r.error); return null; }
  const ch = r.data?.account?.channels || [];
  if (!ch.length) { console.log('   ⚠️ egy csatorna sincs bekötve'); return []; }
  for (const c of ch) console.log(`   ${String(c.service).padEnd(11)} @${c.serviceUsername || '?'}   id: ${c.id}`);
  return ch;
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
// ⚠️ EZ AZ EGYETLEN RÉSZ, AMI MÉG NINCS ÉLESBEN IGAZOLVA. Szándékosan rövid
// és elkülönített: ha a `--verify` mást mutat, CSAK ez a függvény változik.
async function createPost({ channelId, text, image }) {
  const mutation = `mutation ($input: PostCreateInput!) {
    createPost(input: $input) { id status }
  }`;
  const input = { channelIds: [channelId], text };
  // A Buffer dokumentációja szerint a kép és a link-előnézet KIZÁRJA egymást;
  // nekünk a KÉP kell (a linket a szövegbe tesszük), ezért csak assets megy.
  if (image) input.assets = [{ type: 'image', url: image }];
  return gql(mutation, { input });
}

async function main() {
  console.log('📤 BUFFER-POSZTER (X · Threads · Instagram)');
  console.log('─'.repeat(60));

  if (VERIFY) { await verifySchema(); return; }
  if (LIST_CHANNELS) { await listChannels(); return; }

  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }

  // Melyik csatornákra dolgozunk? Élesben a Buffertől kérdezzük (így az X
  // bekötése után magától bővül); próbában mind a hármat mutatjuk.
  let channels;
  if (DRY || !token()) {
    channels = Object.keys(CHANNELS).map(k => ({ key: k, id: `(próba-${k})`, user: '?' }));
    console.log('   🧪 PRÓBA — nincs kiküldés' + (token() ? '' : ' (nincs token sem)'));
  } else {
    const list = await listChannels();
    if (!list) { console.log('   ⏭️  A csatornákat nem sikerült lekérdezni — kihagyom.'); return; }
    channels = list
      .map(c => ({ key: SERVICE_MAP[String(c.service).toLowerCase()], id: c.id, user: c.serviceUsername }))
      .filter(c => c.key && CHANNELS[c.key]);
    if (!channels.length) { console.log('   ⚠️ egyik bekötött csatornát sem ismerem.'); return; }
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

      const r = await createPost({ channelId: ch.id, text: szoveg, image: vanKep ? kep : null });
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
