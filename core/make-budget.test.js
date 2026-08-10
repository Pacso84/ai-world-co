// ===================================================================
// TESZT — Make művelet-őr
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT: a Facebook-posztolás havi 1000 INGYENES Make-műveletből él, és a
// forgalmunk ~82%-a onnan jön. Ha a keret elfogy, a fő csatorna áll le —
// némán, mert a Make egyszerűen nem futtatja tovább a forgatókönyvet.
// 2026-08-10-én emeltük napi 6-ról 9 posztra (27 művelet/nap), miközben a
// hónap első kilenc napján a Pinterest is ugyanabból a keretből evett.
// ===================================================================

import assert from 'assert/strict';
import {
  postsPerRun, remainingDays, sumMonthOps, untrackedOps,
  MONTHLY_CAP, SAFETY_CAP, OPS_PER_POST, RUNS_PER_DAY
} from './make-budget.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Make művelet-őr\n');

// ---------- a hónapból hátralévő napok ----------
t('a mai nap is beleszámít (ma is futunk még)', () => {
  assert.equal(remainingDays('2026-08-31'), 1, 'a hónap utolsó napján még van egy nap');
  assert.equal(remainingDays('2026-08-10'), 22, 'aug 10 → 10-től 31-ig 22 nap');
  assert.equal(remainingDays('2026-08-01'), 31);
  assert.equal(remainingDays('2026-02-10'), 19, '2026 február 28 napos');
});

// ---------- a naplóból összegzett műveletek ----------
t('csak az adott hónap műveleteit adja össze', () => {
  const logs = [
    { timestamp: '2026-08-10T01:20:48Z', operations: 9 },
    { timestamp: '2026-08-09T19:02:00Z', operations: 6 },
    { timestamp: '2026-07-31T23:59:00Z', operations: 99 }   // előző hónap — nem számít
  ];
  assert.equal(sumMonthOps(logs, '2026-08'), 15);
});

t('a hiányzó operations mező nem dönti el', () => {
  // A Make "warning" sorai nem tartalmaznak operations mezőt.
  assert.equal(sumMonthOps([{ timestamp: '2026-08-01T00:00:00Z' }], '2026-08'), 0);
  assert.equal(sumMonthOps(null, '2026-08'), 0);
});

// ---------- a fő döntés ----------
t('bőséges keretnél a teljes tempó megy', () => {
  // 100 művelet elhasználva, 5 nap hátra: bármit kibírunk.
  assert.equal(postsPerRun({ used: 100, day: '2026-08-27', defaultLimit: 3 }), 3);
});

t('szoros keretnél VISSZAVESZ, de nem áll le', () => {
  // 430 elhasználva, aug 10 (22 nap hátra):
  //   3 poszt/futás → 430 + 22*3*3*3 = 1024  ❌ a 900-as fék fölött
  //   2 poszt/futás → 430 + 22*3*2*3 =  826  ✅
  const n = postsPerRun({ used: 430, day: '2026-08-10', defaultLimit: 3 });
  assert.equal(n, 2, 'egy fokozattal lejjebb, nem nullára');
});

t('a hónap vége felé magától visszaáll a teljes tempó', () => {
  // Ugyanaz a felhasználás, de már csak 3 nap van hátra:
  //   3 poszt/futás → 430 + 3*3*3*3 = 511 ✅ belefér
  assert.equal(postsPerRun({ used: 430, day: '2026-08-29', defaultLimit: 3 }), 3);
});

t('elfogyott keretnél NEM küldünk — a poszt elveszne', () => {
  // A Make ilyenkor nem futtatja a forgatókönyvet: a webhook 200-at adna,
  // a poszt mégsem menne ki, mi meg "kiküldve"-nek jelölnénk. Az a legrosszabb:
  // némán veszne el, és soha nem próbálnánk újra.
  assert.equal(postsPerRun({ used: MONTHLY_CAP, day: '2026-08-20', defaultLimit: 3 }), 0);
  assert.equal(postsPerRun({ used: 1200, day: '2026-08-20', defaultLimit: 3 }), 0);
});

