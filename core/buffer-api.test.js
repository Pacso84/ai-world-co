// ===================================================================
// BUFFER GraphQL API-RÉTEG — tesztek  (2026-09-16)
// ===================================================================
// INGYENES, HÁLÓZAT NÉLKÜLI. Fut: node core/run-tests.js
//
// ⚠️ EGYETLEN VALÓDI HÁLÓZATI KÉRÉS SINCS BENNE. Minden eset INJEKTÁLT,
// hamis `fetch`-et kap (`fetchFn`), és a token is kitalált szöveg. A Buffert
// tesztből megszólítani egyszerre lenne lassú, megbízhatatlan és VESZÉLYES:
// egy elgépelt eset VALÓDI posztot tenne ki az Instagramra.
//
// MIÉRT VAN EZ A FÁJL. A Buffer-hívások 2026-09-16-ig az
// `agents/social/buffer-poster.js`-ben laktak, az pedig NEM IMPORTÁLHATÓ (a
// fájl végén feltétel nélkül indul a `main()`). Vagyis az a réteg, ami a
// kiküldést végzi, SOHA nem állt teszt alatt — pontosan az a minta, ami miatt
// a `core/buffer-guard.js` is kikerült a `core/` alá.
//
// 🔑 AMIT EZ A TESZT ŐRIZ, EGY MONDATBAN:
//     A GRAPHQL MINDIG HTTP 200-AT AD — A SIKERT A TARTALOM DÖNTI EL.
// A hibát a Buffer típusos unióban küldi (`... on MutationError { message }`),
// nem státuszkódban. Élesben ez MEG IS VEZETETT (2026-08-14): az akkori kód
// minden variánst sikernek vett, a Threadsnél véletlenül igaza lett, az
// Instagramnál viszont a poszt LÉTRE SEM JÖTT, miközben a napló ✅-t írt.
// Ez a „sikeres válasz ≠ elvégzett munka" lecke gépi őre.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  BUFFER_ENDPOINT, REEL_CSEMPE_MS,
  CREATE_POST_MUTATION, CSATORNAK_QUERY, POSZTOK_QUERY, SZERVEZET_QUERY,
  bufferGql, lekerSzervezet, lekerCsatornak, lekerPosztok,
  createPostInput, ertekelCreatePost, createPost
} from './buffer-api.js';
import { bufferProblemak, irBufferGuard, GUARD_FAJL } from './buffer-guard.js';
import { countSentToday } from './channel-cap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

// ⚠️ AZ ÉLES ŐRSZEM-FÁJLHOZ NEM NYÚLUNK. Minden guard-eset a saját ideiglenes
// gyökerében fut; a végén ellenőrizzük, hogy a valódi fájl bitre ugyanaz.
const VALODI_GUARD = join(REPO, 'memory', GUARD_FAJL);
const GUARD_EREDETI = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};
const at = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 Buffer GraphQL API-réteg — a HTTP 200 nem siker\n');

// ── A HAMIS FETCH ──────────────────────────────────────────────────
// Feljegyzi, mit küldtünk volna ki, és azt adja vissza, amit az eset kér.
// `status` alapból 200: a GraphQL API MINDIG ezt adja, a hibát is.
function hamisFetch(valaszok, { status = 200 } = {}) {
  const hivasok = [];
  const sor = Array.isArray(valaszok) ? valaszok.slice() : [valaszok];
  const f = async (url, opts) => {
    hivasok.push({ url, opts, body: JSON.parse(opts.body) });
    const v = sor.length > 1 ? sor.shift() : sor[0];
    if (v instanceof Error) throw v;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => v
    };
  };
  f.hivasok = hivasok;
  return f;
}

const SIKER = { data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'p1', status: 'sent' } } } };
const TOKEN = 'teszt-kulcs-nem-valodi';
const opts = f => ({ token: TOKEN, fetchFn: f });

// ===================================================================
// (a) SIKERES POSZT
// ===================================================================

