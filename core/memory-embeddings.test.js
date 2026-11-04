// ===================================================================
// TESZT — a memória beágyazás-vektorai KÜLÖN gyorsítótárban (2026-09-06)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL — a gyökérok, igazolva (ugyanannak a CI-futásnak
// két commitja):
//     8cd53e0a  02:02:54  memory/store.json = 6 379 702 bájt · 212 vektor
//     a8fd5f08  02:12:40  memory/store.json =   318 783 bájt ·   0 vektor
// Közte egyetlen dolog fut, ami vektort töröl: a Házmester. A
// `stripEmbeddings()` az `embedText('ping')`-gel kérdezte meg, „él-e a
// szolgáltatás" — csakhogy a Házmester lépésnek NINCS `env:` blokkja, tehát
// ott kulcs nélkül MINDIG „halott" a válasz. A `recallSemantic()` viszont a
// következő futásban újra beágyazott és MENTETT. Vagyis a vektorok MINDEN
// futásban megszülettek és MINDEN futásban törlődtek, 12 napja.
//
// 🔑 A rossz kérdés: nem az, hogy „halott-e a szolgáltatás", hanem hogy
// „én, itt, most, tudok-e beágyazni". Egy kulcs nélküli lépésben ez nem
// ugyanaz. (Ugyanez az alak volt az `embed-guard.js`-ben is — javítva.)
//
// A MEGOLDÁS a `core/topic-dedup.js` MŰKÖDŐ mintája: a vektor KÜLÖN,
// gitignore-olt gyorsítótár-fájlba megy, és a gyorsítótár tudja, MELYIK
// SZOLGÁLTATÓ MELYIK DIMENZIÓJÚ terében készült. Eltérésnél tévesztés és
// újraszámolás — mert a `cosineSim()` eltérő hosszra NÉMÁN 0-t ad, ami
// „nem hasonló"-nak látszik, pedig „nem tudom".
//
// ⚠️ AZ ÉLES `memory/store.json`-t ÉS `memory/memory-embeddings.json`-t ez a
// teszt NEM ÉRINTI: mindkettő útvonala környezeti változóval felülírható, és
// a fájl végén BÁJTRA igazoljuk, hogy változatlanok maradtak.
// ⚠️ AZ ÉRTÉKADÁS AZ IMPORT ELŐTT KELL — a statikus `import` felülemelkedik a
// kódon, ezért DINAMIKUS az import alább.
// ⚠️ `fileURLToPath`, NEM `.pathname`: Windowson az utóbbi „/C:/AI%20work/…"-et
// ad, amitől az `existsSync` némán hamisat mond — és a záró őr hallgatna.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { tmpdir } from 'os';

const ELES_STORE = fileURLToPath(new URL('../memory/store.json', import.meta.url));
const ELES_CACHE = fileURLToPath(new URL('../memory/memory-embeddings.json', import.meta.url));
const GITIGNORE = fileURLToPath(new URL('../.gitignore', import.meta.url));
// Bájtra: Bufferként olvasunk, hogy a sorvég se csúszhasson el észrevétlenül.
const ELES_STORE_ELOTTE = existsSync(ELES_STORE) ? readFileSync(ELES_STORE) : null;
const ELES_CACHE_ELOTTE = existsSync(ELES_CACHE) ? readFileSync(ELES_CACHE) : null;
const ELES_SEMANTIC = fileURLToPath(new URL('../memory/semantic-guard.json', import.meta.url));
const ELES_SEMANTIC_ELOTTE = existsSync(ELES_SEMANTIC) ? readFileSync(ELES_SEMANTIC) : null;

