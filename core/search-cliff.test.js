// ===================================================================
// TESZT — kereső-szakadék: lépcsőben esett-e le a megjelenésünk?
// ===================================================================
// INGYENES, hálózat nélküli: tiszta függvény, számsort kap.
//
// MIÉRT LÉTEZIK (2026-09-08)
// ──────────────────────────
// A Bing 2026-08-21-én napi 38-76 megjelenésről PONTOSAN nullára esett, és 18
// napig senki nem vette észre. Pedig a heti kereső-riport végig ment.
//
// 🔑 AZÉRT NEM VETTÜK ÉSZRE, MERT A RIPORT ÖSSZEGET ÍRT KI, NEM VÁLTOZÁST.
// A memóriában ez állt: „Bing 832 megj / 11 katt (mérve 08-26)" — csakhogy az
// a 832 szinte teljes egészében a szakadék ELŐTTI napokból jött. Egy 30 napos
// összeg matematikailag képtelen megmutatni egy lépcsőt: hetekig magas marad
// azután is, hogy a napi érték nullára esett.
//
// Ugyanaz a hibaosztály, mint a mai többi leletünk: a szám ott volt, csak
// olyan alakban, amiben a baj nem látszik.
//
// ⚠️ AMIT EZ AZ ŐR NEM CSINÁL: nem mondja meg, MIÉRT esett le. Csak azt, hogy
// leesett, és mikortól. A miértre nincs adatunk — az a keresők doboza.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import {
  szakadekVizsgalat, szakadekSor, MIN_ALAP_NAPI, MIN_SZAKADEK_NAP
} from './search-cliff.js';

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 kereső-szakadék — lépcsőben esett-e le a megjelenés\n');

const sor = (kezdet, ertekek) => ertekek.map((m, i) => {
  const d = new Date(Date.parse(kezdet + 'T00:00:00Z') + i * 86400e3);
  return { date: d.toISOString().slice(0, 10), impressions: m };
});

// ===================================================================
// 1. A VALÓDI ESET — a Bing tényleges napi adatsora (Webmaster API)
// ===================================================================
const BING_VALODI = sor('2026-08-07', [
  37, 11, 33, 69, 76, 46, 65, 44, 28, 52, 53, 62, 47, 38,   // 08-07 … 08-20
  0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0            // 08-21 … 09-05
]);

t('🔑 a VALÓDI Bing-esetet elkapja', () => {
  const e = szakadekVizsgalat(BING_VALODI, { most: '2026-09-06' });
  assert.equal(e.szakadek, true, 'a 38→0 lépcsőt nem vette észre');
});

t('🔑 és megmondja a NAPOT is, amikor elkezdődött', () => {
  const e = szakadekVizsgalat(BING_VALODI, { most: '2026-09-06' });
  assert.equal(e.mikortol, '2026-08-21',
    'rossz napot jelölt meg: ' + e.mikortol + ' (a valóság: 2026-08-21)');
});

// ===================================================================
// 2. A MÁSIK IRÁNY — ami NEM szakadék, arról hallgatnia kell
// ===================================================================
// Enélkül az őr mindig sikítana, és a hallgatása semmit nem bizonyítana.
t('🔑 a szokásos ingadozásra NEM szól', () => {
  // Ugyanaz a nagyságrend végig, csak zajos.
  const e = szakadekVizsgalat(sor('2026-08-07', [
    37, 11, 33, 69, 76, 46, 65, 44, 28, 52, 53, 62, 47, 38,
    41, 29, 58, 33, 70, 44, 51, 36, 62, 48, 39, 55, 43, 60
  ]), { most: '2026-09-03' });
  assert.equal(e.szakadek, false, 'a normál ingadozást szakadéknak mondta');
});

t('a NÖVEKEDÉSRE végképp nem szól (az irány számít)', () => {
  const e = szakadekVizsgalat(sor('2026-08-07', [
    10, 12, 9, 11, 14, 10, 13, 12, 11, 9, 12, 10, 13, 11,
    40, 55, 61, 48, 72, 66, 80, 75, 91, 88, 77, 95, 84, 90
  ]), { most: '2026-09-03' });
  assert.equal(e.szakadek, false, 'a növekedést esésnek látta');
});

t('🔑 EGY-KÉT gyenge nap még NEM szakadék (a mutációs próba hozta ide)', () => {
  // A hétvége, egy kimaradt feltérképezés vagy egy ünnepnap simán nullázhat
  // két napot. Ha az őr arra is szólna, hetente riasztana, és a user
  // megtanulná átlapozni — onnantól a VALÓDI riasztás is elveszne.
  const e = szakadekVizsgalat(sor('2026-08-07', [
    37, 11, 33, 69, 76, 46, 65, 44, 28, 52, 53, 62, 47, 38,
    41, 29, 58, 33, 70, 44, 51, 36, 62, 48, 39, 55,
    0, 0                                              // két gyenge nap a végén
  ]), { most: '2026-09-03' });
  assert.equal(e.szakadek, false,
    'két nulla napból szakadékot csinált — hetente riasztana');
  assert.ok(MIN_SZAKADEK_NAP >= 4,
    'a kitartás-küszöb túl alacsony: ' + MIN_SZAKADEK_NAP);
});

