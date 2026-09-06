// ===================================================================
// TESZT-ŐRSZEM — tesztek  (2026-09-06)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL. 2026-08-31-én a tény-ellenőrző agent egy ÉLŐ cikkben
// átírta a valódi „ChatRTX" terméknevet a nem létező „NVIDIA Chat"-re. A
// `core/tool-kinds.test.js` EZT PONTOSAN ELKAPTA („BESOROLATLAN CÉG: NVIDIA
// Chat") — a védelem jól van megtervezve.
//
// 🔑 CSAKHOGY A `.github/workflows/auto.yml` NEM FUTTATOTT TESZTEKET. A teszt
// öt napig pirosan állt, senki nem nézett rá, és a kitalált név öt napig kint
// volt élesben, HÁROM NYELVEN. Ugyanígy a `core/budget.test.js` is szeptember
// 1-je óta piros volt (naptári határon romlott el) — szintén észrevétlenül.
//
// Ez a projekt saját szabálya: „AZ ŐRSZEM CSAK AKKOR ŐR, HA ODASZÓL, AHOL A
// USER NÉZ." A CI-naplóba írni annyi, mintha senkinek nem szólnál. A user a
// napi Telegram-riportot nézi — oda kell kerülnie.
//
// ⚠️ A DÖNTÉS-LOGIKA AZÉRT VAN KÜLÖN `core/` MODULBAN: a
// `core/daily-report.js` NEM IMPORTÁLHATÓ (a fájl végén feltétel nélkül hívja
// a main()-t → valódi Telegram-üzenetet küld és pénzt költ), a
// `core/run-tests.js` pedig önmagát futtatná újra. Ugyanaz a szétválasztás,
// mint a `buffer-guard.js`-nél és a `guard-freshness.js`-nél.
//
// ⚠️ A VALÓDI memory/test-guard.json-hoz NEM NYÚLUNK: minden eset a saját
// ideiglenes gyökerében fut, és a végén ellenőrizzük az éles fájlt is.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tesztProblemak, tesztSor, irTesztGuard, GUARD_FAJL } from './test-guard.js';
import { szurZajt } from './report-noise.js';
import { elavultOrszemek, frissessegSor } from './guard-freshness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const VALODI_GUARD = join(REPO, 'memory', GUARD_FAJL);
const GUARD_EREDETI = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;