await at('✅ (a) sikeres poszt: PostActionSuccess → { data }, és a poszt azonosítója megjön', async () => {
  const f = hamisFetch(SIKER);
  const r = await createPost({ channelId: 'ch1', text: 'Szia', channelKey: 'threads' }, opts(f));
  assert.equal(r.error, undefined, 'hibátlan válasz mellett nem lehet hiba');
  assert.equal(r.data.id, 'p1');
  assert.equal(f.hivasok.length, 1, 'pontosan egy kérés megy ki');
});

await at('📮 (a) a kérés alakja: POST az api.buffer.com-ra, Bearer-fejléccel, JSON-testtel', async () => {
  const f = hamisFetch(SIKER);
  await createPost({ channelId: 'ch1', text: 'Szia', channelKey: 'threads' }, opts(f));
  const h = f.hivasok[0];
  assert.equal(h.url, 'https://api.buffer.com/', 'a végpont nem az api.buffer.com');
  assert.equal(h.url, BUFFER_ENDPOINT, 'a modul saját végpont-konstansától eltér');
  assert.equal(h.opts.method, 'POST', 'a GraphQL MINDIG POST');
  assert.equal(h.opts.headers.Authorization, `Bearer ${TOKEN}`, 'nem Bearer-alakú a hitelesítés');
  assert.equal(h.opts.headers['Content-Type'], 'application/json');
  assert.ok(typeof h.body.query === 'string' && h.body.query.includes('createPost'), 'a test nem a mutációt viszi');
});

// ===================================================================
// (b) A LÉNYEG: MutationError HTTP 200-ban → HIBA, NEM SIKER
// ===================================================================

await at('🔴 (b) HTTP 200 + típusos hiba (InvalidInputError) → HIBA, nem siker', async () => {
  const f = hamisFetch({
    data: { createPost: { __typename: 'InvalidInputError', message: 'Instagram posts require a type' } }
  }, { status: 200 });
  const r = await createPost({ channelId: 'ch1', text: 'x', channelKey: 'instagram' }, opts(f));
  assert.equal(r.data, undefined, '🔴 a hibás választ SIKERNEK vette — ez a 2026-08-14-i néma bukás');
  assert.ok(r.error, 'nincs hibaüzenet');
  assert.match(r.error, /InvalidInputError/, 'a hiba TÍPUSA nem került bele');
  assert.match(r.error, /Instagram posts require a type/, 'a Buffer üzenete nem került bele');
});

t('🔴 (b) MINDEN nem-Success variáns hiba — a felsorolás nem maradhat hiányos', () => {
  const variansok = ['NotFoundError', 'UnauthorizedError', 'UnexpectedError',
    'RestProxyError', 'LimitReachedError', 'InvalidInputError'];
  for (const v of variansok) {
    const r = ertekelCreatePost({ data: { createPost: { __typename: v, message: 'baj' } } });
    assert.equal(r.data, undefined, `🔴 a ${v} SIKERNEK számított`);
    assert.match(r.error, new RegExp(v));
  }
});

t('🔴 (b) az ISMERETLEN variáns is hiba — a jövőbeli hibatípus ne váljon némán sikerré', () => {
  // A Buffer dokumentációja külön figyelmeztet: új hibatípusok jöhetnek
  // (VoidMutationError). Az alapértelmezés tehát NEM lehet „siker".
  const r = ertekelCreatePost({ data: { createPost: { __typename: 'ValamiUjHiba2027', message: 'ki tudja' } } });
  assert.equal(r.data, undefined, '🔴 egy ismeretlen típus sikernek számított');
  assert.match(r.error, /ValamiUjHiba2027/);
});

t('🔴 (b) a hiányzó válasz sem siker (üres data)', () => {
  assert.ok(ertekelCreatePost({ data: {} }).error, '🔴 az üres válasz sikernek számított');
  assert.ok(ertekelCreatePost({ data: null }).error, '🔴 a null válasz sikernek számított');
  assert.ok(ertekelCreatePost({}).error, '🔴 a semmi sikernek számított');
});

