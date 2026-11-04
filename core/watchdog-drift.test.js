// ===================================================================
// TESZT — őrkutya-sodródás: az ÉLŐ Worker régi kódot futtat-e?
// ===================================================================
// INGYENES, hálózat nélküli: a vizsgálat tiszta függvény, futáslistát kap.
//
// MIÉRT LÉTEZIK EZ (2026-09-07, élesben megtörtént):
// A `TURELEM_ORA` 9,5 → 14 javítás 09-06-án bekerült a repóba, ÉS ZÖLD VOLT
// a tesztje. Csakhogy a döntést a Cloudflare Worker futtatja, az pedig a
// `wrangler deploy` pillanatában befagyasztott bundle-ből dolgozik — és a
// Worker-telepítés NINCS a CI-ban. Utolsó deploy: 08-30. A javítás tehát
// 7 napig papíron volt meg.
//
// A SZÁMLA: 08-30 óta 7 fölösleges pótfutás, mind a régi 9,5 órás küszöb
// miatt. Mindegyik után perceken belül megjött az ütemezett futás magától:
//     09-01 +44 p · 09-02 +14 p · 09-03 +12 p · 09-04 +13 p · 09-07 +99 p
//
// 🔑 A LELET ALAKJA: nem a kód volt rossz, hanem a JAVÍTÁS NEM ÉRT CÉLBA.
// Ugyanaz az osztály, mint az `embedStatus()`-nál volt. Egy teszt, ami a
// forrást nézi, EZT SOHA NEM LÁTJA — mert a forrásban minden rendben van.
// Ezért ez az őr nem a kódot méri, hanem a KÜLVILÁG VISELKEDÉSÉT: ha egy
// pótfutás a küszöbnél KISEBB résnél sült el, az cáfolhatatlan bizonyíték,
// hogy az élő kód nem az, ami a repóban áll.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import {
  CATCHUP_CIM, ABLAK_ORA, sodrodasVizsgalat, sodrodasSor, futasokLekerdez
} from './watchdog-drift.js';
import { TURELEM_ORA } from './pipeline-watchdog.js';

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

// ⚠️ A `t()` SZINKRON: egy `async` függvényt AZONNAL „zöldnek" látna, mert a
// visszaadott ígéret elutasítását nem kapja el, a `pass++` viszont lefut.
// A néma hamis zöld pontosan az a hiba, amit ez a fájl üldöz — ezért az
// aszinkron eseteknek saját, MEGVÁRT társuk van. Hogy ez nem csak szándék:
// a lekérdező-tesztek a `futasokLekerdez()` megírása előtt pirosak voltak.
const ta = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 őrkutya-sodródás — az élő Worker elavultsága\n');

// Segéd: a GitHub API alakját utánzó futás-bejegyzés.
const futas = (at, event, cim) => ({ created_at: at, event, display_title: cim });
const utemezett = at => futas(at, 'schedule', 'AI World Co. — auto pipeline');
const potfutas = at => futas(at, 'repository_dispatch', CATCHUP_CIM);

// ===================================================================
// 1. A VALÓDI ESET — 2026-09-07, kimérve a GitHub API-ból
// ===================================================================
t('🔑 a VALÓDI 09-07-i eset: pótfutás 10,4 órás résnél → SODRÓDÁS', () => {
  const futasok = [
    utemezett('2026-09-07T13:46:29Z'),
    potfutas('2026-09-07T12:07:35Z'),
    utemezett('2026-09-07T01:45:14Z')
  ];
  const e = sodrodasVizsgalat(futasok, {
    turelemOra: 14, most: Date.parse('2026-09-07T14:00:00Z')
  });
  assert.equal(e.sodrodik, true, 'a 10,4 órás rés 14 órás türelemnél LEHETETLEN');
  assert.equal(e.esetek.length, 1);
  assert.ok(Math.abs(e.esetek[0].resOra - 10.37) < 0.05,
    'rossz rés: ' + e.esetek[0].resOra);
});