const MUNKA = join(tmpdir(), 'aiworld-mem-embed-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const TESZT_STORE = join(MUNKA, 'store.json');
const TESZT_CACHE = join(MUNKA, 'memory-embeddings.json');
process.env.MEMORY_STORE_PATH = TESZT_STORE;
process.env.MEMORY_EMBED_CACHE_PATH = TESZT_CACHE;
// ⚠️ 2026-09-07: a `recallSemantic()` AZÓTA LEMEZRE IS ÍRJA a mérleget
// (`core/semantic-guard.js`) — enélkül ez a teszt az ÉLES
// `memory/semantic-guard.json`-t hozta létre `provider: "teszt"`, `dim: 8`
// tartalommal. Élesben megtörtént, egy teljes tesztfuttatás után.
// 🔑 ÚJ ÍRÁSI ÚT = ÚJ ÚTVONAL-FELÜLÍRÁS. Ha egy modul új helyre kezd írni,
// MINDEN tesztjében külön kell terelni — a meglévő két felülírás nem véd meg tőle.
process.env.SEMANTIC_GUARD_PATH = join(MUNKA, 'semantic-guard.json');

const { recallSemantic, szemantikusAllapot, purgeStoreEmbeddings } = await import('./memory-manager.js');
const { cacheBetolt, cacheOlvas, cacheIr, cacheMent, ujjlenyomat } = await import('./memory-embeddings.js');

let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e && e.message).split('\n')[0]); }
};

// ── ÁL-BEÁGYAZÓ ──────────────────────────────────────────────────────
// Determinisztikus „jelentés-vektor" néhány kulcsszóra. A `dim` a
// SZOLGÁLTATÓ TERÉT utánozza; a `hibas` lista azokat a szövegeket, amikre a
// beágyazás elhasal (null = „nem tudom", NEM „nem hasonló").
const KULCSOK = ['meeting', 'email', 'budget', 'photo', 'recipe', 'travel', 'music'];
function alEmbed({ dim = 8, hibas = [], szamlalo = { n: 0 } } = {}) {
  const fn = async (szoveg) => {
    const s = String(szoveg || '').toLowerCase();
    if (hibas.some(h => s.includes(h))) return null;
    szamlalo.n++;
    const v = KULCSOK.map(k => (s.includes(k) ? 1 : 0));
    while (v.length < dim) v.push(0.01);
    return v.slice(0, dim);
  };
  fn.szamlalo = szamlalo;
  return fn;
}

const most = () => new Date().toISOString();
const emlek = (id, text, extra = {}) => ({
  id, scope: 'iro', text, tags: [], created: most(), lastAccessed: most(),
  accessCount: 0, salience: 1, tier: 'hot', ...extra
});
function tarBeallit(items) {
  writeFileSync(TESZT_STORE, JSON.stringify({ _meta: {}, items }, null, 2), 'utf-8');
}
const tarOlvas = () => JSON.parse(readFileSync(TESZT_STORE, 'utf-8'));
const cacheOlvasFajl = () => JSON.parse(readFileSync(TESZT_CACHE, 'utf-8'));

const M1 = 'meeting notes into action plans';
const M2 = 'budget planning for the week';
const M3 = 'recipe ideas for dinner';

console.log('🧪 memória-beágyazás gyorsítótár');

// ───────────────────────────────────────────────────────────────────
// 1) CACHE ÍRÁS / OLVASÁS — a vektor a KÜLÖN fájlba megy, és másodszorra
//    már NEM kell újra beágyazni.
// ───────────────────────────────────────────────────────────────────
await t('1a) az első futás beágyaz és a KÜLÖN cache-fájlba ír', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  rmSync(TESZT_CACHE, { force: true });

  const e = alEmbed();
  const r = await recallSemantic('meeting notes', { scope: 'iro', embedFn: e, provider: 'teszt' });

  assert.ok(r.length > 0, 'van találat');
  assert.equal(r[0].text, M1, 'a jelentésben közeli emlék az első');
  assert.equal(r[0]._semantic, true, 'szemantikus ágon jött');
  assert.equal(e.szamlalo.n, 3, '1 kérdés + 2 emlék beágyazása');
  assert.ok(existsSync(TESZT_CACHE), 'létrejött a gyorsítótár-fájl');
});