t('a legszűkebb esetben is megy legalább egy poszt', () => {
  // 890 elhasználva, 20 nap hátra: 1 poszt/futás is 890+20*3*1*3 = 1070 > 900,
  // de a keret MÉG NEM fogyott el — jobb lassan posztolni, mint megállni.
  assert.equal(postsPerRun({ used: 890, day: '2026-08-12', defaultLimit: 3 }), 1);
});

// ---------- hibatűrés ----------
t('ismeretlen felhasználásnál a teljes tempó megy', () => {
  // Ha a Make API nem válaszol, NEM fékezünk: egy API-hiba miatti leállás
  // azonnali és biztos kár, a keret kifutása bizonytalan és a hónap végi.
  // Ugyanez az elv, mint a scenario-guard-ban (apiFailed → küldjük).
  assert.equal(postsPerRun({ used: null, day: '2026-08-10', defaultLimit: 3 }), 3);
  assert.equal(postsPerRun({ used: NaN, day: '2026-08-10', defaultLimit: 3 }), 3);
  assert.equal(postsPerRun({ used: 500, day: 'nem-datum', defaultLimit: 3 }), 3);
});

t('a limit sosem nő a kértnél nagyobbra', () => {
  assert.equal(postsPerRun({ used: 0, day: '2026-08-30', defaultLimit: 2 }), 2);
  assert.equal(postsPerRun({ used: 0, day: '2026-08-30', defaultLimit: 1 }), 1);
});

// ---------- a beállítások maradjanak együtt a valósággal ----------
t('a konstansok a mért valóságot tükrözik', () => {
  assert.equal(MONTHLY_CAP, 1000, 'az ingyenes Make-csomag havi kerete');
  assert.equal(OPS_PER_POST, 3, 'webhook + kép letöltése + fénykép feltöltése');
  assert.equal(RUNS_PER_DAY, 3, 'a CI 8 óránként fut');
  assert.ok(SAFETY_CAP < MONTHLY_CAP, 'a fék a plafon ALATT van');
});

// ---------- a naplóból NEM látszó felhasználás ----------
// A Pinterest 2026-08-01…08-09 között ugyanebből a keretből evett, de a
// forgatókönyv törlésével a naplói is eltűntek. Ami nem mérhető, azt sem
// hagyhatjuk figyelmen kívül — csak jelölni kell, hogy becslés.
t('augusztusra van korrekció, más hónapokra nincs', () => {
  assert.ok(untrackedOps('2026-08') > 0, 'a törölt Pinterest maradéka');
  assert.equal(untrackedOps('2026-09'), 0, 'szeptembertől már csak a Facebook fut');
  assert.equal(untrackedOps('2026-07'), 0, 'visszamenőleg nem számolunk');
  assert.equal(untrackedOps(''), 0);
});

t('a korrekcióval a mai állapot ténylegesen fékez', () => {
  // Ez nem elmélet: 2026-08-10-én a Facebook naplója 186 műveletet mutatott.
  // 3 poszt/futással a hó végi vetítés 1000 FÖLÉ megy — tehát a fék indokolt,
  // nem a becslés óvatosságán múlik.
  const used = 186 + untrackedOps('2026-08');
  assert.ok(used + 22 * RUNS_PER_DAY * 3 * OPS_PER_POST > MONTHLY_CAP,
    'a teljes tempó tényleg kifutna a keretből');
  assert.equal(postsPerRun({ used, day: '2026-08-10', defaultLimit: 3 }), 2);
});

t('szeptemberben a teljes tempó belefér', () => {
  // 9 poszt/nap × 3 művelet × 30 nap = 810 — ezért volt jó a 6→9 emelés.
  assert.equal(postsPerRun({ used: untrackedOps('2026-09'), day: '2026-09-01', defaultLimit: 3 }), 3);
});

console.log('\n✅ make-budget.test: mind a ' + pass + ' eset rendben');