// ===================================================================
// 2. A MÁSIK IRÁNY — a szabályos pótfutás NEM sodródás
// ===================================================================
// Enélkül az őr mindig sikítana, és a hallgatása semmit nem bizonyítana.
t('🔑 a KÜSZÖB FÖLÖTTI résnél indult pótfutás RENDBEN van', () => {
  const futasok = [
    potfutas('2026-09-07T18:07:00Z'),      // 16,4 órás rés → jogos
    utemezett('2026-09-07T01:45:00Z')
  ];
  const e = sodrodasVizsgalat(futasok, {
    turelemOra: 14, most: Date.parse('2026-09-07T19:00:00Z')
  });
  assert.equal(e.sodrodik, false, 'a jogos pótfutást sodródásnak mondta');
  assert.equal(e.esetek.length, 0);
});

// ===================================================================
// 3. A HAMIS RIASZTÁS FŐ FORRÁSA — a Telegram-parancs IS dispatch
// ===================================================================
// Élesben mérve: a `repository_dispatch` esemény KÉT dolgot takar —
//     display_title: "pipeline-catchup"   → az őrkutya
//     display_title: "telegram-command"   → a user parancsa a botban
// A user bármikor indíthat futást a telefonjáról, akár 10 perccel az
// előző után. Ha az őr pusztán az ESEMÉNYRE szűrne, minden ilyen parancs
// „sodródás"-t jelentene — és a user a SAJÁT gombnyomásáról kapna riasztást.
t('⚠️ a `telegram-command` NEM pótfutás — nem szabad riasztania', () => {
  const futasok = [
    futas('2026-09-07T02:05:00Z', 'repository_dispatch', 'telegram-command'),
    utemezett('2026-09-07T01:45:00Z')       // 20 perc — bőven a küszöb alatt
  ];
  const e = sodrodasVizsgalat(futasok, {
    turelemOra: 14, most: Date.parse('2026-09-07T03:00:00Z')
  });
  assert.equal(e.sodrodik, false,
    'a user saját Telegram-parancsát őrkutya-hibának mondta');
});

// ===================================================================
// 4. „NEM TUDOM" ≠ „RENDBEN"
// ===================================================================
// A `shouldTrigger()` saját precedense: ha nem derül ki az igazság, NEM
// állítunk semmit. Egy őr, ami adathiánynál „minden rendben"-t mond,
// pontosan akkor hallgat, amikor a legnagyobb szükség lenne rá.
t('🔑 üres/érvénytelen bemenetre NEM mond „rendben"-t', () => {
  for (const rossz of [null, undefined, [], 'nem lista', 42, [{}]]) {
    const e = sodrodasVizsgalat(rossz, { turelemOra: 14, most: Date.now() });
    assert.equal(e.sodrodik, false, 'sodródást állított adat nélkül');
    assert.equal(e.ismeretlen, true,
      'adathiányt „rendben"-nek látott: ' + JSON.stringify(rossz));
  }
});

t('a pótfutás ELŐTT nincs futás a listában → ismeretlen, nem „rendben"', () => {
  const e = sodrodasVizsgalat([potfutas('2026-09-07T12:07:35Z')], {
    turelemOra: 14, most: Date.parse('2026-09-07T14:00:00Z')
  });
  assert.equal(e.sodrodik, false);
  assert.equal(e.ismeretlen, true, 'rés nélkül is ítélkezett');
});

// ===================================================================
// 5. AZ ABLAK — a MEGJAVÍTOTT hiba ne kiabáljon egy hétig
// ===================================================================
t('az ablakon KÍVÜLI régi eset már nem szól', () => {
  const futasok = [
    potfutas('2026-09-01T12:07:32Z'),
    utemezett('2026-09-01T02:30:47Z')
  ];
  const e = sodrodasVizsgalat(futasok, {
    turelemOra: 14, most: Date.parse('2026-09-07T14:00:00Z')  // 6 nappal később
  });
  assert.equal(e.sodrodik, false, 'egy héttel korábbi, már javított esetről szólt');
});

t('az ablak elég tág, hogy egy napi jelentés se csússzon át rajta', () => {
  // A napi riport naponta EGYSZER megy ki (a dedup miatt). Ha az ablak 24
  // óránál rövidebb lenne, egy kicsit később kiküldött jelentés kihagyhatná
  // a tegnapi leletet — a hiba NÉMÁN elveszne.
  assert.ok(ABLAK_ORA >= 26, 'az ablak szűkebb egy napnál + tartaléknál: ' + ABLAK_ORA);
});

