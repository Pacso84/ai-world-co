// ===================================================================
// TESZT — memória-keresés-őr (2026-09-06)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL. A `core/memory-manager.js` `szemantikusAllapot()`-ja
// PONTOSAN tudta, hány emlék maradt ki a keresésből („a NEM TUDOM nem NEM
// HASONLÓ"), és hangosan ki is írta — a CI naplójába. A saját kommentje mondta
// ki: „EGYELŐRE A CI-NAPLÓIG JUT EL". A projekt kemény szabálya szerint viszont
// AZ ŐRSZEM CSAK AKKOR ŐR, HA ODASZÓL, AHOL A USER NÉZ; a CI-naplóba írni
// annyi, mintha senkinek nem szólnál.
//
// Ez pontosan az `embedStatus()` 2026-08-30-ig tartó hibája: folyamat-lokális
// `let` változó, aminek a kommentje szerint „a napi riport kiírja", miközben
// a riport KÜLÖN PROCESSZ, tehát soha nem is láthatta volna.
//
// 🔑 ÉS AMIT AZ `embed-guard.js` NEM FOG MEG: ott a kérdés az, hogy „van-e
// egyáltalán beágyazás". Itt az, hogy „MINDEN emléket sikerült-e beágyazni".
// Egy 429-es sebességkorlát közepén az `embedText()` UTOLSÓ hívása sikeres
// lehet (embed-guard: zöld), miközben a memória fele kimaradt a promptból.
//
// ⚠️ AZ ÉLES `memory/`-t ez a teszt NEM ÉRINTI: minden útvonal környezeti
// változóval felül van írva, és a fájl végén BÁJTRA igazoljuk.
// ⚠️ AZ ÉRTÉKADÁS AZ IMPORT ELŐTT KELL — a statikus `import` felülemelkedik a
// kódon, ezért DINAMIKUS minden import alább.
// ⚠️ `fileURLToPath`, NEM `.pathname`: Windowson az utóbbi „/C:/AI%20work/…"-et
// ad, amitől az `existsSync` némán hamisat mond — és a záró őr hallgatna.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import { tmpdir } from 'os';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const ELES_GUARD = join(REPO, 'memory', 'semantic-guard.json');
const ELES_STORE = join(REPO, 'memory', 'store.json');
const ELES_CACHE = join(REPO, 'memory', 'memory-embeddings.json');
// Bájtra: Bufferként olvasunk, hogy a sorvég se csúszhasson el észrevétlenül.
const ELOTTE = {
  guard: existsSync(ELES_GUARD) ? readFileSync(ELES_GUARD) : null,
  store: existsSync(ELES_STORE) ? readFileSync(ELES_STORE) : null,
  cache: existsSync(ELES_CACHE) ? readFileSync(ELES_CACHE) : null
};

const MUNKA = join(tmpdir(), 'aiworld-szemantikus-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const TESZT_GUARD = join(MUNKA, 'semantic-guard.json');
const TESZT_STORE = join(MUNKA, 'store.json');
const TESZT_CACHE = join(MUNKA, 'memory-embeddings.json');
process.env.SEMANTIC_GUARD_PATH = TESZT_GUARD;
process.env.MEMORY_STORE_PATH = TESZT_STORE;
process.env.MEMORY_EMBED_CACHE_PATH = TESZT_CACHE;

const {
  GUARD_FAJL, szemantikusProblemak, kellIrniSzemantikus, jegyezSzemantikus, szemantikusSor
} = await import('./semantic-guard.js');
const { recallSemantic } = await import('./memory-manager.js');

let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e && e.message).split('\n')[0]); }
};

const guardOlvas = () => JSON.parse(readFileSync(TESZT_GUARD, 'utf-8'));
const guardTorol = () => { try { rmSync(TESZT_GUARD, { force: true }); } catch { /* */ } };

// ── ÁL-BEÁGYAZÓ (a memory-embeddings.test.js mintája) ────────────────
// A `hibas` lista azokat a szövegeket sorolja, amikre a beágyazás elhasal:
// `null` = „nem tudom", NEM „nem hasonló".
const KULCSOK = ['meeting', 'email', 'budget', 'photo', 'recipe'];
const alEmbed = ({ dim = 8, hibas = [] } = {}) => async (szoveg) => {
  const s = String(szoveg || '').toLowerCase();
  if (hibas.some(h => s.includes(h))) return null;
  const v = KULCSOK.map(k => (s.includes(k) ? 1 : 0));
  while (v.length < dim) v.push(0.01);
  return v.slice(0, dim);
};