t('🔴 (b) a csupasz __typename nélküli „poszt" sem siker', () => {
  // Ez volt az eredeti hiba alakja: jött valami, tehát sikernek látszott.
  const r = ertekelCreatePost({ data: { createPost: { post: { id: 'p1' } } } });
  assert.equal(r.data, undefined, '🔴 __typename nélkül is sikernek vette');
});

await at('🔴 (b) a nem helyrehozható hiba (errors tömb) HTTP 200 mellett is hiba', async () => {
  // Élesben pontosan ez jött 2026-09-16-án a lejárt kulcsra.
  const f = hamisFetch({ data: null, errors: [{ message: 'Access token is not valid', extensions: { code: 'UNAUTHORIZED' } }] },
    { status: 200 });
  const r = await bufferGql('{ account { id } }', {}, opts(f));
  assert.equal(r.data, undefined);
  assert.match(r.error, /Access token is not valid/, 'a Buffer saját üzenete nem jutott tovább');
});

// ===================================================================
// (c) HIÁNYZÓ TOKEN → „ALSZIK, NEM HIBÁZIK"
// ===================================================================

await at('💤 (c) token nélkül EL SEM INDUL a kérés — se hálózat, se kivétel', async () => {
  const f = hamisFetch(SIKER);
  const r = await bufferGql(SZERVEZET_QUERY, {}, { token: '', fetchFn: f });
  assert.equal(f.hivasok.length, 0, '🔴 token nélkül is hálózatozott — pénzt és keretet égetne');
  assert.match(r.error, /BUFFER_ACCESS_TOKEN/, 'a hiányzó token OKÁT meg kell mondani');
  assert.equal(r.data, undefined);
});

await at('💤 (c) a csupa szóköz token is „nincs token" — nem próbálkozunk vele', async () => {
  const f = hamisFetch(SIKER);
  const r = await bufferGql(SZERVEZET_QUERY, {}, { token: '   ', fetchFn: f });
  assert.equal(f.hivasok.length, 0);
  assert.match(r.error, /BUFFER_ACCESS_TOKEN/);
});

t('💤 (c) a hiányzó token az őrszemben NINCS_TOKEN lelet — a riport ebből szól', () => {
  const p = bufferProblemak({ tokenVan: false, socialMappa: true, hibak: [], kikuldve: 0 });
  assert.ok(p.some(x => x.code === 'NINCS_TOKEN'), '🔴 a hiányzó token nem jut el a napi riportig');
});

await at('💤 (c) a poszter sem hibázik el token nélkül: createPost is csendben visszafordul', async () => {
  const f = hamisFetch(SIKER);
  const r = await createPost({ channelId: 'ch1', text: 'x', channelKey: 'threads' }, { token: '', fetchFn: f });
  assert.equal(f.hivasok.length, 0);
  assert.match(r.error, /BUFFER_ACCESS_TOKEN/);
});

// ===================================================================
// (d) TÖBB CSATORNA → CSATORNÁNKÉNT EGY MUTÁCIÓ
// ===================================================================

await at('📡 (d) három csatorna = HÁROM külön mutáció, mindegyik a SAJÁT channelId-jével', async () => {
  // ⚠️ EZ A REST→GraphQL VÁLTÁS LÉNYEGE. A régi REST `profile_ids[]` TÖMBÖT
  // fogadott, a GraphQL `channelId`-t, EGYES SZÁMBAN. Aki tömböt küld, annak
  // a posztja el sem indul.
  const f = hamisFetch(SIKER);
  const csatornak = [
    { id: 'ch-x', key: 'x' },
    { id: 'ch-threads', key: 'threads' },
    { id: 'ch-insta', key: 'instagram' }
  ];
  for (const c of csatornak) {
    await createPost({ channelId: c.id, text: 'Szia', channelKey: c.key, image: 'https://pelda.invalid/k.jpg' }, opts(f));
  }
  assert.equal(f.hivasok.length, 3, '🔴 nem csatornánként ment ki egy-egy mutáció');
  const kuldottIdk = f.hivasok.map(h => h.body.variables.input.channelId);
  assert.deepEqual(kuldottIdk, ['ch-x', 'ch-threads', 'ch-insta'], '🔴 nem a saját azonosítóját kapta minden csatorna');
  for (const h of f.hivasok) {
    assert.equal(typeof h.body.variables.input.channelId, 'string', '🔴 a channelId nem egyetlen azonosító');
    assert.equal(h.body.variables.input.channelIds, undefined, '🔴 visszakerült a régi REST-es channelIds tömb');
  }
});