await t('1b) a cache tudja a SZOLGÁLTATÓT és a DIMENZIÓT is, nem csak a vektort', () => {
  const c = cacheOlvasFajl();
  assert.equal(c._meta.provider, 'teszt', 'fejlécben a szolgáltató');
  assert.equal(c._meta.dim, 8, 'fejlécben a dimenzió');
  assert.equal(Object.keys(c.items).length, 2, 'két emlék vektora');
  const be = c.items.m1;
  assert.equal(be.p, 'teszt', 'bejegyzésenként is ott a szolgáltató');
  assert.equal(be.d, 8, 'bejegyzésenként is ott a dimenzió');
  assert.equal(be.v.length, 8, 'a vektor hossza egyezik a jelölt dimenzióval');
  assert.equal(be.h, ujjlenyomat(M1), 'a szöveg ujjlenyomata is benne van');
});

await t('1c) a második futás CSAK a kérdést ágyazza be (a cache használ)', async () => {
  const e = alEmbed();
  const r = await recallSemantic('meeting notes', { scope: 'iro', embedFn: e, provider: 'teszt' });
  assert.equal(e.szamlalo.n, 1, 'egyetlen beágyazás: a kérdés');
  assert.equal(r[0].text, M1, 'a találat ugyanaz maradt');
  const a = szemantikusAllapot();
  assert.equal(a.cache, 2, 'két emlék jött a gyorsítótárból');
  assert.equal(a.beagyazva, 0, 'nem kellett újraszámolni');
  assert.equal(a.kihagyott, 0, 'senki nem maradt ki');
});

// ───────────────────────────────────────────────────────────────────
// 2) DIMENZIÓ-ELTÉRÉS → ÚJRASZÁMOLÁS
//    A `cosineSim()` eltérő hosszra NÉMÁN 0-t ad. Ha ezt elfogadnánk, a régi
//    vektorok mindenre „nem hasonló"-t mondanának — csendes vakság.
// ───────────────────────────────────────────────────────────────────
await t('2) más dimenzió = gyorsítótár-tévesztés, minden vektor újraszámolódik', async () => {
  // ⚠️ A `g1` MÁS SCOPE-ban van, tehát ebben a hívásban SOHA nem számolódik
  // újra — ÉS ÉPP EZÉRT VAN ITT. A felülírt bejegyzéseken nem látszana, hogy a
  // FEJLÉC-szintű ellenőrzés dobta-e ki a régi teret, vagy csak az egyenkénti
  // olvasás téveszt: a mutációs próbában e nélkül két mutáns átcsúszott.
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('g1', M3, { scope: 'guide' })]);
  writeFileSync(TESZT_CACHE, JSON.stringify({
    _meta: { provider: 'teszt', dim: 8 },
    items: {
      m1: { v: [1, 0, 0, 0, 0, 0, 0, 0.01], p: 'teszt', d: 8, h: ujjlenyomat(M1) },
      m2: { v: [0, 0, 1, 0, 0, 0, 0, 0.01], p: 'teszt', d: 8, h: ujjlenyomat(M2) },
      g1: { v: [0, 0, 0, 0, 1, 0, 0, 0.01], p: 'teszt', d: 8, h: ujjlenyomat(M3) }
    }
  }, null, 2), 'utf-8');

  const e = alEmbed({ dim: 4 });
  const r = await recallSemantic('meeting notes', { scope: 'iro', embedFn: e, provider: 'teszt' });
  assert.equal(e.szamlalo.n, 3, 'kérdés + mindkét iro-emlék ÚJRA beágyazva');
  assert.equal(r[0].text, M1, 'a találat NEM veszett el');
  const c = cacheOlvasFajl();
  assert.equal(c._meta.dim, 4, 'a fejléc az új dimenzióra állt');
  assert.ok(!('g1' in c.items), 'a régi tér bejegyzése KIESETT a fájlból (nem csak olvasáskor tévesztünk)');
  for (const be of Object.values(c.items)) assert.equal(be.v.length, 4, 'nem maradt régi hosszúságú vektor');
});

