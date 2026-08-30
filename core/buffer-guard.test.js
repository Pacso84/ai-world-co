// ===================================================================
// BUFFER-ŐRSZEM — tesztek  (2026-08-30)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A FÁJL. A Threads és az Instagram a Bufferen megy
// (`agents/social/buffer-poster.js`), és az a modul EDDIG HÁROM SEBBŐL
// vérzett egyszerre:
//
//   1. a fájl végi `main().catch(...)` ÖSSZEOMLÁSKOR IS `process.exit(0)`-t
//      hívott — a CI zöld pipát adott egy ki nem ment posztra;
//   2. semmilyen `memory/*-guard.json`-t nem írt, pedig a Reel pontosan
//      ilyen mintát használ, és a napi riport azt be is olvassa;
//   3. a `core/daily-report.js` egész fájljában egyetlen „buffer" szó sem volt.
//
// Vagyis ha lejár a BUFFER_ACCESS_TOKEN, leválik egy csatorna, vagy a
// `createPost` hibát ad, a posztolás NÉMÁN áll le — csak a CI naplójába
// írva, ahová senki nem néz. 2026 nyarán volt már egy 9 napos néma FB-leállás
// pontosan ezért.
//
// ⚠️ A DÖNTÉS-LOGIKA AZÉRT VAN KÜLÖN `core/` MODULBAN, mert sem a
// `buffer-poster.js`, sem a `daily-report.js` NEM IMPORTÁLHATÓ: mindkettő
// feltétel nélkül elindul a fájl végén (a poszter VALÓDI posztot küldene).
// Ugyanaz a szétválasztás, mint a `report-window.js`-nél és a
// `guard-freshness.js`-nél.
//
// ⚠️ A VALÓDI memory/buffer-guard.json-hoz NEM NYÚLUNK: minden eset a saját
// ideiglenes gyökerében fut, és a végén ellenőrizzük az éles fájlt is.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { bufferProblemak, bufferSor, irBufferGuard, futtatBuffer, GUARD_FAJL } from './buffer-guard.js';
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
const at = async (n, f) => {
  try { await f(); pass++; console.log('  ✅ ' + n); }
  catch (e) { bukott++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 Buffer-őrszem\n');

/** Egy EGÉSZSÉGES futás állapota — ebből rontunk el egy-egy dolgot. */
const jo = (extra = {}) => ({
  tokenVan: true,
  socialMappa: true,
  csatornaLekerdezes: 'ok',
  csatornak: [
    { service: 'threads', name: 'aiworldhq', isDisconnected: false, isLocked: false },
    { service: 'instagram', name: 'aiworldhq', isDisconnected: false, isLocked: false }
  ],
  ismertCsatornak: ['threads', 'instagram'],
  hibak: [],
  kikuldve: 2,
  keres: 2,
  ...extra
});

const kodok = a => bufferProblemak(a).map(x => x.code);

// ── 1. MI SZÁMÍT GONDNAK ────────────────────────────────────────────

t('az egészséges futás NEM gond', () => {
  assert.deepEqual(kodok(jo()), []);
});

t('a CSENDES NAP sem gond — nem volt kiküldendő, nincs hiba', () => {
  // ⚠️ EZ A LEGFONTOSABB HATÁR. Ha az üres sort bukásnak vennénk, a riport
  // minden nap vészjelezne, és az őrszem pár nap alatt elveszítené az erejét
  // (lásd a Pinterest-sor kigyomlálását 2026-08-09-én). Az „el sem indult"
  // esetet NEM ez a sor fogja meg, hanem az `at` bélyeg frissessége.
  assert.deepEqual(kodok(jo({ kikuldve: 0, keres: 0 })), []);
});

t('🚨 a HIÁNYZÓ/LEJÁRT token gond — ettől néma a Threads és az Instagram', () => {
  const p = bufferProblemak(jo({ tokenVan: false }));
  assert.deepEqual(p.map(x => x.code), ['NINCS_TOKEN']);
  assert.match(p[0].detail, /BUFFER_ACCESS_TOKEN/);
});

t('🚨 a bukott csatorna-lekérdezés gond — ÉS az OKA is bekerül', () => {
  // Így néz ki élesben a lejárt token: a Buffer UNAUTHENTICATED-et ad.
  const p = bufferProblemak(jo({
    csatornaLekerdezes: 'bukott',
    csatornaHiba: 'An authentication JWT or Access Token is required'
  }));
  assert.deepEqual(p.map(x => x.code), ['CSATORNA_LEKERDEZES_BUKOTT']);
  assert.match(p[0].detail, /authentication JWT/, 'az OK is kell, nem csak a tény');
});

t('🚨 a LEVÁLT csatorna gond — a Buffer maga jelenti (isDisconnected)', () => {
  const p = bufferProblemak(jo({
    csatornak: [
      { service: 'threads', name: 'aiworldhq', isDisconnected: false, isLocked: false },
      { service: 'instagram', name: 'aiworldhq', isDisconnected: true, isLocked: false }
    ],
    ismertCsatornak: ['threads']
  }));
  assert.deepEqual(p.map(x => x.code), ['CSATORNA_LEVALT']);
  assert.match(p[0].detail, /instagram/i);
  assert.ok(!/threads/i.test(p[0].detail), 'az ÉP csatorna ne kerüljön a hibába');
});

t('🚨 a ZÁROLT csatorna is gond (isLocked)', () => {
  const p = bufferProblemak(jo({
    csatornak: [{ service: 'threads', name: 'aiworldhq', isDisconnected: false, isLocked: true }],
    ismertCsatornak: []
  }));
  assert.ok(p.some(x => x.code === 'CSATORNA_LEVALT'), 'a zárolt csatornáról sem posztolunk');
});

t('🚨 ha EGY használható csatorna sem maradt, az gond', () => {
  assert.ok(kodok(jo({ csatornak: [], ismertCsatornak: [] })).includes('NINCS_HASZNALHATO_CSATORNA'));
});

t('🚨 a bukott createPost gond — csatornánként, okostul', () => {
  const p = bufferProblemak(jo({
    kikuldve: 1,
    hibak: [{ csatorna: 'instagram', slug: 'how-to-x', hiba: 'InvalidInputError: Instagram posts require a type' }]
  }));
  assert.deepEqual(p.map(x => x.code), ['POSZT_BUKOTT']);
  assert.match(p[0].detail, /instagram/i);
  assert.match(p[0].detail, /InvalidInputError/);
});

t('🚨 a HIÁNYZÓ social mappa gond — enélkül a poszter némán visszafordul', () => {
  assert.ok(kodok(jo({ socialMappa: false })).includes('NINCS_SOCIAL_MAPPA'));
});

t('💥 összeomláskor CSAK az összeomlás a lelet — nem találunk ki mellé hibákat', () => {
  // Összeomlásnál a többi mező hiányzik (a main() el sem jutott odáig). Ha a
  // hiányukat is gondnak vennénk, a riport négy kitalált hibát írna ki egy
  // helyett — a valódi ok pedig elveszne a zajban.
  // ⚠️ A FÉLIG KITÖLTÖTT ÁLLAPOTTAL is próbáljuk (mutációs próba mutatta ki:
  // a csupasz `{osszeomlas}` bemenettel a szabály KIVEHETŐ volt anélkül, hogy
  // egyetlen teszt is bukott volna — a többi mező hiánya magától néma).
  const p = bufferProblemak({
    osszeomlas: 'fetch failed', tokenVan: false, socialMappa: false,
    csatornaLekerdezes: 'bukott', ismertCsatornak: [],
    csatornak: [{ service: 'threads', isDisconnected: true }],
    hibak: [{ csatorna: 'threads', hiba: 'HTTP 500' }]
  });
  assert.deepEqual(p.map(x => x.code), ['BUFFER_OSSZEOMLAS'], 'az összeomlás mellé hat kitalált lelet került');
  assert.match(p[0].detail, /fetch failed/);
  assert.deepEqual(bufferProblemak({ osszeomlas: 'fetch failed' }).map(x => x.code), ['BUFFER_OSSZEOMLAS']);
});

t('a több gond MIND bekerül (nem csak az első)', () => {
  const p = bufferProblemak(jo({
    csatornak: [{ service: 'instagram', name: 'aiworldhq', isDisconnected: true, isLocked: false }],
    ismertCsatornak: [],
    hibak: [{ csatorna: 'threads', hiba: 'HTTP 500' }]
  }));
  assert.ok(p.length >= 3, 'levált csatorna + nincs használható + poszt-bukás = 3 lelet, kapott: ' + p.length);
});

t('a hibás/hiányzó bemenet nem dob', () => {
  assert.deepEqual(bufferProblemak(), []);
  assert.deepEqual(bufferProblemak(null), []);
  assert.deepEqual(bufferProblemak({ csatornak: 'nem tömb', hibak: 42 }), []);
});

// ── 2. A RIPORT-SOR ─────────────────────────────────────────────────

t('gond nélkül NINCS sor — a csendes napokon nem zajong', () => {
  assert.equal(bufferSor({ at: new Date().toISOString(), problems: [] }), '');
  assert.equal(bufferSor(null), '');
  assert.equal(bufferSor({}), '');
});

t('⚠️ a sor ⚠️-vel KEZDŐDIK — a zajszűrő vészjelzés-mintája erre illeszkedik', () => {
  const sor = bufferSor({ problems: [{ code: 'NINCS_TOKEN', detail: 'nincs BUFFER_ACCESS_TOKEN' }] });
  assert.ok(sor.startsWith('⚠️'), 'a sor: ' + JSON.stringify(sor));
  assert.match(sor, /BUFFER/i);
});

t('a sor a GONDOT írja ki, nem csak a darabszámot', () => {
  const sor = bufferSor({ problems: [{ code: 'CSATORNA_LEVALT', detail: 'instagram (aiworldhq) leválasztva' }] });
  assert.match(sor, /instagram/i, 'egy szám önmagában nem cselekvésre hívó');
});

t('sok gondnál sem hízik el a sor', () => {
  const sok = Array.from({ length: 9 }, (_, i) => ({ code: 'POSZT_BUKOTT', detail: 'threads: hiba-' + i }));
  const sor = bufferSor({ problems: sok });
  assert.ok(sor.includes('9'), 'a TELJES darabszám maradjon benne');
  assert.ok(sor.length < 260, 'túl hosszú riport-sor: ' + sor.length);
});

t('🔇 a zajszűrő NEM némíthatja el a Buffer-sort', () => {
  const sor = bufferSor({ problems: [{ code: 'NINCS_TOKEN', detail: 'nincs BUFFER_ACCESS_TOKEN' }] });
  // Kétszer egymás után, VÁLTOZATLANUL: pont az az eset, amikor egy „csak ha
  // változott" szabály elnémítaná. A Buffer néma leállása viszont napokig
  // ugyanaz a mondat — és minden nap ki kell mennie.
  const elso = szurZajt([sor], {});
  assert.deepEqual(elso.sorok, [sor], 'már az első nap eltűnt');
  const masodik = szurZajt([sor], elso.allapot);
  assert.deepEqual(masodik.sorok, [sor], 'a második napon elnémult — pont a néma leállás lenne néma');
});

// ── 3. AZ ŐRSZEM-FÁJL ───────────────────────────────────────────────

const gyoker = () => {
  const r = mkdtempSync(join(tmpdir(), 'buffer-teszt-'));
  mkdirSync(join(r, 'memory'), { recursive: true });
  return r;
};
const guardOlvas = (root) => {
  const p = join(root, 'memory', GUARD_FAJL);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
};
const takarit = (root) => { try { rmSync(root, { recursive: true, force: true }); } catch { /* */ } };

t('📓 SIKERES futásnál IS születik fájl, üres problems-szel', () => {
  // 🔑 EZ A LÉNYEG. Enélkül a „ma nem volt dolga" és a „el sem indult"
  // kívülről EGYFORMÁN néz ki — ez a hiba a témaismétlés-őrnél hónapokig
  // rejtve maradt. Az `at` bélyeg a bizonyíték, hogy a poszter FUTOTT.
  const root = gyoker();
  irBufferGuard(root, join, jo({ kikuldve: 0 }));
  const g = guardOlvas(root);
  assert.ok(g, 'meg sem született az őrszem-fájl');
  assert.deepEqual(g.problems, []);
  assert.ok(Date.now() - Date.parse(g.at) < 60000, 'friss `at` bélyeg kell — ebből látszik, hogy futott');
  takarit(root);
});

t('📓 a fájl a `{at, problems:[…]}` mintát követi (a riport ezt olvassa)', () => {
  const root = gyoker();
  irBufferGuard(root, join, jo({ tokenVan: false }));
  const g = guardOlvas(root);
  assert.ok(typeof g.at === 'string' && g.at.length >= 20);
  assert.ok(Array.isArray(g.problems) && g.problems.length === 1);
  assert.equal(g.problems[0].code, 'NINCS_TOKEN');
  assert.ok(bufferSor(g).startsWith('⚠️'), 'a fájlból közvetlenül kijön a riport-sor');
  takarit(root);
});

t('📓 a KIKÜLDÖTT DARABSZÁM is bekerül — enélkül a „futott" még nem „posztolt"', () => {
  const root = gyoker();
  irBufferGuard(root, join, jo({ kikuldve: 3 }));
  assert.equal(guardOlvas(root).kikuldve, 3);
  takarit(root);
});

t('📓 az őr-fájl írása SOSEM dobhat (a hibája nem ronthatja el a posztolást)', () => {
  // Nem létező, nem is létrehozható gyökér: a poszter fusson tovább.
  assert.doesNotThrow(() => irBufferGuard('\0érvénytelen', join, jo()));
});

t('🕰️ az ELMARADT futás a frissesség-őrön akad fenn', () => {
  // A guard-freshness.js 26 óránál idősebb állapotfájlra szólal meg. Ez az
  // az eset, amikor a poszter EL SEM INDULT (kimaradt CI-futás, törölt lépés).
  const regi = { at: new Date(Date.now() - 30 * 3600e3).toISOString(), problems: [] };
  const sor = frissessegSor(elavultOrszemek({ Buffer: regi }));
  assert.match(sor, /Buffer/);
  assert.ok(sor.startsWith('⚠️'));
  // …a friss viszont NEM ad hamis riasztást:
  assert.equal(frissessegSor(elavultOrszemek({ Buffer: { at: new Date().toISOString() } })), '');
});

// ── 4. A BUKÁS ELJUT AZ ŐRSZEMIG (a reel-post 2026-08-30-i leckéje) ──

await at('📓 sikeres futás után problems:[] kerül a fájlba', async () => {
  const root = gyoker();
  await futtatBuffer({ ROOT: root, join, fn: async () => jo() });
  assert.deepEqual(guardOlvas(root).problems, []);
  takarit(root);
});

await at('🚨 az ÖSSZEOMLÁS bekerül a fájlba — ÉS tovább is megy a CI felé', async () => {
  // ⚠️ UGYANEZ A HIBA VOLT A reel-post.js-BEN: ott a `process.exit(1)`
  // MEGELŐZTE az őrszem-írást, tehát a bukás sosem került a guard-fájlba.
  // Itt a sorrend fordított: előbb az őr-fájl, aztán a kilépőkód.
  const root = gyoker();
  await assert.rejects(
    () => futtatBuffer({ ROOT: root, join, fn: async () => { throw new Error('fetch failed'); } }),
    /fetch failed/, 'a hibát tovább kell adni: enélkül a CI zöld pipát adna');
  const g = guardOlvas(root);
  assert.ok(g, 'meg sem született az őrszem-fájl — a riport hallgatna');
  assert.deepEqual(g.problems.map(x => x.code), ['BUFFER_OSSZEOMLAS']);
  assert.match(g.problems[0].detail, /fetch failed/, 'az OK is kell, nem csak a tény');
  takarit(root);
});

await at('📓 az előző futás sikerét FELÜLÍRJA a mai bukás', async () => {
  const root = gyoker();
  await futtatBuffer({ ROOT: root, join, fn: async () => jo() });
  assert.deepEqual(guardOlvas(root).problems, []);
  await assert.rejects(() => futtatBuffer({ ROOT: root, join, fn: async () => { throw new Error('401') } }));
  assert.equal(guardOlvas(root).problems.length, 1, 'a tegnapi „minden rendben" maradt bent');
  takarit(root);
});

await at('🧪 PRÓBA-módban (eles:false) NEM írjuk felül a CI állapotát', async () => {
  // Egy helyi `--dry` futás különben friss `at`-ot és üres problems-et hagyna
  // — vagyis épp azt hazudná a riportnak, hogy az ÉLES poszter rendben futott.
  const root = gyoker();
  await futtatBuffer({ ROOT: root, join, eles: false, fn: async () => jo() });
  assert.equal(guardOlvas(root), null);
  await assert.rejects(() => futtatBuffer({ ROOT: root, join, eles: false, fn: async () => { throw new Error('x') } }));
  assert.equal(guardOlvas(root), null, 'a próba-futás összeomlása sem írhatja felül az éles állapotot');
  takarit(root);
});

// ── 5. BE VAN-E KÖTVE? (a két nem importálható fájl) ─────────────────
//
// ⚠️ EZ SZÖVEG-ELLENŐRZÉS, NEM FUTTATÁS. Sem a `buffer-poster.js` (valódi
// posztot küldene), sem a `daily-report.js` (valódi Telegram-üzenetet küld)
// nem importálható. A logika ezért van itt, `core/`-ban, tesztelve — ezek a
// sorok csak azt őrzik, hogy a KÉT VÉGE ÖSSZE IS VAN KÖTVE. Enélkül a
// tökéletes modul kint állhatna használatlanul (mint a guide-coverage-guard,
// amit 2026-08-29-ig SENKI nem olvasott).

const POSZTER = readFileSync(join(REPO, 'agents', 'social', 'buffer-poster.js'), 'utf-8');
const RIPORT = readFileSync(join(REPO, 'core', 'daily-report.js'), 'utf-8');

t('🔌 a buffer-poster az őrszemen KERESZTÜL indítja a main()-t', () => {
  assert.match(POSZTER, /buffer-guard\.js/, 'nincs behúzva a core/buffer-guard.js');
  // ⚠️ A puszta „szerepel a fájlban: futtatBuffer" KEVÉS: a mutációs próba
  // mutatta ki, hogy a hívást ki lehetett cserélni sima `main()`-re — az
  // IMPORT-sor és a kommentek miatt a szó ott maradt, és a teszt átengedte.
  // Ezért a FÁJL VÉGI INDÍTÁST nézzük meg, nem az említést.
  const inditas = POSZTER.lastIndexOf('.then(() => process.exit(0))');
  assert.ok(inditas > 0, 'nincs meg a fájl végi indítás');
  assert.match(POSZTER.slice(Math.max(0, inditas - 140), inditas), /futtatBuffer\(\s*\{/,
    'a main() az őrszem MEGKERÜLÉSÉVEL indul — nem születne őr-fájl');
});

t('🚨 a buffer-poster hibaágon 1-gyel lép ki, nem 0-val', () => {
  // Ez volt a néma hiba forrása: `catch(e => { …; process.exit(0) })`.
  const catchAg = POSZTER.slice(POSZTER.lastIndexOf('.catch('));
  assert.ok(catchAg.length > 0, 'nincs .catch a fájl végén');
  assert.match(catchAg, /process\.exit\(1\)/, 'a hibaág 0-val lép ki — a CI zöld marad');
  assert.ok(!/process\.exit\(0\)/.test(catchAg), 'a hibaágon exit(0) maradt');
});

t('🔌 a napi riport beolvassa a buffer-guard.json-t — ÉS fel is használja', () => {
  assert.match(RIPORT, /bufferSor/, 'a riport nem hívja a sor-építőt');
  // ⚠️ A puszta „szerepel benne a fájlnév" KEVÉS: a mutációs próba mutatta ki,
  // hogy a beolvasást ki lehetett venni (`const bufg = null`) úgy, hogy a név a
  // frissesség-listában maradva minden tesztet átengedett. Ezért a beolvasás
  // KÖZELÉBEN kell lennie a felhasználásnak is.
  const olvas = RIPORT.indexOf("'buffer-guard.json'), 'utf-8')");
  assert.ok(olvas > 0, 'a riport nem olvassa be a memory/buffer-guard.json-t');
  assert.match(RIPORT.slice(olvas, olvas + 200), /bufferSor\(/, 'beolvassa, de nem használja fel');
});

t('🕰️ a buffer-guard a FRISSESSÉG-listában is szerepel', () => {
  // Enélkül az „el sem indult" eset láthatatlan marad: a fájl nem frissül, de
  // senki nem nézi az `at` bélyegét.
  const kezd = RIPORT.indexOf('const nevek = {');
  assert.ok(kezd > 0, 'eltűnt a frissesség-őr név-listája a riportból');
  const lista = RIPORT.slice(kezd, RIPORT.indexOf('};', kezd));
  assert.match(lista, /'buffer-guard\.json'/, 'nincs a frissesség-őr listájában');
});

// ── 6. AZ ÉLES FÁJL ÉRINTETLEN ──────────────────────────────────────

t('🔒 a valódi memory/buffer-guard.json érintetlen maradt', () => {
  const most = existsSync(VALODI_GUARD) ? readFileSync(VALODI_GUARD, 'utf-8') : null;
  assert.equal(most, GUARD_EREDETI, 'a teszt beleírt az ÉLES őrszem-fájlba');
});

if (GUARD_EREDETI !== null) writeFileSync(VALODI_GUARD, GUARD_EREDETI, 'utf-8');

console.log(bukott === 0
  ? '\n✅ buffer-guard.test: mind a ' + pass + ' eset rendben'
  : '\n❌ buffer-guard.test: ' + bukott + ' bukott (' + pass + ' rendben)');
process.exit(bukott === 0 ? 0 : 1);