t('📡 (d) a bemenet EGY csatornát fogad — tömböt sosem építünk', () => {
  const input = createPostInput({ channelId: 'ch1', text: 'x', channelKey: 'threads' });
  assert.equal(input.channelId, 'ch1');
  assert.ok(!Array.isArray(input.channelId), '🔴 a channelId tömb lett');
  assert.ok(!('channelIds' in input), '🔴 ott maradt a REST-es channelIds mező');
  assert.ok(!('profile_ids' in input), '🔴 ott maradt a REST-es profile_ids mező');
});

t('📡 (d) a mutáció szövege MINDEN hiba-variánst lekérdez — különben néma a bukás', () => {
  for (const v of ['PostActionSuccess', 'NotFoundError', 'UnauthorizedError',
    'UnexpectedError', 'RestProxyError', 'LimitReachedError', 'InvalidInputError']) {
    assert.ok(CREATE_POST_MUTATION.includes(`... on ${v}`), `🔴 hiányzik a mutációból: ${v}`);
  }
  assert.ok(CREATE_POST_MUTATION.includes('__typename'), '🔴 __typename nélkül nem tudjuk, mi jött vissza');
});

// ===================================================================
// A POSZT BEMENETE — a drágán megtanult mezők
// ===================================================================

t('🖼️ a kötelező mezők mind ott vannak (mode, schedulingType, needsApproval, assets)', () => {
  const i = createPostInput({ channelId: 'ch1', text: 'x', channelKey: 'threads' });
  assert.equal(i.mode, 'shareNow');
  assert.equal(i.schedulingType, 'automatic');
  assert.equal(i.needsApproval, false);
  assert.ok(Array.isArray(i.assets), '🔴 az assets NON_NULL — kép nélkül is ÜRES LISTA kell');
});

t('🖼️ kép esetén image-asset megy, videó esetén video-asset', () => {
  const kep = createPostInput({ channelId: 'c', text: 'x', image: 'https://pelda.invalid/k.jpg', channelKey: 'threads' });
  assert.deepEqual(kep.assets, [{ image: { url: 'https://pelda.invalid/k.jpg' } }]);
  const vid = createPostInput({ channelId: 'c', text: 'x', video: 'https://pelda.invalid/v.mp4', channelKey: 'instagram' });
  assert.equal(vid.assets[0].video.url, 'https://pelda.invalid/v.mp4');
});

t('🎬 a videó csempéje thumbnailOffset — a thumbnailUrl-t a Buffer ELUTASÍTJA', () => {
  // 2026-08-27, éles lecke: a mező SZEREPEL a sémában, mégis hibát ad.
  const i = createPostInput({ channelId: 'c', text: 'x', video: 'https://pelda.invalid/v.mp4', channelKey: 'instagram' });
  assert.equal(i.assets[0].video.metadata.thumbnailOffset, REEL_CSEMPE_MS);
  assert.ok(!('thumbnailUrl' in i.assets[0].video), '🔴 visszakerült a thumbnailUrl — a poszt el fog bukni');
  assert.ok(REEL_CSEMPE_MS > 0, '🔴 a 0 a legelső képkockára ülne, nem a horog-kártyára');
});

t('📸 az Instagram metaadatot követel — videónál reel, állóképnél post', () => {
  const reel = createPostInput({ channelId: 'c', text: 'x', video: 'https://pelda.invalid/v.mp4', channelKey: 'instagram' });
  assert.deepEqual(reel.metadata, { instagram: { type: 'reel', shouldShareToFeed: true } });
  const kep = createPostInput({ channelId: 'c', text: 'x', image: 'https://pelda.invalid/k.jpg', channelKey: 'instagram' });
  assert.equal(kep.metadata.instagram.type, 'post');
  // A többi csatorna NEM kap instagram-metaadatot.
  const th = createPostInput({ channelId: 'c', text: 'x', channelKey: 'threads' });
  assert.equal(th.metadata, undefined, '🔴 a Threads is instagram-metaadatot kapott');
});