// ===================================================================
// 6. A RÉS AZ ELŐZŐ futáshoz mérendő — BÁRMILYEN eseményű az
// ===================================================================
// A Worker a `runs?per_page=1` végpontot kérdezi: a legfrissebb futást,
// eseménytől függetlenül. Ha az őr csak az ütemezett futásokat nézné,
// nagyobb rést számolna, mint amit a Worker látott — és egy valódi
// sodródást „rendben"-nek minősítene.
t('🔑 a rést a KÖZVETLENÜL előző futáshoz méri, akármi indította', () => {
  const futasok = [
    potfutas('2026-09-07T12:07:00Z'),
    futas('2026-09-07T11:00:00Z', 'repository_dispatch', 'telegram-command'),
    utemezett('2026-09-06T20:00:00Z')       // ha EZT venné, 16,1 óra lenne
  ];
  const e = sodrodasVizsgalat(futasok, {
    turelemOra: 14, most: Date.parse('2026-09-07T13:00:00Z')
  });
  assert.equal(e.sodrodik, true, 'a közbeeső futást átugorva rendben-t mondott');
  assert.ok(Math.abs(e.esetek[0].resOra - 1.117) < 0.05, 'rossz rés: ' + e.esetek[0].resOra);
});

t('a bemenet SORRENDJÉTŐL nem függ az eredmény', () => {
  const lista = [
    utemezett('2026-09-07T01:45:14Z'),
    utemezett('2026-09-07T13:46:29Z'),
    potfutas('2026-09-07T12:07:35Z')
  ];
  const e = sodrodasVizsgalat(lista, {
    turelemOra: 14, most: Date.parse('2026-09-07T14:00:00Z')
  });
  assert.equal(e.sodrodik, true, 'fordított sorrendű listán elvesztette a leletet');
});

// ===================================================================
// 7. A RIPORT-SOR — némán, ha nincs baj (a projekt bevett alakja)
// ===================================================================
t('a riport-sor NÉMA, ha nincs sodródás', () => {
  assert.equal(sodrodasSor({ sodrodik: false, ismeretlen: false, esetek: [] }), null);
});

t('adathiánynál is NÉMA — nem gyárt zajt abból, hogy nem tudta lekérdezni', () => {
  assert.equal(sodrodasSor({ sodrodik: false, ismeretlen: true, esetek: [] }), null);
});

t('🔑 sodródásnál kimondja a MEGOLDÁST is, nem csak a tünetet', () => {
  const sor = sodrodasSor({
    sodrodik: true, ismeretlen: false,
    esetek: [{ at: '2026-09-07T12:07:35Z', resOra: 10.37 }],
    turelemOra: 14
  });
  assert.ok(sor, 'nem adott sort valódi sodródásra');
  assert.ok(/10,4|10\.4/.test(sor), 'a rés nincs benne: ' + sor);
  assert.ok(/14/.test(sor), 'a türelem nincs benne: ' + sor);
  assert.ok(/deploy/i.test(sor), 'nem mondja meg, mit kell tenni: ' + sor);
});