const most = () => new Date().toISOString();
const emlek = (id, text) => ({
  id, scope: 'iro', text, tags: [], created: most(), lastAccessed: most(),
  accessCount: 0, salience: 1, tier: 'hot'
});
const tarBeallit = (items) => writeFileSync(TESZT_STORE, JSON.stringify({ _meta: {}, items }, null, 2), 'utf-8');

const M1 = 'meeting notes into action plans';
const M2 = 'budget planning for the week';
const M3 = 'recipe ideas for dinner';

console.log('🧪 memória-keresés-őr\n');

// ───────────────────────────────────────────────────────────────────
// 1) A RIPORT-SOR — a lelet ELJUT a userhez, és nem némítható el
// ───────────────────────────────────────────────────────────────────
await t('1a) A VALÓDI ESET: a kimaradt emlékek száma ELJUT a riport-sorba', async () => {
  const sor = szemantikusSor({
    at: '2026-09-06T02:00:00.000Z', provider: 'mistral', dim: 1024,
    osszes: 212, cache: 100, beagyazva: 6, kihagyott: 106,
    problems: szemantikusProblemak({ osszes: 212, kihagyott: 106, provider: 'mistral' })
  });
  assert.ok(sor.startsWith('⚠️'), 'nem vészjelzés-mintás, a zajszűrő elnémíthatná: ' + sor);
  assert.ok(sor.includes('106'), 'nem mondja meg, HÁNY emlék maradt ki: ' + sor);
  assert.ok(sor.includes('212'), 'nincs NEVEZŐ — 106 kimaradt 212-ből MÁS, mint 106 a 106-ból: ' + sor);
  assert.ok(sor.includes('mistral'), 'nem mondja meg, MELYIK szolgáltatónál történt: ' + sor);
});

await t('1b) a sort a riport-zajszűrő SEM némíthatja el', async () => {
  // A `core/report-noise.js` vészjelzés-mintája a 🛑/🚨/⚠️ jelekre illeszkedik,
  // és minden „csak ha változott" szabályt felülír. Egy napokig VÁLTOZATLAN
  // vakság pont az a szöveg, amit egy ilyen szabály másnapra elhallgattatna.
  const { szurZajt } = await import('./report-noise.js');
  const sor = szemantikusSor({
    osszes: 10, kihagyott: 4, provider: 'mistral',
    problems: szemantikusProblemak({ osszes: 10, kihagyott: 4, provider: 'mistral' })
  });
  const elso = szurZajt([sor], {});
  const masodik = szurZajt([sor], elso.allapot || {});
  assert.ok(masodik.sorok.includes(sor), '🔴 a zajszűrő a második napon elnyelte a vakság-jelzést');
});

await t('1c) hibátlan futásnál CSENDBEN marad (a csendes nap maradjon csendes)', async () => {
  assert.equal(szemantikusSor({ osszes: 212, kihagyott: 0, problems: [] }), '');
});

await t('1d) hiányzó/sérült fájlra NEM kiált farkast', async () => {
  // ⚠️ SZÁNDÉKOS ELTÉRÉS a `test-guard.js`-től, ahol a hiányzó fájl „NEM TUDOM".
  // Ott a lépés MINDEN futásban megy; itt a szemantikus keresés csak akkor fut,
  // ha az Író/Útmutató agent egyáltalán dolgozott. A „ma nem volt dolga" napokon
  // egy „nem tudom" sor NAPI hamis riasztás lenne — és a hamis riasztás megeszi
  // az igazit is. Azt a kérdést, hogy él-e egyáltalán a beágyazás, az
  // `embed-guard.js` felelős megválaszolni.
  for (const rossz of [null, undefined, 'hopp', 42, [], {}]) {
    assert.equal(szemantikusSor(rossz), '', 'zajongott erre: ' + JSON.stringify(rossz));
  }
});

// ───────────────────────────────────────────────────────────────────
// 2) A LELET — mit tekintünk gondnak?
// ───────────────────────────────────────────────────────────────────
await t('2a) 0 kimaradt = nincs lelet', async () => {
  assert.deepEqual(szemantikusProblemak({ osszes: 8, kihagyott: 0 }), []);
});