// ───────────────────────────────────────────────────────────────────
// 3) SZOLGÁLTATÓ-VÁLTÁS → A RÉGI CACHE NEM MÉRGEZ
//    Ugyanaz a dimenzió, MÁS tér: a hosszellenőrzés önmagában NEM fogja meg.
//    Ez a `topic-dedup.js` 2026-08-25-i leckéje.
// ───────────────────────────────────────────────────────────────────
await t('3) szolgáltató-váltás után a régi vektor NEM ad néma 0 hasonlóságot', async () => {
  // A `g1` itt is a MÁS SCOPE-os tanú: őt semmi nem írja felül, tehát csak a
  // fejléc-ellenőrzés takaríthatja ki. Nélküle a mutáns átcsúszik.
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('g1', M3, { scope: 'guide' })]);
  // MÉRGEZETT gyorsítótár: 8 dimenzió (mint az új), de a régi szolgáltató
  // teréből — az irány értelmetlen az újban, a hossz-ellenőrzés meg NEM fogja meg.
  writeFileSync(TESZT_CACHE, JSON.stringify({
    _meta: { provider: 'regi-szolgaltato', dim: 8 },
    items: {
      m1: { v: [0, 0, 0, 0, 0, 0, 0, 1], p: 'regi-szolgaltato', d: 8, h: ujjlenyomat(M1) },
      m2: { v: [0, 0, 0, 0, 0, 0, 0, 1], p: 'regi-szolgaltato', d: 8, h: ujjlenyomat(M2) },
      g1: { v: [0, 0, 0, 0, 0, 0, 0, 1], p: 'regi-szolgaltato', d: 8, h: ujjlenyomat(M3) }
    }
  }, null, 2), 'utf-8');

  const e = alEmbed();
  const r = await recallSemantic('meeting notes', { scope: 'iro', embedFn: e, provider: 'uj-szolgaltato' });
  assert.equal(e.szamlalo.n, 3, 'a régi szolgáltató vektorait ÚJRASZÁMOLJUK');
  assert.equal(r[0].text, M1, 'a jelentésben közeli emlék MEGVAN (nem esett 0-ra)');
  const c = cacheOlvasFajl();
  assert.equal(c._meta.provider, 'uj-szolgaltato', 'a fejléc az új szolgáltatóra állt');
  assert.equal(c.items.m1.p, 'uj-szolgaltato', 'a bejegyzés is');
  assert.ok(!('g1' in c.items), 'a régi szolgáltató bejegyzése KIESETT — a fájl nem kevert terű');
  for (const be of Object.values(c.items)) {
    assert.equal(be.p, 'uj-szolgaltato', 'a fejléc nem hazudhat a tartalomról');
  }
});

// ───────────────────────────────────────────────────────────────────
// 4) SÉRÜLT / HIÁNYZÓ CACHE — soha nem dob, csak tévesztés
// ───────────────────────────────────────────────────────────────────
await t('4a) hiányzó cache-fájl: üres gyorsítótár, nem kivétel', () => {
  rmSync(TESZT_CACHE, { force: true });
  const c = cacheBetolt('teszt', 8);
  assert.deepEqual(c.items, {}, 'üres');
});

await t('4b) sérült JSON: üres gyorsítótár, nem kivétel', () => {
  writeFileSync(TESZT_CACHE, '{ ez nem jaszon', 'utf-8');
  const c = cacheBetolt('teszt', 8);
  assert.deepEqual(c.items, {}, 'üres');
});