// ===================================================================
// A LEKÉRDEZÉSEK
// ===================================================================

await at('🏢 a szervezet-lekérdezés az account.organizations utat járja', async () => {
  const f = hamisFetch({ data: { account: { organizations: [{ id: 'org1' }] } } });
  const r = await lekerSzervezet(opts(f));
  assert.equal(r.id, 'org1');
  assert.ok(SZERVEZET_QUERY.includes('organizations'), '🔴 nem az organizations utat kérdezzük');
  assert.ok(!SZERVEZET_QUERY.includes('currentOrganization'), '🔴 a currentOrganization FORBIDDEN ezzel a tokennel');
});

await at('🏢 szervezet nélküli fiók: beszédes hiba, nem néma undefined', async () => {
  const f = hamisFetch({ data: { account: { organizations: [] } } });
  const r = await lekerSzervezet(opts(f));
  assert.ok(r.error, '🔴 a hiányzó szervezet nem lett hiba');
});

await at('📡 a csatorna-lekérdezés SZŰRETLENÜL adja vissza a listát (az őrszemnek kell)', async () => {
  const f = hamisFetch({
    data: {
      channels: [
        { id: 'a', service: 'threads', name: 'aiworldhq', isDisconnected: false, isLocked: false },
        { id: 'b', service: 'instagram', name: 'aiworldhq', isDisconnected: true, isLocked: false }
      ]
    }
  });
  const r = await lekerCsatornak('org1', opts(f));
  assert.equal(r.csatornak.length, 2, '🔴 a levált csatornát némán kiszűrte — így láthatatlan marad');
  assert.equal(f.hivasok[0].body.variables.i.organizationId, 'org1');
  assert.ok(CSATORNAK_QUERY.includes('isDisconnected') && CSATORNAK_QUERY.includes('isLocked'),
    '🔴 a leválás jelzői nincsenek lekérdezve — az őrszem vakon marad');
});

await at('📊 a posztok szűrője a filter ALATT viszi a channelIds-t (a gyökérben hibát ad)', async () => {
  const f = hamisFetch({ data: { posts: { edges: [{ node: { status: 'sent', sentAt: new Date().toISOString() } }] } } });
  const r = await lekerPosztok({ organizationId: 'org1', channelId: 'ch1' }, opts(f));
  assert.equal(r.nodes.length, 1);
  const be = f.hivasok[0].body.variables.i;
  assert.deepEqual(be.filter.channelIds, ['ch1'], '🔴 nem a filter alatt megy a channelIds');
  assert.equal(be.channelIds, undefined, '🔴 a gyökérbe került — „Field channelIds is not defined by type PostsInput"');
  assert.ok(POSZTOK_QUERY.includes('status') && POSZTOK_QUERY.includes('sentAt'),
    '🔴 a napi darabszámhoz status + sentAt kell');
});

await at('🚦 a lekérdezés HIBÁJA nem 0, hanem „nem tudom" — különben a napi plafon némán kikapcsol', async () => {
  // A null és a 0 KÜLÖNBÖZŐ: a 0 azt jelenti, „ma még nem ment ki semmi".
  const f = hamisFetch({ errors: [{ message: 'Access token is not valid' }] });
  const r = await lekerPosztok({ organizationId: 'o', channelId: 'c' }, opts(f));
  assert.ok(r.error, '🔴 a hiba nem jött vissza hibaként');
  assert.equal(r.nodes, undefined, '🔴 hibára ÜRES LISTÁT adott — a hívó ebből 0-t számolna');
  // Így a poszter `sentTodayFor()`-ja null-t ad, és arra az allowedNow() bezár.
  assert.equal(countSentToday(r.nodes), null, '🔴 a hiányzó lista nem null-t adott');
});