await t('2b) 1 kimaradt már lelet (nincs „elhanyagolható" küszöb)', async () => {
  const p = szemantikusProblemak({ osszes: 8, kihagyott: 1, provider: 'mistral' });
  assert.equal(p.length, 1);
  assert.equal(p[0].code, 'MEMORIA_KIMARADT');
  assert.ok(p[0].detail.includes('1/8'), 'a részlet nem hordozza az arányt: ' + p[0].detail);
});

await t('2c) értelmezhetetlen bemenetre üres lista, nem kitalált lelet', async () => {
  for (const rossz of [null, undefined, 'hopp', 42, []]) {
    assert.deepEqual(szemantikusProblemak(rossz), [], 'kitalált leletet gyártott erre: ' + JSON.stringify(rossz));
  }
  assert.deepEqual(szemantikusProblemak({ osszes: 8, kihagyott: -3 }), [], 'negatív számból is leletet csinált');
});

// ───────────────────────────────────────────────────────────────────
// 3) 🔑 A NAPI BIZONYÍTÉK NEM TÖRÖLHETŐ EGY KÉSŐBBI TISZTA FUTÁSSAL
//
//    A `recallSemantic()`-ot EGY futásban többször hívjuk (Író, majd Útmutató).
//    Ha a második, tiszta hívás felülírná az elsőt, a riport azt mondaná:
//    „ma minden rendben volt" — pedig a nap EGYIK promptja fél memóriával
//    készült. A kár már megtörtént; a bizonyíték iránya számít, nem a sorrend.
//    (Ugyanaz a szabály, mint az `embed-guard.js kellIrni()`-jében, csak ott a
//    KONFIG-HIÁNY nem írhatja felül az egészséget.)
//
//    ⚠️ ÉS KELL ÚT VISSZA A NULLÁHOZ: másnap a tiszta futás MINDIG felülír,
//    különben a számláló örökre pirosan ragadna (témaismétlés-őr leckéje).
// ───────────────────────────────────────────────────────────────────
const baj = (at, kihagyott = 2) => ({ at, provider: 'mistral', osszes: 8, kihagyott });
const tiszta = (at) => ({ at, provider: 'mistral', osszes: 8, kihagyott: 0 });

await t('3a) az első alkalommal mindig írunk', async () => {
  assert.equal(kellIrniSzemantikus(null, tiszta('2026-09-06T02:00:00.000Z')), true);
});

await t('3b) 🔑 az aznapi TISZTA futás NEM törli az aznapi bajt', async () => {
  assert.equal(
    kellIrniSzemantikus(baj('2026-09-06T02:00:00.000Z'), tiszta('2026-09-06T10:00:00.000Z')),
    false,
    '🔴 a késői tiszta hívás letörölte a nap bizonyítékát — a riport „minden rendben"-t mondana'
  );
});

await t('3c) …de a MÁSNAPI tiszta futás igenis felülír (út vissza a nullához)', async () => {
  assert.equal(
    kellIrniSzemantikus(baj('2026-09-06T02:00:00.000Z'), tiszta('2026-09-07T02:00:00.000Z')),
    true,
    'a lelet örökre pirosan ragadt volna'
  );
});

await t('3d) az ÚJ baj mindig kiíródik (aznap is, tiszta előzmény után is)', async () => {
  assert.equal(kellIrniSzemantikus(tiszta('2026-09-06T02:00:00.000Z'), baj('2026-09-06T10:00:00.000Z')), true,
    'a romlás nem íródott ki');
  assert.equal(kellIrniSzemantikus(baj('2026-09-06T02:00:00.000Z'), baj('2026-09-06T10:00:00.000Z', 5)), true,
    'a súlyosbodó baj friss részletei nem íródtak ki');
});

await t('3e) aznapi tiszta után tiszta: nincs fölösleges írás (a memory/ git-követett)', async () => {
  assert.equal(kellIrniSzemantikus(tiszta('2026-09-06T02:00:00.000Z'), tiszta('2026-09-06T10:00:00.000Z')), false);
});

await t('3f) sérült/hiányos előzményre írunk, nem találgatunk', async () => {
  for (const rossz of ['hopp', 42, [], {}, { at: 'nem-dátum', kihagyott: 3 }]) {
    assert.equal(kellIrniSzemantikus(rossz, tiszta('2026-09-06T10:00:00.000Z')), true,
      'némán átsiklott ezen az előzményen: ' + JSON.stringify(rossz));
  }
});