await t('4c) szemét bejegyzések: egyenként tévesztés, nem kivétel', () => {
  writeFileSync(TESZT_CACHE, JSON.stringify({
    _meta: { provider: 'teszt', dim: 8 },
    items: {
      jo: { v: [1, 0, 0, 0, 0, 0, 0, 0.01], p: 'teszt', d: 8, h: ujjlenyomat('jo') },
      nemTomb: { v: 'szoveg', p: 'teszt', d: 8, h: ujjlenyomat('nemTomb') },
      rovid: { v: [1, 2], p: 'teszt', d: 8, h: ujjlenyomat('rovid') },
      hazudosD: { v: [1, 0, 0, 0, 0, 0, 0, 0], p: 'teszt', d: 99, h: ujjlenyomat('hazudosD') },
      ures: null
    }
  }, null, 2), 'utf-8');
  const c = cacheBetolt('teszt', 8);
  assert.ok(cacheOlvas(c, 'jo', 'jo', 'teszt', 8), 'a jó bejegyzés megvan');
  for (const k of ['nemTomb', 'rovid', 'hazudosD', 'ures']) {
    assert.equal(cacheOlvas(c, k, k, 'teszt', 8), null, `a sérült "${k}" tévesztés`);
  }
});

await t('4d) sérült cache-szel a recallSemantic is végigmegy', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  writeFileSync(TESZT_CACHE, 'nem json egyáltalán', 'utf-8');
  const e = alEmbed();
  const r = await recallSemantic('meeting notes', { scope: 'iro', embedFn: e, provider: 'teszt' });
  assert.equal(r[0].text, M1, 'a keresés működik');
  assert.equal(e.szamlalo.n, 3, 'mindent újraszámolt');
});

await t('4e) a szöveg megváltozása (stabil kulcs) újraszámolást vált ki', async () => {
  // A `remember()` a stabil `kulcs` mellett ÁTÍRJA az emlék szövegét — a régi
  // szöveg vektora ilyenkor hazugság lenne. Az ujjlenyomat fogja meg.
  const c = cacheBetolt('teszt', 8);
  cacheIr(c, 'mX', 'eredeti szöveg', [1, 0, 0, 0, 0, 0, 0, 0.01], 'teszt');
  assert.ok(cacheOlvas(c, 'mX', 'eredeti szöveg', 'teszt', 8), 'változatlan szövegre találat');
  assert.equal(cacheOlvas(c, 'mX', 'ÁTÍRT szöveg', 'teszt', 8), null, 'átírt szövegre tévesztés');
});

await t('4f) a cacheMent SOHA nem dob (írhatatlan út esetén sem)', () => {
  const c = { items: { a: { v: [1], p: 'x', d: 1, h: 'h' } } };
  assert.doesNotThrow(() => cacheMent(c, 'x', 1, join(MUNKA, 'nincs-ilyen-mappa', 'x', 'c.json')));
});

// ───────────────────────────────────────────────────────────────────
// 5) A store.json TISZTA SZÖVEGTÁR MARAD
// ───────────────────────────────────────────────────────────────────
await t('5a) a szemantikus keresés NEM ír `embedding` mezőt a store.json-ba', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  rmSync(TESZT_CACHE, { force: true });
  await recallSemantic('meeting notes', { scope: 'iro', embedFn: alEmbed(), provider: 'teszt' });
  const s = tarOlvas();
  assert.ok(s.items.every(it => !('embedding' in it)), 'egyetlen emléken sincs vektor');
  assert.ok(!readFileSync(TESZT_STORE, 'utf-8').includes('"embedding"'), 'a fájl szövegében sincs');
});

await t('5b) a RÉGI, store.json-ban ragadt vektorokat egyszer kitakarítjuk', () => {
  tarBeallit([
    emlek('m1', M1, { embedding: Array(1024).fill(0.123456) }),
    emlek('m2', M2, { embedding: Array(1024).fill(0.654321) }),
    emlek('m3', M3)
  ]);
  const r = purgeStoreEmbeddings();
  assert.equal(r.n, 2, 'két elemről szedtük le');
  assert.ok(r.utana < r.elotte, `zsugorodott (${r.elotte} → ${r.utana} bájt)`);
  const s = tarOlvas();
  assert.ok(s.items.every(it => !('embedding' in it)), 'egy sem maradt');
});