await at('🚦 a VÁRATLAN ALAKÚ válasz sem 0 — a hiányzó posts.edges is „nem tudom"', async () => {
  // ⚠️ EZT A MUTÁCIÓS PRÓBA TALÁLTA MEG (2026-09-16): a hibás VÁLASZ-ALAK
  // külön ág, mint a hibaüzenet. Ha erre üres listát adnánk, a `countSentToday`
  // 0-t számolna — a napi plafon pedig NÉMÁN kikapcsolna, mert a „ma még nem
  // ment ki semmi" és a „fogalmam sincs" egyformán nézne ki.
  for (const valasz of [{ data: { posts: null } }, { data: {} }, { data: { posts: { edges: null } } }]) {
    const f = hamisFetch(valasz, { status: 200 });
    const r = await lekerPosztok({ organizationId: 'o', channelId: 'c' }, opts(f));
    assert.ok(r.error, '🔴 a hiányos válasz nem lett hiba: ' + JSON.stringify(valasz));
    assert.equal(r.nodes, undefined, '🔴 ÜRES LISTÁT adott — ebből 0 lenne, nem „nem tudom"');
    assert.equal(countSentToday(r.nodes), null, '🔴 a napi plafon némán kikapcsolna');
  }
});

await at('🌐 a hálózati kivétel sem dobhat tovább — { error }-ként jön vissza', async () => {
  const f = hamisFetch(new Error('fetch failed'));
  const r = await bufferGql(SZERVEZET_QUERY, {}, opts(f));
  assert.match(r.error, /fetch failed/, '🔴 a kivétel elveszett');
});

await at('🌐 a nem 200-as HTTP is hiba (ha a Buffer mégis azt adná)', async () => {
  const f = hamisFetch({}, { status: 503 });
  const r = await bufferGql(SZERVEZET_QUERY, {}, opts(f));
  assert.match(r.error, /503/);
});

// ===================================================================
// (e) AZ ŐRSZEM-FÁJL ALAKJA VÁLTOZATLAN — a napi riport ezt olvassa
// ===================================================================

const tmpGyoker = () => mkdtempSync(join(tmpdir(), 'buffer-api-'));