// ───────────────────────────────────────────────────────────────────
// 4) A LEMEZRE ÍRÁS — az őrszem-minta ({at, problems}) és a robusztusság
// ───────────────────────────────────────────────────────────────────
await t('4a) a lemezre írt alak illeszkedik az őrszem-mintához', async () => {
  guardTorol();
  jegyezSzemantikus(baj('2026-09-06T02:00:00.000Z'), TESZT_GUARD);
  const g = guardOlvas();
  assert.ok(g.at, 'nincs `at` — semmilyen frissesség-vizsgálat nem látná');
  assert.ok(Array.isArray(g.problems) && g.problems.length === 1, 'nincs `problems` tömb: ' + JSON.stringify(g));
  assert.equal(g.kihagyott, 2, 'a nyers szám is megmarad a diagnózishoz');
  assert.equal(g.osszes, 8);
});

await t('4b) a fájlnév EGY helyen él (a riport is erre hivatkozik)', async () => {
  assert.equal(GUARD_FAJL, 'semantic-guard.json');
});

await t('4c) SOHA nem dob — egy őrszem nem akaszthat meg egy AI-hívást', async () => {
  assert.doesNotThrow(() => jegyezSzemantikus(baj('2026-09-06T02:00:00.000Z'), 'Z:/nincs/ilyen/ut/x.json'));
  assert.doesNotThrow(() => jegyezSzemantikus(null, TESZT_GUARD));
  assert.doesNotThrow(() => jegyezSzemantikus('hopp', TESZT_GUARD));
});

// ───────────────────────────────────────────────────────────────────
// 5) A LÁNC VÉGE — a `recallSemantic()` TÉNYLEG lemezre teszi a leletet
//    („Sikeres válasz ≠ elvégzett munka": a lánc VÉGÉT mérjük.)
// ───────────────────────────────────────────────────────────────────
await t('5a) részleges beágyazási hiba → a lelet a LEMEZEN van, nem csak a naplóban', async () => {
  guardTorol();
  tarBeallit([emlek('m1', M1), emlek('m2', M2), emlek('m3', M3)]);
  rmSync(TESZT_CACHE, { force: true });
  const eredetiWarn = console.warn; console.warn = () => {};
  try {
    await recallSemantic('meeting notes', {
      scope: 'iro', provider: 'teszt', embedFn: alEmbed({ hibas: ['budget', 'recipe'] })
    });
  } finally { console.warn = eredetiWarn; }

  assert.ok(existsSync(TESZT_GUARD), '🔴 a lelet CSAK a CI-naplóig jutott — a userhez nem');
  const g = guardOlvas();
  assert.equal(g.kihagyott, 2, 'a lemezen nem a valódi szám áll');
  assert.equal(g.osszes, 3);
  assert.equal(g.provider, 'teszt');
  assert.ok(szemantikusSor(g).includes('2/3'), 'a riport-sor nem áll össze a lemezre írt alakból: ' + szemantikusSor(g));
});

await t('5b) hibátlan futás után is van bejegyzés — de NEM zajong', async () => {
  guardTorol();
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  rmSync(TESZT_CACHE, { force: true });
  await recallSemantic('meeting notes', { scope: 'iro', provider: 'teszt', embedFn: alEmbed() });
  assert.ok(existsSync(TESZT_GUARD), 'a sikeres futás sem hagyhat nyom nélkül (a „nem futott" különben ugyanígy nézne ki)');
  const g = guardOlvas();
  assert.equal(g.kihagyott, 0);
  assert.equal(szemantikusSor(g), '', 'zajongott egy hibátlan futásra');
});