await t('5c) a takarítás idempotens — másodszorra nincs teendő és nem ír', () => {
  const elotte = readFileSync(TESZT_STORE, 'utf-8');
  const r = purgeStoreEmbeddings();
  assert.equal(r.n, 0, 'nincs mit takarítani');
  assert.equal(readFileSync(TESZT_STORE, 'utf-8'), elotte, 'a fájl bájtra ugyanaz (az `updated` sem mozdult)');
});

// ───────────────────────────────────────────────────────────────────
// 6) A RÉSZLEGES BEÁGYAZÁSI HIBA NEM LEHET NÉMA
//    „A NEM TUDOM nem RENDBEN VAN." Ma a `if (v)` + a `filter()` némán
//    elnyelte, hogy egy emlék kimaradt a keresésből.
// ───────────────────────────────────────────────────────────────────
await t('6a) a kimaradt emlékek MEG VANNAK SZÁMOLVA', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('m3', M3)]);
  rmSync(TESZT_CACHE, { force: true });
  const r = await recallSemantic('meeting notes', {
    scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['budget', 'recipe'] })
  });
  const a = szemantikusAllapot();
  assert.equal(a.osszes, 3, 'három emlék jött szóba');
  assert.equal(a.kihagyott, 2, 'kettő beágyazása nem sikerült');
  assert.equal(a.beagyazva, 1, 'egy sikerült');
  assert.ok(a.at, 'van időbélyeg');
  assert.equal(a.provider, 'teszt');
  assert.equal(a.dim, 8);
  assert.equal(r.length, 1, 'csak a beágyazott emlék kerülhet a találatok közé');
});

await t('6b) …és HANGOSAN szól róla (nem csak a belső állapotban)', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('m3', M3)]);
  rmSync(TESZT_CACHE, { force: true });
  const uzenetek = [];
  const eredetiWarn = console.warn, eredetiLog = console.log;
  console.warn = (...x) => uzenetek.push(x.join(' '));
  console.log = () => {};
  try {
    await recallSemantic('meeting notes', {
      scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['budget', 'recipe'] })
    });
  } finally { console.warn = eredetiWarn; console.log = eredetiLog; }
  assert.ok(uzenetek.length > 0, 'megszólalt');
  assert.ok(uzenetek.join(' ').includes('2'), 'a darabszám is kimegy');
});

await t('6c) hibátlan futásnál CSENDBEN marad', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  rmSync(TESZT_CACHE, { force: true });
  const uzenetek = [];
  const eredetiWarn = console.warn;
  console.warn = (...x) => uzenetek.push(x.join(' '));
  try {
    await recallSemantic('meeting notes', { scope: 'iro', provider: 'teszt', embedFn: alEmbed() });
  } finally { console.warn = eredetiWarn; }
  assert.equal(uzenetek.length, 0, 'nincs fölösleges zaj');
  assert.equal(szemantikusAllapot().kihagyott, 0);
});

await t('6d) ha a KÉRDÉS beágyazása bukik, kulcsszavas tartalékra esünk', async () => {
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  const r = await recallSemantic('meeting notes', {
    scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['meeting notes'] })
  });
  assert.ok(r.length > 0, 'a tartalék hozott találatot');
  assert.ok(!r[0]._semantic, 'és NEM szemantikusnak jelöli magát');
});

await t('6e) a mérleg MINDIG a mostani hívásról szól (nem ragad benne a korábbi)', async () => {
  // Előbb egy „gazdag" futás, ami tele írja az állapotot…
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('m3', M3)]);
  rmSync(TESZT_CACHE, { force: true });
  await recallSemantic('meeting notes', {
    scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['recipe'] })
  });
  assert.equal(szemantikusAllapot().kihagyott, 1, 'az első futás mérlege');

  // …majd egy tartalékra futó hívás. Az ELŐZŐ számok NEM maradhatnak bent:
  // úgy néznének ki, mintha ezt a hívást írnák le.
  await recallSemantic('meeting notes', {
    scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['meeting notes'] })
  });
  const a = szemantikusAllapot();
  assert.equal(a.kihagyott, 0, 'nem ragadt bent a korábbi szám');
  assert.equal(a.osszes, 0, 'sem az összesítés');
  assert.equal(a.tartalek, 'nincs kérdés-vektor', 'és MEGMONDJA, miért esett tartalékra');
});