t('📓 (e) a buffer-guard.json alakja: { at, kikuldve, keres, csatornak, problems }', () => {
  const root = tmpGyoker();
  try {
    irBufferGuard(root, join, {
      tokenVan: true, socialMappa: true, csatornaLekerdezes: 'ok',
      csatornak: [], ismertCsatornak: ['threads'], hibak: [], kikuldve: 2, keres: 2
    });
    const g = JSON.parse(readFileSync(join(root, 'memory', GUARD_FAJL), 'utf-8'));
    assert.deepEqual(Object.keys(g).sort(), ['at', 'csatornak', 'keres', 'kikuldve', 'problems'],
      '🔴 megváltozott az őr-fájl mezőkészlete — a napi riport erre épül');
    assert.equal(typeof g.at, 'string');
    assert.ok(Array.isArray(g.problems) && Array.isArray(g.csatornak));
    assert.deepEqual(g.problems, [], 'gond nélküli futásnál üres a problems');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await at('🔗 (e) a MutationError UGYANÚGY a riportba jut, mint eddig a lejárt token 401-e', async () => {
  // EZ A TESZT KÖTI ÖSSZE A KÉT VÉGET: hamis fetch → createPost → őrszem-fájl.
  // Ha a HTTP 200-as hibát bárhol sikernek vennénk, itt ÜRES problems lenne.
  const f = hamisFetch({
    data: { createPost: { __typename: 'LimitReachedError', message: 'Queue limit reached' } }
  }, { status: 200 });
  const r = await createPost({ channelId: 'ch-threads', text: 'x', channelKey: 'threads' }, opts(f));
  assert.ok(r.error, '🔴 a 200-as hibát sikernek vette');

  const root = tmpGyoker();
  try {
    irBufferGuard(root, join, {
      tokenVan: true, socialMappa: true, csatornaLekerdezes: 'ok',
      csatornak: [], ismertCsatornak: ['threads'],
      hibak: [{ csatorna: 'threads', slug: 'valami-cikk', hiba: r.error }],
      kikuldve: 0, keres: 1
    });
    const g = JSON.parse(readFileSync(join(root, 'memory', GUARD_FAJL), 'utf-8'));
    assert.equal(g.problems.length, 1, '🔴 a bukott poszt nem jutott el a riportig');
    assert.equal(g.problems[0].code, 'POSZT_BUKOTT');
    assert.match(g.problems[0].detail, /LimitReachedError/, '🔴 a hiba TÍPUSA nem látszik a riportban');
    assert.equal(g.kikuldve, 0, '🔴 bukott poszt mellett „kiküldve" szám maradt');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await at('🔗 (e) a lejárt kulcs CSATORNA_LEKERDEZES_BUKOTT leletet ad, a Buffer üzenetével', async () => {
  const f = hamisFetch({ data: null, errors: [{ message: 'Access token is not valid' }] }, { status: 200 });
  const r = await lekerCsatornak('org1', opts(f));
  assert.ok(r.error);
  const p = bufferProblemak({
    tokenVan: true, socialMappa: true, csatornaLekerdezes: 'bukott',
    csatornaHiba: r.error, hibak: [], kikuldve: 0
  });
  assert.equal(p[0].code, 'CSATORNA_LEKERDEZES_BUKOTT');
  assert.match(p[0].detail, /Access token is not valid/, '🔴 a valódi OK nem jut el a userhez');
});

// ===================================================================
// BE VAN-E KÖTVE? (a poszter nem importálható — ezért szöveg-ellenőrzés)
// ===================================================================

const POSZTER = readFileSync(join(REPO, 'agents', 'social', 'buffer-poster.js'), 'utf-8');
const POSZTER_KOD = POSZTER.split(/\r?\n/).filter(s => !/^\s*\/\//.test(s)).join('\n');

t('🔌 a poszter a KÖZÖS API-réteget hívja, nem tart saját másolatot', () => {
  assert.match(POSZTER_KOD, /from '\.\.\/\.\.\/core\/buffer-api\.js'/, '🔴 nincs behúzva a core/buffer-api.js');
  // ⚠️ A puszta import KEVÉS: a mutációs próba mutatta ki, hogy a hívást ki
  // lehet cserélni beírt másolatra úgy, hogy az import-sor ott marad.
  assert.ok(!/const ENDPOINT\s*=/.test(POSZTER_KOD), '🔴 visszakerült a saját végpont-konstans');
  assert.ok(!/await fetch\(ENDPOINT/.test(POSZTER_KOD), '🔴 visszakerült a saját fetch-hívás');
  assert.ok(!/__typename !== 'PostActionSuccess'/.test(POSZTER_KOD),
    '🔴 visszakerült a saját válasz-értékelés — két helyen fog szétcsúszni');
  assert.match(POSZTER_KOD, /createPostApi\(args, api\(\)\)/, '🔴 nem a közös createPost küldi a posztot');
});

t('🔌 a poszter a régi REST API-t SEHOL nem hívja', () => {
  // ⚠️ A KOMMENTEKET KISZŰRJÜK (ugyanaz az elv, mint a test-hygiene-nél): a
  // fájl fejlécében LE KELL TUDNI ÍRNI, hogy a régi REST API 2027-02-01-én
  // megszűnik, anélkül hogy a saját őrünk elbuktatná érte.
  assert.ok(!/bufferapp/.test(POSZTER_KOD), '🔴 visszakerült a 2027-02-01-én nyugdíjazott REST API');
});

// ===================================================================
// AZ ÉLES FÁJL ÉRINTETLEN
// ===================================================================

t('🔒 a valódi memory/buffer-guard.json érintetlen maradt', () => {
  const most = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;
  assert.equal(most, GUARD_EREDETI, '🔴 a teszt beleírt az ÉLES őrszem-fájlba');
});

console.log(bukott === 0
  ? '\n✅ buffer-api.test: mind a ' + pass + ' eset rendben'
  : '\n❌ buffer-api.test: ' + bukott + ' bukott (' + pass + ' rendben)');
process.exit(bukott === 0 ? 0 : 1);