await t('5c) 🔑 A KULCS NÉLKÜLI FOLYAMAT NEM ÍTÉLHETI HALOTTNAK A MEMÓRIÁT', async () => {
  // Ez A MAI LECKE, kódba öntve. Ha ebben a folyamatban EGYÁLTALÁN nincs
  // beágyazás (nincs kulcs), a kérdés vektora sem születik meg — és akkor
  // SEMMIT nem tudunk arról, hány emléket lehetett volna beágyazni. Ilyenkor
  // nem szabad hozzányúlni a fájlhoz: egy kulcs nélküli lépés különben
  // felülírná a MŰKÖDŐ futás bejegyzését (pontosan az `embed-guard.js`
  // 2026-09-06-i regressziója, ahol a Házmester írt „HALOTT"-at egy élő
  // rendszerre).
  // ⚠️ A BEJEGYZÉS SZÁNDÉKOSAN TEGNAPI. Ha mai lenne, a „ne gyártsunk üres
  // diffet" szabály önmagában is megakadályozná az írást, és a teszt akkor is
  // zöld maradna, ha a tartalék-ág HIBÁSAN írna. Tegnapi bejegyzésre viszont
  // egy írás ENGEDÉLYEZETT LENNE — így a teszt tényleg tud bukni.
  const tegnap = new Date(Date.now() - 86400e3).toISOString();
  writeFileSync(TESZT_GUARD, JSON.stringify({
    at: tegnap, provider: 'mistral', dim: 1024, osszes: 212,
    cache: 212, beagyazva: 0, kihagyott: 0, problems: []
  }, null, 2), 'utf-8');
  const egeszseges = readFileSync(TESZT_GUARD, 'utf-8');

  // …és most egy „kulcs nélküli" folyamat: SEMMIT nem tud beágyazni.
  tarBeallit([emlek('m1', M1), emlek('m2', M2)]);
  await recallSemantic('meeting notes', { scope: 'iro', provider: 'teszt', embedFn: async () => null });
  assert.equal(readFileSync(TESZT_GUARD, 'utf-8'), egeszseges,
    '🔴 a kulcs nélküli folyamat felülírta az egészséges bejegyzést — UGYANAZ A HIBA, MINT A HÁZMESTERNÉL');
});

await t('5d) az `embedFn: null` (tiszta offline teszt) sem ír', async () => {
  guardTorol();
  tarBeallit([emlek('m1', M1)]);
  await recallSemantic('meeting notes', { scope: 'iro', embedFn: null });
  assert.equal(existsSync(TESZT_GUARD), false, 'a tartalék-ág nyomot hagyott a lemezen');
});

// ───────────────────────────────────────────────────────────────────
// 6) A RIPORT TÉNYLEG OLVASSA — enélkül az egész munka a CI-naplóig ér
//    A `core/daily-report.js` NEM IMPORTÁLHATÓ (a fájl végén feltétel nélkül
//    hívja a main()-t → valódi Telegram-üzenetet küldene és pénzt költene),
//    ezért a FORRÁSÁT olvassuk — ugyanaz a minta, mint a buffer-guard és a
//    test-guard tesztjében.
// ───────────────────────────────────────────────────────────────────
await t('6) a napi riport beolvassa a fájlt ÉS kiírja a sort', async () => {
  const RIPORT = readFileSync(join(REPO, 'core', 'daily-report.js'), 'utf-8');
  assert.match(RIPORT, /semantic-guard\.json/, 'a riport nem olvassa a memory/semantic-guard.json-t');
  assert.match(RIPORT, /szemantikusSor/, 'a riport nem hívja a szemantikusSor()-t');
  assert.match(RIPORT, /from '\.\/semantic-guard\.js'/, 'nincs import a semantic-guard.js-ből');
});

// ───────────────────────────────────────────────────────────────────
// 7) AZ ÉLES ÁLLAPOTFÁJLOK ÉRINTETLENEK
//    ⚠️ Ez CSAK AKKOR bizonyíték, ha a kiindulás is tiszta volt: ezért
//    Bufferrel, bájtra hasonlítunk, és a `semantic-guard.json` esetében a
//    NEM LÉTEZÉST is ellenőrizzük (a `null` is érvényes kiindulás).
// ───────────────────────────────────────────────────────────────────
for (const [nev, ut, eredeti] of [
  ['memory/semantic-guard.json', ELES_GUARD, ELOTTE.guard],
  ['memory/store.json', ELES_STORE, ELOTTE.store],
  ['memory/memory-embeddings.json', ELES_CACHE, ELOTTE.cache]
]) {
  const mostani = existsSync(ut) ? readFileSync(ut) : null;
  const egyezik = (mostani === null && eredeti === null)
    || (mostani !== null && eredeti !== null && Buffer.compare(mostani, eredeti) === 0);
  if (egyezik) { pass++; console.log('  ✅ 🔒 az éles ' + nev + ' érintetlen'); }
  else {
    bukott++;
    console.log('  ❌ 🔴 A TESZT BELEÍRT AZ ÉLES ' + nev + '-BA — visszaállítom.');
    try {
      if (eredeti === null) rmSync(ut, { force: true });
      else writeFileSync(ut, eredeti);
    } catch { /* mindegy */ }
  }
}

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} semantic-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