// ───────────────────────────────────────────────────────────────────
// 7) A GITIGNORE-MINTA — a fájl LÉTE nem bizonyíték, de a HIÁNYA az.
// ───────────────────────────────────────────────────────────────────
await t('7) a .gitignore PONTOS mintát tart az új cache-fájlra', () => {
  const gi = readFileSync(GITIGNORE, 'utf-8');
  assert.ok(/^memory\/memory-embeddings\.json\s*$/m.test(gi),
    'pontos minta (nem az egész memory/ mappa — a többi fájlja KÖVETETT)');
  assert.ok(!/^memory\/\s*$/m.test(gi), 'a memory/ mappa NINCS egészben kizárva');
});

// ───────────────────────────────────────────────────────────────────
// 🔒 ZÁRÓ ŐR — az ÉLES fájlok bájtra változatlanok
// ───────────────────────────────────────────────────────────────────
await t('🔒 az éles memory/store.json bájtra változatlan', () => {
  const utana = existsSync(ELES_STORE) ? readFileSync(ELES_STORE) : null;
  if (ELES_STORE_ELOTTE === null) { assert.equal(utana, null, 'nem is hoztuk létre'); return; }
  assert.ok(utana && utana.equals(ELES_STORE_ELOTTE), '🔴 A TESZT BELEÍRT AZ ÉLES MEMÓRIA-TÁRBA!');
});

await t('🔒 az éles memory/memory-embeddings.json bájtra változatlan', () => {
  const utana = existsSync(ELES_CACHE) ? readFileSync(ELES_CACHE) : null;
  if (ELES_CACHE_ELOTTE === null) {
    assert.equal(utana, null, '🔴 A TESZT LÉTREHOZTA AZ ÉLES BEÁGYAZÁS-CACHE-T!');
    return;
  }
  assert.ok(utana && utana.equals(ELES_CACHE_ELOTTE), '🔴 A TESZT BELEÍRT AZ ÉLES BEÁGYAZÁS-CACHE-BE!');
});

// ⚠️ 2026-09-07, MUTÁCIÓVAL KIMÉRVE. A `recallSemantic()` ezen a napon kapott
// EGY ÚJ ÍRÁSI UTAT (`memory/semantic-guard.json`), és ez a teszt azonnal az
// ÉLES fájlt hozta létre `provider: "teszt"` tartalommal. A fenti két záró őr
// NEM fogta meg — más fájlt néztek. Kipróbálva: a felülírás eltávolítása után
// az éles fájl LÉTREJÖTT, és MIND A 78 TESZT ZÖLD MARADT.
//
// 🔑 EGY ÚJ ÍRÁSI ÚT NEM CSAK ÚJ FELÜLÍRÁST KÍVÁN, HANEM ÚJ ZÁRÓ ŐRT IS.
// A meglévő őrök pontosan annyit védenek, amennyit néznek — a hallgatásuk
// nem bizonyíték egy olyan fájlról, amiről nem tudnak.
await t('🔒 az éles memory/semantic-guard.json érintetlen', () => {
  const utana = existsSync(ELES_SEMANTIC) ? readFileSync(ELES_SEMANTIC) : null;
  if (ELES_SEMANTIC_ELOTTE === null) {
    assert.equal(utana, null, '🔴 A TESZT LÉTREHOZTA AZ ÉLES SZEMANTIKUS ŐRSZEM-FÁJLT!');
    return;
  }
  assert.ok(utana && utana.equals(ELES_SEMANTIC_ELOTTE), '🔴 A TESZT BELEÍRT AZ ÉLES ŐRSZEM-FÁJLBA!');
});

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* takarítás nem kritikus */ }

console.log(`\n${bukott === 0 ? '✅' : '❌'} memory-embeddings.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