// ===================================================================
// 8. BEKÖTÉS-ŐR — a lelet ELJUT a userhez
// ===================================================================
// A projekt legdrágább tanulsága: „az őrszem csak akkor őr, ha odaszól,
// ahol a user néz." Az i18n-őr HÓNAPOKIG pontosan látta a hibát, de csak
// a CI-naplóba írt. Futásidőben ezt nem lehet ellenőrizni, mert a
// `daily-report.js` importálása Telegram-üzenetet küldene.
t('🔌 a sodródás-sor be van kötve a NAPI JELENTÉSBE', () => {
  const forras = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.ok(/from '\.\/watchdog-drift\.js'/.test(forras),
    'nincs import a watchdog-drift.js-ből');

  // ⚠️ AZ ELSŐ VÁLTOZATOM ITT PUSZTÁN `/sodrodasSor/`-t keresett — és a
  // mutációs próba ÁTENGEDTE a bekötés elvágását, mert az IMPORT SORBAN is
  // ott a név. Egy behozott, de sosem hívott függvény pontosan úgy néz ki
  // forrásszinten, mint egy működő bekötés. A HÍVÁST kell keresni.
  assert.ok(/sodrodasSor\s*\(\s*sodrodasVizsgalat\s*\(/.test(forras),
    'a sodrodasSor() csak IMPORTÁLVA van, nem HÍVVA — a lelet senkihez nem jut el');
  assert.ok(/sodrodasVizsgalat\s*\([\s\S]{0,60}futasokLekerdez\s*\(/.test(forras),
    'a vizsgálat nem a friss futáslistából dolgozik');
  assert.ok(/sodrodasSor[\s\S]{0,120}lines\.push\(sor\)/.test(forras),
    'a sor elkészül, de nem kerül bele a jelentésbe');
});

// ===================================================================
// 9. A KÜSZÖB EGY HELYEN ÉL
// ===================================================================
// „Egy szám, amit két helyre másolnak, elcsúszik egymástól." Az őr a
// `pipeline-watchdog.js`-ből veszi a türelmet — ha valaki átírja, az őr
// magától követi.
t('🔑 az őr a VALÓDI türelem-konstansból dolgozik, nem másolatból', () => {
  const forras = readFileSync(new URL('./watchdog-drift.js', import.meta.url), 'utf-8');
  assert.ok(/from '\.\/pipeline-watchdog\.js'/.test(forras),
    'nem a pipeline-watchdog.js-ből veszi a türelmet — a két szám el fog csúszni');
  assert.ok(!/turelemOra\s*=\s*\d+(\.\d+)?\s*[;,)]/.test(forras.replace(/turelemOra = TURELEM_ORA/g, '')),
    'beégetett türelem-szám van a fájlban');
  assert.equal(typeof TURELEM_ORA, 'number');
});

// ===================================================================
// 10. A LEKÉRDEZŐ — itt bukik el a legtöbb őr: a HATÁRON
// ===================================================================
// A tiszta függvény lehet tökéletes, miközben a köré tekert I/O egy
// sikertelen lekérdezést ÜRES LISTÁVÁ alakít — és az üres lista „nincs
// pótfutás, minden rendben"-nek látszik. Pontosan ez a „nem tudom → igen"
// hiba, csak egy réteggel kijjebb. SOHA nem hívunk valódi hálózatot.
const azonnal = (allapot, torzs) => async () => ({
  ok: allapot >= 200 && allapot < 300,
  status: allapot,
  json: async () => torzs
});

await ta('🔑 HTTP-hibánál `null`-t ad, NEM üres listát', async () => {
  const r = await futasokLekerdez({ repo: 'a/b', token: 'x', fetchFn: azonnal(500, {}) });
  assert.equal(r, null, 'HTTP 500-ból „nincs pótfutás" lett volna');
});

await ta('🔑 a hibás lekérdezésből ISMERETLEN lesz, nem „rendben"', async () => {
  const e = sodrodasVizsgalat(
    await futasokLekerdez({ repo: 'a/b', token: 'x', fetchFn: azonnal(500, {}) }),
    { turelemOra: 14, most: Date.now() });
  assert.equal(e.ismeretlen, true, 'a hálózati hiba „minden rendben"-né vált');
  assert.equal(e.sodrodik, false);
});

await ta('a lekérdezés kivételére sem dob és sem hazudik', async () => {
  const r = await futasokLekerdez({
    repo: 'a/b', token: 'x', fetchFn: async () => { throw new Error('ECONNRESET'); }
  });
  assert.equal(r, null);
});

await ta('repó nélkül MEG SEM PRÓBÁLJA — nem pazarol kérést', async () => {
  let hivva = 0;
  const r = await futasokLekerdez({
    repo: '', token: 'x', fetchFn: async () => { hivva++; return azonnal(200, {})(); }
  });
  assert.equal(r, null);
  assert.equal(hivva, 0, 'repó nélkül is elküldte a kérést');
});

await ta('hiányzó `workflow_runs` mezőre `null`, nem üres lista', async () => {
  const r = await futasokLekerdez({ repo: 'a/b', token: 'x', fetchFn: azonnal(200, { valami: 1 }) });
  assert.equal(r, null, 'idegen alakú válaszból „nincs pótfutás" lett volna');
});

await ta('sikeres lekérdezésnél a futáslistát adja vissza', async () => {
  const r = await futasokLekerdez({
    repo: 'a/b', token: 'x',
    fetchFn: azonnal(200, { workflow_runs: [utemezett('2026-09-07T01:45:14Z')] })
  });
  assert.equal(Array.isArray(r), true);
  assert.equal(r.length, 1);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} watchdog-drift.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