t('🔑 KIS SZÁMOKRA nem riaszt — ott a zaj nagyobb, mint a jel', () => {
  // Napi 1-2 megjelenésnél a nullára esés statisztikailag semmit nem jelent.
  const e = szakadekVizsgalat(sor('2026-08-07', [
    2, 0, 1, 1, 0, 2, 1, 0, 1, 1, 2, 0, 1, 1,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  ]), { most: '2026-09-03' });
  assert.equal(e.szakadek, false,
    'napi 1 megjelenésből csinált riasztást — ez zaj, nem jel');
  assert.ok(MIN_ALAP_NAPI >= 3, 'a zajküszöb túl alacsony: ' + MIN_ALAP_NAPI);
});

// ===================================================================
// 3. „NEM TUDOM" ≠ „RENDBEN"
// ===================================================================
t('🔑 kevés adatra ISMERETLEN-t mond, nem „rendben"-t', () => {
  for (const rossz of [null, undefined, [], 'nem lista', 42, sor('2026-09-01', [5, 5, 5])]) {
    const e = szakadekVizsgalat(rossz, { most: '2026-09-06' });
    assert.equal(e.szakadek, false, 'szakadékot állított adat nélkül');
    assert.equal(e.ismeretlen, true,
      // ⚠️ `String(...)`: a `JSON.stringify(undefined)` maga is `undefined`,
      // és a `.slice()` ELDOBNA rajta — a teszt a saját hibaüzenetén bukna el.
      'adathiányt „rendben"-nek látott: ' + String(JSON.stringify(rossz)).slice(0, 40));
  }
});

t('hibás bemenetre nem dob', () => {
  for (const rossz of [[{}], [{ date: 'hopp', impressions: 'x' }], [null, undefined]]) {
    assert.doesNotThrow(() => szakadekVizsgalat(rossz, { most: '2026-09-06' }));
  }
});

// ===================================================================
// 4. A RIPORT-SOR
// ===================================================================
t('a sor NÉMA, ha nincs szakadék', () => {
  assert.equal(szakadekSor('Bing', { szakadek: false, ismeretlen: false }), null);
});

t('adathiánynál is NÉMA — abból nem csinálunk zajt', () => {
  assert.equal(szakadekSor('Bing', { szakadek: false, ismeretlen: true }), null);
});

t('🔑 szakadéknál kiírja a MOTORT, a NAPOT és a KÉT SZINTET', () => {
  const e = szakadekVizsgalat(BING_VALODI, { most: '2026-09-06' });
  const s = szakadekSor('Bing', e);
  assert.ok(s, 'nem adott sort valódi szakadékra');
  assert.ok(/Bing/.test(s), 'nincs benne a motor neve: ' + s);
  assert.ok(/2026-08-21|08-21/.test(s), 'nincs benne a nap: ' + s);
  assert.ok(/\d/.test(s), 'nincs benne szám: ' + s);
});

// ===================================================================
// 5. BEKÖTÉS-ŐR — a lelet ELJUT a userhez
// ===================================================================
// „Az őrszem csak akkor őr, ha odaszól, ahol a user néz." A heti kereső-riport
// az egyetlen hely, ahol a GSC- és Bing-kulcs egyáltalán rendelkezésre áll.
// ⚠️ A `search-report.js` importálása Telegram-üzenetet küldene — forrásból
// ellenőrizzük.
t('🔌 a szakadék-sor be van kötve a HETI KERESŐ-RIPORTBA', () => {
  const forras = readFileSync(new URL('./search-report.js', import.meta.url), 'utf-8');
  assert.ok(/from '\.\/search-cliff\.js'/.test(forras),
    'nincs import a search-cliff.js-ből');
  // A HÍVÁST keressük, nem a puszta nevet: egy behozott, de sosem hívott
  // függvény forrásszinten pontosan úgy néz ki, mint egy működő bekötés.
  assert.ok(/szakadekSor\s*\(/.test(forras),
    'a szakadekSor() csak importálva van, nem HÍVVA');
  assert.ok(/szakadekVizsgalat\s*\(/.test(forras),
    'a vizsgálat nem fut le a riportban');
  // ⚠️ A mutációs próba szökevénye volt: a hívás megmaradhat úgy is, hogy a
  // NAPI SOROZAT nem készül el — akkor a vizsgálat üres kézzel dolgozna, és
  // örökre „ismeretlen"-t mondana. A `getBing()` heti ÖSSZEGET adott vissza;
  // a napi bontást külön kellett hozzátenni, és külön kell őrizni is.
  assert.ok(/napok\.push\(/.test(forras),
    'a getBing() nem gyűjti a NAPI sorozatot — a szakadék-őr vakon futna');
  assert.ok(/return \{ clicks, impressions, napok \}/.test(forras),
    'a napi sorozat nem jut ki a getBing()-ből');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} search-cliff.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