let pass = 0, bukott = 0;
const t = (n, f) => {
  try { f(); pass++; console.log('  ✅ ' + n); }
  catch (e) { bukott++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 Teszt-őrszem\n');

const gyoker = () => mkdtempSync(join(tmpdir(), 'testguard-'));
const takarit = root => { try { rmSync(root, { recursive: true, force: true }); } catch { /* mindegy */ } };
const guardOlvas = root => {
  // ⚠️ MINDIG A LEMEZRŐL. A visszatérési érték ellenőrzése önmagában nem
  // bizonyítja, hogy a fájl meg is született — a napi riport a LEMEZT olvassa.
  try { return JSON.parse(readFileSync(join(root, 'memory', GUARD_FAJL), 'utf-8')); }
  catch { return null; }
};

/** Egy EGÉSZSÉGES futás állapota — ebből rontunk el egy-egy dolgot. */
const jo = (extra = {}) => ({ osszes: 71, bukottak: [], ...extra });

const kodok = a => tesztProblemak(a).map(x => x.code);

// ── 1. MI SZÁMÍT GONDNAK ────────────────────────────────────────────

t('a 71 zöld teszt NEM gond', () => {
  assert.deepEqual(kodok(jo()), []);
});

t('minden bukott teszt KÜLÖN lelet', () => {
  const a = jo({ bukottak: ['budget.test.js', 'tool-kinds.test.js'] });
  assert.deepEqual(kodok(a), ['TESZT_BUKOTT', 'TESZT_BUKOTT']);
});

t('🔎 a lelet MEGNEVEZI a bukott fájlt — enélkül nincs mit megnyitni', () => {
  const p = tesztProblemak(jo({ bukottak: ['tool-kinds.test.js'] }));
  assert.match(p[0].detail, /tool-kinds\.test\.js/);
});

t('a futtató ÖSSZEOMLÁSA az EGYETLEN lelet (nincs kitalált mellékzönge)', () => {
  // Ugyanaz a szabály, mint a buffer-guard-nál: összeomláskor a többi mező
  // hiányzik, a hiányukat gondnak venni négy KITALÁLT hibát szülne.
  const p = tesztProblemak({ osszeomlas: 'EMFILE: too many open files' });
  assert.deepEqual(p.map(x => x.code), ['TESZT_FUTTATO_OSSZEOMLAS']);
  assert.match(p[0].detail, /EMFILE/, 'az OK is kell, nem csak a tény');
});

t('🕳️ NULLA tesztfájl = gond, nem „minden zöld"', () => {
  // A védőháló eltűnése (rossz mappa, elrontott szűrő) kívülről pont úgy néz
  // ki, mint a tökéletes futás: 0 bukott. Ez a lelet választja szét a kettőt.
  assert.deepEqual(kodok({ osszes: 0, bukottak: [] }), ['NINCS_TESZTFAJL']);
});

t('a szemét bemenet nem dob kivételt', () => {
  assert.deepEqual(tesztProblemak(null), []);
  assert.deepEqual(tesztProblemak('szöveg'), []);
  assert.deepEqual(tesztProblemak([1, 2]), []);
});

// ── 2. A RIPORT-SOR ─────────────────────────────────────────────────

t('🔇 MINDEN ZÖLD → a sor CSENDBEN marad (a projekt nem tűri a napi zajt)', () => {
  assert.equal(tesztSor({ at: new Date().toISOString(), osszes: 71, problems: [] }), '');
});

t('📣 N BUKOTT → megszólal, MEGNEVEZI a fájlokat, és kiírja az arányt', () => {
  const sor = tesztSor({
    at: new Date().toISOString(),
    osszes: 71,
    problems: [
      { code: 'TESZT_BUKOTT', detail: 'budget.test.js' },
      { code: 'TESZT_BUKOTT', detail: 'tool-kinds.test.js' }
    ]
  });
  assert.match(sor, /budget\.test\.js/, 'a fájl NEVE nélkül a sor nem cselekvésre hívó');
  assert.match(sor, /tool-kinds\.test\.js/);
  assert.match(sor, /2 bukott/);
  assert.match(sor, /71/, 'a NEVEZŐ nélkül nem derül ki, mekkora a baj');
  assert.ok(sor.startsWith('⚠️'), 'a zajszűrő VESZ_RX-e csak a ⚠️-t engedi át mindig');
});

t('❓ HIÁNYZÓ állapotfájl → „NEM TUDOM", NEM „rendben van"', () => {
  // 🔑 EZ A LÉNYEG. A hiányzó fájlt csendnek venni pont az a hiba, ami miatt
  // öt napig senki nem tudta, hogy a tool-kinds teszt piros.
  for (const rossz of [null, undefined]) {
    const sor = tesztSor(rossz);
    assert.ok(sor, 'a hiányzó állapotfájl NEM lehet néma');
    assert.match(sor, /NEM TUDOM/);
  }
});

t('❓ OLVASHATATLAN / hibás alakú állapotfájl → szintén „NEM TUDOM"', () => {
  for (const rossz of [{}, [], 'szöveg', 42, { at: '2026-09-06T00:00:00Z' }, { problems: 'nem tömb' }]) {
    const sor = tesztSor(rossz);
    assert.ok(sor, 'a sérült állapotfájl NEM lehet néma: ' + JSON.stringify(rossz));
    assert.match(sor, /NEM TUDOM/);
  }
});

t('💥 a futtató összeomlása is megszólal — és NEM állítja, hogy zöld', () => {
  const sor = tesztSor({ at: new Date().toISOString(), osszes: 0, problems: [{ code: 'TESZT_FUTTATO_OSSZEOMLAS', detail: 'EMFILE' }] });
  assert.match(sor, /EMFILE/);
  assert.ok(sor.startsWith('⚠️'));
  assert.doesNotMatch(sor, /\bzöld/i);
});

t('🕳️ a nulla tesztfájl esete külön mondatot kap', () => {
  const sor = tesztSor({ at: new Date().toISOString(), osszes: 0, problems: [{ code: 'NINCS_TESZTFAJL', detail: 'x' }] });
  assert.ok(sor.startsWith('⚠️'));
  assert.match(sor, /tesztfájl/i);
});

t('sok bukásnál rövidít, de a SZÁM pontos marad', () => {
  const problems = Array.from({ length: 12 }, (_, i) => ({ code: 'TESZT_BUKOTT', detail: `a${i}.test.js` }));
  const sor = tesztSor({ at: new Date().toISOString(), osszes: 71, problems });
  assert.match(sor, /12 bukott/, 'a rövidítés nem torzíthatja a darabszámot');
  assert.ok(sor.length < 320, 'a riport-sor ne legyen fal: ' + sor.length);
});

t('nevező nélkül sem hazudik: kiírja a bukást, csak arány nélkül', () => {
  const sor = tesztSor({ at: new Date().toISOString(), problems: [{ code: 'TESZT_BUKOTT', detail: 'x.test.js' }] });
  assert.match(sor, /x\.test\.js/);
  assert.match(sor, /1 bukott/);
});

// ── 3. ÍRÁS A LEMEZRE ───────────────────────────────────────────────

t('📝 a bukás KIKERÜL a lemezre — és onnan olvasva is bukás', () => {
  const root = gyoker();
  irTesztGuard(root, join, { osszes: 71, bukottak: ['budget.test.js', 'tool-kinds.test.js'] });
  const g = guardOlvas(root);
  assert.ok(g, 'meg sem született az őrszem-fájl — a riport hallgatna');
  assert.ok(Date.parse(g.at) > 0, 'nincs használható időbélyeg (a frissesség-őr ebből dolgozik)');
  assert.equal(g.osszes, 71);
  assert.equal(g.problems.length, 2);
  assert.match(tesztSor(g), /tool-kinds\.test\.js/, 'a lemezről visszaolvasva is meg kell szólalnia');
  takarit(root);
});

t('📓 SIKERES futásnál IS ír (üres problems) — enélkül a „nem futott" és a „minden zöld" egyforma', () => {
  const root = gyoker();
  irTesztGuard(root, join, jo());
  const g = guardOlvas(root);
  assert.ok(g, 'a zöld futásnak is nyomot kell hagynia');
  assert.deepEqual(g.problems, []);
  assert.equal(tesztSor(g), '', 'a zöld futás ettől még CSENDES a riportban');
  takarit(root);
});

t('📓 a tegnapi zöldet FELÜLÍRJA a mai piros', () => {
  const root = gyoker();
  irTesztGuard(root, join, jo());
  assert.deepEqual(guardOlvas(root).problems, []);
  irTesztGuard(root, join, { osszes: 71, bukottak: ['budget.test.js'] });
  assert.equal(guardOlvas(root).problems.length, 1, 'a tegnapi „minden rendben" bent maradt');
  takarit(root);
});

t('az írás hibája NEM dob (egy őrszem sosem ronthatja el a futást)', () => {
  assert.doesNotThrow(() => irTesztGuard('/nincs/ilyen/mappa/soha', join, jo()));
});

// ── 4. EGYÜTT A RIPORT TÖBBI RÉTEGÉVEL ──────────────────────────────

t('🔊 a zajszűrő NEM némítja el a piros sort két egyforma napon sem', () => {
  // Egy napokig változatlan piros teszt pont az az eset, amit egy „csak ha
  // változott" szabály másnapra elhallgattatna.
  const sor = tesztSor({ at: new Date().toISOString(), osszes: 71, problems: [{ code: 'TESZT_BUKOTT', detail: 'budget.test.js' }] });
  const elso = szurZajt([sor], {});
  assert.deepEqual(elso.sorok, [sor]);
  const masodik = szurZajt([sor], elso.allapot);
  assert.deepEqual(masodik.sorok, [sor], 'a második napon elnémult — pont a néma leállás mintája');
});

t('🕰️ a LEFAGYOTT teszt-őrszemet a frissesség-őr fogja meg', () => {
  const regen = new Date(Date.now() - 40 * 3600e3).toISOString();
  const elavultak = elavultOrszemek({ teszt: { at: regen, problems: [] } });
  assert.deepEqual(elavultak.map(x => x.nev), ['teszt']);
  assert.match(frissessegSor(elavultak), /teszt/);
});

// ── 5. BE VAN-E KÖTVE? (a három nem futtatható/nem importálható végpont) ──
//
// ⚠️ EZ SZÖVEG-ELLENŐRZÉS, NEM FUTTATÁS. A `daily-report.js` valódi Telegram-
// üzenetet küldene, a `run-tests.js` pedig ÖNMAGÁT (és ezt a fájlt) futtatná
// újra, végtelen ciklusban. A logika ezért van itt, tesztelve; ezek a sorok
// csak azt őrzik, hogy a KÉT VÉGE ÖSSZE IS VAN KÖTVE. Enélkül a tökéletes
// modul kint állhatna használatlanul (mint a guide-coverage-guard, amit
// 2026-08-29-ig SENKI nem olvasott).

const FUTTATO = readFileSync(join(REPO, 'core', 'run-tests.js'), 'utf-8');
const RIPORT = readFileSync(join(REPO, 'core', 'daily-report.js'), 'utf-8');
const YML = readFileSync(join(REPO, '.github', 'workflows', 'auto.yml'), 'utf-8');

t('🔌 a teszt-futtató MEGHÍVJA az őrszem-írást', () => {
  assert.match(FUTTATO, /test-guard\.js/, 'nincs behúzva a core/test-guard.js');
  // ⚠️ A PUSZTA EMLÍTÉS KEVÉS (buffer-guard-lecke): az import-sor és a
  // kommentek miatt a szó akkor is ott marad, ha a hívást kikommentezik.
  // Ezért SOR ELEJI hívást követelünk — a valódi bizonyíték viszont az
  // alatta lévő, ténylegesen lefuttatott eset.
  assert.match(FUTTATO, /^\s*irTesztGuard\(/m, 'az import megvan, de senki nem hívja — nem születne őr-fájl');
});

t('🔬 VALÓDI FUTÁS: a --guard tényleg ír a lemezre, nélküle NEM', () => {
  // ⚠️ EZ NEM SZÖVEG-ELLENŐRZÉS, HANEM FUTTATÁS — de nem a repó tesztjeivel
  // (a `run-tests.js` ÖNMAGÁT, azaz ezt a fájlt is újraindítaná, végtelen
  // ciklusban), hanem egy homokozóban, két apró próbafájllal. Enélkül a
  // bekötést csak szövegre tudnánk mérni, és egy `if (false)` némán túlélné.
  const root = gyoker();
  mkdirSync(join(root, 'core'), { recursive: true });
  copyFileSync(join(REPO, 'core', 'run-tests.js'), join(root, 'core', 'run-tests.js'));
  copyFileSync(join(REPO, 'core', 'test-guard.js'), join(root, 'core', 'test-guard.js'));
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n', 'utf-8');
  writeFileSync(join(root, 'core', 'zold.test.js'), 'process.exit(0);\n', 'utf-8');
  writeFileSync(join(root, 'core', 'piros.test.js'), 'console.log("szándékos bukás");\nprocess.exit(1);\n', 'utf-8');
  const fut = (...args) => spawnSync(process.execPath, [join(root, 'core', 'run-tests.js'), ...args], { encoding: 'utf-8' });

  // 1) --guard NÉLKÜL (helyi `npm test`): NEM nyúl a memory/-hoz.
  assert.equal(fut().status, 1, 'a bukott teszt nem adott nem-nulla kilépőkódot');
  assert.equal(guardOlvas(root), null, 'a helyi futás beleírt a memory/-ba — git-ütközést készít elő');

  // 2) --guard-DAL (CI): megszületik a fájl, és a riport-sor MEGNEVEZI a bukást.
  assert.equal(fut('--guard').status, 1, 'a --guard nem némíthatja el a kilépőkódot');
  const g = guardOlvas(root);
  assert.ok(g, 'a --guard nem írt állapotfájlt — a riport nem tudna a bukásról');
  assert.equal(g.osszes, 2);
  assert.match(tesztSor(g), /piros\.test\.js/, 'a lemezről visszaolvasva nem nevezi meg a bukott tesztet');
  takarit(root);
});

t('🔌 a napi riport BEOLVASSA és KIÍRJA a teszt-őrszemet', () => {
  assert.match(RIPORT, /test-guard\.js/, 'a riport nem importálja a modult');
  // ⚠️ SOR ELEJI, ÉLŐ hívást követelünk. A puszta `/tesztSor\(/` egy
  // kikommentezett hívásra is illeszkedne — a mutációs próba pont ezt
  // mutatta ki a buffer-guard-nál is.
  assert.match(RIPORT, /^\s*const\s+\w+\s*=\s*tesztSor\(/m, 'a riport nem hívja a tesztSor()-t (vagy ki van kommentezve)');
  // A beolvasásnak a MEMÓRIA-FÁJLBÓL kell jönnie, nem csak a frissesség-térkép
  // felsorolásából — az utóbbi csak az `at` bélyeget nézi, a tartalmat nem.
  assert.match(RIPORT, /readFileSync\(join\(ROOT, *'memory', *'test-guard\.json'\)/,
    'a riport nem olvassa a memory/test-guard.json TARTALMÁT');
});

t('🕰️ a riport frissesség-őre FIGYELI a teszt-őrszemet is', () => {
  // A guard-fájl `at` bélyege csak akkor ér valamit, ha valaki meg is nézi.
  const map = RIPORT.slice(RIPORT.indexOf('const nevek = {'), RIPORT.indexOf('const beolvasott = {}'));
  assert.match(map, /test-guard\.json/, 'a teszt-őrszem kimaradt a frissesség-térképből');
});

// ⚠️ A KOMMENT NEM BIZONYÍTÉK (a `_redirects` 2026-08-15-i leckéje). A puszta
// „szerepel a YAML-ben: run-tests.js" átmenne akkor is, ha a fájlnév CSAK egy
// magyarázó kommentben állna. Ezért mindenhol a VALÓDI `run:` sort keressük.
const YML_SOROK = YML.split(/\r?\n/);
const futtatoSor = YML_SOROK.find(s => /^\s*run:\s*.*core\/run-tests\.js/.test(s));

t('🏗️ a CI FUTTATJA a teszteket', () => {
  assert.ok(futtatoSor, 'a munkafolyamat nem futtat teszteket — pont ez volt az eredeti hiba');
});

t('💸 a tesztlépés a PÉNZKÖLTÉS ELŐTT fut', () => {
  // Egy elromlott kapu derüljön ki, MIELŐTT az első fizetős hívás elmegy.
  const teszt = YML_SOROK.findIndex(s => /^\s*run:\s*.*core\/run-tests\.js/.test(s));
  const penz = YML_SOROK.findIndex(s => /^\s*run:\s*.*agents\/ceo\/agent\.js/.test(s));
  assert.ok(teszt >= 0 && penz >= 0, 'nem találom a két lépést a YAML-ben');
  assert.ok(teszt < penz, 'a tesztlépés a fizetős pipeline UTÁN van — így egy piros kapu csak a pénz elköltése után derül ki');
});

t('🚦 a tesztbukás NEM állítja meg a pipeline-t (user-döntés)', () => {
  // Egy elromlott teszt miatt leállítani a cég működését SOKKAL drágább,
  // mint a hiba maga: a tartalomnak akkor is mennie kell.
  assert.ok(futtatoSor, 'nincs futtató sor');
  assert.match(futtatoSor, /\|\|\s*true/, 'a tesztlépés elbuktatná a jobot — a kiadási lánc kimaradna');
});

t('🧯 a CI a --guard kapcsolóval fut (a helyi `npm test` NE írjon git-ütközést)', () => {
  assert.ok(futtatoSor, 'nincs futtató sor');
  assert.match(futtatoSor, /--guard/, 'guard-kapcsoló nélkül nem születik állapotfájl');
  assert.match(FUTTATO, /--guard/, 'a futtató nem ismeri a kapcsolót');
});

// ── 6. AZ ÉLES FÁJL ÉRINTETLEN ──────────────────────────────────────

const mostani = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;
if (mostani !== GUARD_EREDETI) {
  bukott++;
  console.log('  ❌ A TESZT BELEÍRT AZ ÉLES memory/' + GUARD_FAJL + '-BA — visszaállítva.');
  try {
    if (GUARD_EREDETI === null) rmSync(VALODI_GUARD, { force: true });
    else { mkdirSync(dirname(VALODI_GUARD), { recursive: true }); writeFileSync(VALODI_GUARD, GUARD_EREDETI, 'utf-8'); }
  } catch { /* mindegy */ }
} else {
  pass++;
  console.log('  ✅ 🧪 az éles memory/' + GUARD_FAJL + ' érintetlen');
}

console.log(`\n${bukott === 0 ? '✅' : '❌'} test-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
