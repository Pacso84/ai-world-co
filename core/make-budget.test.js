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
  usedThisMonth, estimateOps,
  MONTHLY_CAP, SAFETY_CAP, OPS_PER_POST, RUNS_PER_DAY,
  SHARED_SCENARIOS, FB_SCENARIO_ID, REEL_SCENARIO_ID, REEL_OPS_PER_DAY
} from './make-budget.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
// Az aszinkron eseteknek (mock fetch) sajat futtato kell — ugyanaz a szamlalo.
const at = async (name, fn) => { await fn(); pass++; console.log('  ✅ ' + name); };

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
  // 430 elhasználva, aug 10 (22 nap = 66 kör hátra). A maradék keretből
  // (900-430=470) 156 poszt fér bele, ami 66 körre 2,36/kör — tehát az ELSŐ
  // körök 3-at kapnak, a törtrész nem vész el, aztán 2-re simul.
  // ⚠️ EZ A TESZT KORÁBBAN 2-t VÁRT: az egyenletes egész tempó a hónap végén
  // 46 posztnyi keretet HASZNÁLATLANUL hagyott, miközben 267 poszt várt sorára.
  const n = postsPerRun({ used: 430, day: '2026-08-10', defaultLimit: 3 });
  assert.equal(n, 3, 'a törtrészt az első körök kapják');
  // De szorosabb keretnél tényleg visszavesz (700 elhasználva, 14 nap hátra:
  // a maradék 200 műveletből 66 poszt fér, 42 körre = 1,57/kör → 2):
  assert.equal(postsPerRun({ used: 700, day: '2026-08-18', defaultLimit: 3 }), 2);
  // És a legszűkebb sávban 1-re megy le:
  assert.equal(postsPerRun({ used: 750, day: '2026-08-15', defaultLimit: 3 }), 1);
});

t('🛑 SOHA nem viszi a valódi plafon FÖLÉ (user: „véletlenül se fogyjon el")', () => {
  // EZT A HIBÁT A HÓNAP-SZIMULÁCIÓ TALÁLTA (2026-08-17). A „fék fölött lassan
  // megyünk tovább" ág addig küldött, amíg a used el nem érte az 1000-et —
  // csakhogy az UTOLSÓ poszt ÁTVITTE rajta: 950-ből indulva 1001 lett a vége.
  // A poszt ÁRÁT is bele kell számolni, nem elég az induló állást nézni.
  for (const used of [994, 996, 998, 999]) {
    const n = postsPerRun({ used, day: '2026-08-20', defaultLimit: 3 });
    assert.ok(used + n * OPS_PER_POST <= MONTHLY_CAP,
      `used=${used} → ${n} poszt = ${used + n * OPS_PER_POST} > ${MONTHLY_CAP}`);
  }
  // 998-ból egyetlen poszt (3 művelet) sem fér be:
  assert.equal(postsPerRun({ used: 998, day: '2026-08-20', defaultLimit: 3 }), 0);
});

t('🔁 a teljes hónapot végigjátszva sem futja túl a keretet', () => {
  // Nem állítás, hanem VÉGIGJÁTSZÁS: körről körre, a valódi fogyásból
  // újraszámolva — mert az őr önkorrigálására épül az egész logika.
  for (const [kezdo, nap] of [[100, 1], [430, 10], [592, 17], [880, 20], [950, 25]]) {
    let used = kezdo;
    for (let d = nap; d <= 31; d++) {
      const day = `2026-08-${String(d).padStart(2, '0')}`;
      for (let k = 0; k < 3; k++) used += postsPerRun({ used, day, defaultLimit: 3 }) * OPS_PER_POST;
    }
    assert.ok(used <= MONTHLY_CAP, `${kezdo}-ból indulva ${used} lett — túlfutott!`);
  }
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
    'a teljes tempó VÉGIG tényleg kifutna a keretből');

  // ⚠️ A MÉRŐPONT ÁTKERÜLT (2026-08-17). A teszt korábban azt nézte, hogy az
  // ELSŐ kör azonnal visszavesz-e. Az új őr viszont a maradék keretből számol:
  // előbb kiküldi a törtrészt teljes tempón, és CSAK UTÁNA fékez. A kérdés
  // tehát nem az, hogy mikor vesz vissza, hanem hogy a HÓNAP VÉGÉN belefér-e —
  // és hogy egyáltalán fékezett-e valahol.
  let u = used, fekezett = false;
  for (let d = 10; d <= 31; d++) {
    const day = `2026-08-${String(d).padStart(2, '0')}`;
    for (let k = 0; k < RUNS_PER_DAY; k++) {
      const n = postsPerRun({ used: u, day, defaultLimit: 3 });
      if (n < 3) fekezett = true;
      u += n * OPS_PER_POST;
    }
  }
  assert.ok(fekezett, 'a korrekció miatt valahol vissza KELLETT vennie');
  assert.ok(u <= MONTHLY_CAP, `a hónap ${u} művelettel zárt — a keret fölött!`);
});

t('szeptemberben a teljes tempó belefér', () => {
  // 9 poszt/nap × 3 művelet × 30 nap = 810 — ezért volt jó a 6→9 emelés.
  assert.equal(postsPerRun({ used: untrackedOps('2026-09'), day: '2026-09-01', defaultLimit: 3 }), 3);
});


// ===================================================================
// A KÖZÖS KERET — a Reel is ebből eszik (2026-08-30)
// ===================================================================
//
// A művelet-őr 2026-08-10 óta CSAK a Facebook-fotó forgatókönyvét (6452490)
// összegezte. A Facebook Reel 08-25-én éles lett a 7066389-esen, és azóta
// naponta 2 műveletet vesz el UGYANABBÓL az 1000-es fiók-keretből —
// láthatatlanul. A core/reel-post.js fejléce ezt ELŐRE leírta („a Make-keret
// sem szerepel itt… pipeline-ba kötés előtt a core/make-budget.js oldalán
// kell kezelni"), csak a bekötéskor nem történt meg.
//
// A veszély nem elméleti: alulbecsült fogyás → az őr későn fékez → a keret
// elfogy → a Make NEM futtatja a forgatókönyvet, a webhook mégis 200-at ad,
// mi „kiküldve"-nek jelöljük a posztot, és SOHA nem próbáljuk újra.

/** Mock Make-napló-végpont. `valaszok[id]` = sorok tömbje, vagy 'hiba'. */
function makeMock(valaszok) {
  const hivott = [];
  const f = async (url, opt = {}) => {
    const u = String(url);
    hivott.push({ url: u, auth: opt?.headers?.Authorization });
    const id = u.match(/scenarios\/(\d+)\/logs/)?.[1];
    const v = valaszok[id];
    if (v === undefined || v === 'hiba') return { ok: false, status: 500, json: async () => ({}) };
    const offset = Number(u.match(/offset\]=(\d+)/)?.[1] || 0);
    return { ok: true, status: 200, json: async () => ({ scenarioLogs: v.slice(offset, offset + 50) }) };
  };
  return { f, hivott, idk: () => [...new Set(hivott.map(h => h.url.match(/scenarios\/(\d+)\//)?.[1]))] };
}

/** N napló-sor egy hónapra, soronként `ops` művelettel. */
const naploSorok = (n, ops) =>
  Array.from({ length: n }, (_, i) => ({
    timestamp: `2026-08-1${String((i % 9) + 1)}T10:00:00Z`, operations: ops
  }));

t('🎬 a Reel is a KÖZÖS keretből eszik — benne van a figyelt listában', () => {
  const idk = SHARED_SCENARIOS.map(s => s.id);
  assert.ok(idk.includes(FB_SCENARIO_ID), 'a Facebook-fotó forgatókönyv');
  assert.ok(idk.includes(REEL_SCENARIO_ID), 'a Facebook Reel forgatókönyv (7066389)');
  assert.equal(REEL_SCENARIO_ID, '7066389', 'a Make-forgatókönyv azonosítója');
  assert.equal(REEL_OPS_PER_DAY, 2, 'webhook + Reel-feltöltés, napi EGY Reel');
});

await at('🚨 MINDKÉT forgatókönyv naplóját lekérdezi és ÖSSZEADJA', async () => {
  // EZ A HIBA MAGA: a régi kód csak a 6452490-et kérdezte le, tehát a Reel
  // ~60 művelete/hó láthatatlan maradt.
  const m = makeMock({
    [FB_SCENARIO_ID]: naploSorok(10, 3),      // 30 művelet
    [REEL_SCENARIO_ID]: naploSorok(20, 2)     // 40 művelet
  });
  const used = await usedThisMonth({ token: 'teszt-token', day: '2026-08-20', fetchFn: m.f });
  assert.deepEqual(m.idk().sort(), [FB_SCENARIO_ID, REEL_SCENARIO_ID].sort(),
    'a Reel naplóját is le KELL kérdezni');
  assert.equal(used, 30 + 40 + untrackedOps('2026-08'));
});

await at('a lekérdezés a tokent viszi, és csak az adott hónapot számolja', async () => {
  const m = makeMock({
    [FB_SCENARIO_ID]: [
      { timestamp: '2026-08-10T01:20:48Z', operations: 9 },
      { timestamp: '2026-07-31T23:59:00Z', operations: 99 }   // előző hónap
    ],
    [REEL_SCENARIO_ID]: [{ timestamp: '2026-08-11T00:00:00Z', operations: 2 }]
  });
  const used = await usedThisMonth({ token: 'teszt-token', day: '2026-08-20', fetchFn: m.f });
  assert.equal(used, 9 + 2 + untrackedOps('2026-08'));
  assert.ok(m.hivott.every(h => h.auth === 'Token teszt-token'), 'hitelesítés nélkül 401 jönne');
});

await at('50-nél több sornál LAPOZ — különben a hónap eleje kimaradna', async () => {
  const m = makeMock({ [FB_SCENARIO_ID]: naploSorok(60, 1), [REEL_SCENARIO_ID]: [] });
  const used = await usedThisMonth({ token: 'teszt-token', day: '2026-08-20', fetchFn: m.f });
  assert.equal(used, 60 + untrackedOps('2026-08'), 'a második oldal is kell');
});

await at('⚙️ a FŐ forgatókönyv naplója nélkül ISMERETLEN (null) — nem fékezünk vaktában', async () => {
  // Ugyanaz az elv, mint eddig: egy API-hiba miatti visszavétel biztos és
  // azonnali kár, a keret kifutása bizonytalan és hó végi.
  const m = makeMock({ [FB_SCENARIO_ID]: 'hiba', [REEL_SCENARIO_ID]: naploSorok(5, 2) });
  assert.equal(await usedThisMonth({ token: 'teszt-token', day: '2026-08-20', fetchFn: m.f }), null);
  assert.equal(postsPerRun({ used: null, day: '2026-08-20', defaultLimit: 3 }), 3);
});

await at('🎬 a Reel naplója nélkül BECSLÉSSEL számolunk — nem nullával', async () => {
  // A törölt Pinterest leckéje: ami nem mérhető, azt sem hagyhatjuk figyelmen
  // kívül. Ha a Reel naplója 403/500-at ad (törölt vagy átnevezett
  // forgatókönyv), a nulla azt hazudná, hogy nem eszik a keretből.
  const m = makeMock({ [FB_SCENARIO_ID]: naploSorok(10, 3), [REEL_SCENARIO_ID]: 'hiba' });
  const used = await usedThisMonth({ token: 'teszt-token', day: '2026-08-15', fetchFn: m.f });
  assert.equal(used, 30 + REEL_OPS_PER_DAY * 15 + untrackedOps('2026-08'),
    'a becslés a hónap elejétől máig, napi 2 művelettel');
  assert.ok(used > 30 + untrackedOps('2026-08'), 'a Reel NEM lehet ingyenes a számításban');
});

t('a Reel havi fogyása ~60 művelet — ez a nagyságrend, amit eddig elhagytunk', () => {
  assert.equal(estimateOps(REEL_OPS_PER_DAY, '2026-08-30'), 60);
  assert.equal(estimateOps(REEL_OPS_PER_DAY, '2026-08-01'), 2, 'a mai nap is beleszámít');
  assert.equal(estimateOps(0, '2026-08-30'), null, 'becslés csak ott, ahol ismert a napi tempó');
  assert.equal(estimateOps(REEL_OPS_PER_DAY, 'nem-datum'), null);
});

await at('token nélkül ISMERETLEN — és hálózatot sem hívunk', async () => {
  const m = makeMock({ [FB_SCENARIO_ID]: naploSorok(10, 3) });
  assert.equal(await usedThisMonth({ token: '', day: '2026-08-20', fetchFn: m.f }), null);
  assert.equal(await usedThisMonth({ token: undefined, day: '2026-08-20', fetchFn: m.f }), null);
  assert.equal(await usedThisMonth({ token: 'teszt-token', day: 'nem-datum', fetchFn: m.f }), null);
  assert.equal(m.hivott.length, 0);
});

await at('a hálózati kivétel sem dob — ISMERETLEN lesz belőle', async () => {
  const f = async () => { throw new Error('halott hálózat'); };
  assert.equal(await usedThisMonth({ token: 'teszt-token', day: '2026-08-20', fetchFn: f }), null);
});

await at('🚦 a Reel műveletei TÉNYLEGESEN eltolják a döntést', async () => {
  // Nem elmélet: a szűk sávban a Reel 60 művelete egy egész poszt-fokozat.
  const nelkule = makeMock({ [FB_SCENARIO_ID]: naploSorok(40, 13), [REEL_SCENARIO_ID]: [] });
  const vele = makeMock({ [FB_SCENARIO_ID]: naploSorok(40, 13), [REEL_SCENARIO_ID]: naploSorok(30, 2) });
  const a = await usedThisMonth({ token: 'teszt-token', day: '2026-08-28', fetchFn: nelkule.f });
  const b = await usedThisMonth({ token: 'teszt-token', day: '2026-08-28', fetchFn: vele.f });
  assert.equal(b - a, 60, 'a Reel havi fogyása');
  const nA = postsPerRun({ used: a, day: '2026-08-28', defaultLimit: 3 });
  const nB = postsPerRun({ used: b, day: '2026-08-28', defaultLimit: 3 });
  assert.ok(nB < nA, `a Reel fogyásával kevesebb posztot szabad küldeni (${nA} → ${nB})`);
});

console.log('\n✅ make-budget.test: mind a ' + pass + ' eset rendben');

// ── 🚦 A KERET-SOR A NAPI RIPORTBAN (2026-08-30) ────────────────────
// A keret-logika 2026-08-09 óta létezik, de a szám EDDIG CSAK A CI-NAPLÓBA
// került — vagyis senkihez. Mérve a hátralék-elemzésben: teljes tempón
// 29 művelet/nap, 31 napos hónapban 899 a 900-as plafonnál. EGY tartalék.
{
  const { keretSor, SAFETY_CAP } = await import('./make-budget.js');

  t('🚦 bőven van hely → CSENDES', () => {
    assert.equal(keretSor(120, '2026-08-05'), '', 'a hónap elején zajongott');
  });

  t('⚠️ a SZŰK keret megszólal, és megmondja, mi következik', () => {
    // 31 napos hónap vége felé, a mért tempóval.
    const sor = keretSor(800, '2026-08-28');
    assert.ok(sor.startsWith('⚠️'), 'nem vészjelzés-mintás → a zajszűrő elnémíthatná: ' + sor);
    assert.ok(sor.includes('800'), 'nem mondja meg, hol tartunk: ' + sor);
    assert.ok(/visszavesz/.test(sor), 'nem mondja meg, MI FOG TÖRTÉNNI: ' + sor);
  });

  t('a szűkülő tartalék jelez, mielőtt baj lenne', () => {
    const sor = keretSor(SAFETY_CAP - 50, '2026-08-31');
    assert.ok(sor.length > 0, 'az utolsó napon, 50 művelettel némán maradt');
  });

  t('⚠️ a „NEM TUDOM" nem „rendben van"', () => {
    // A Make kvótája nem lekérdezhető; ha a naplóból sem jön szám, azt LÁTNI
    // kell — különben a vak fékezés úgy néz ki, mint a nyugalom.
    for (const rossz of [null, undefined, NaN, 'hopp']) {
      const sor = keretSor(rossz, '2026-08-20');
      assert.ok(sor.startsWith('⚠️') && /NEM TUDTAM/.test(sor), String(rossz) + ' → ' + sor);
    }
  });

  t('hibás dátumra nem borul', () => {
    for (const d of [null, undefined, 'hopp', '']) assert.doesNotThrow(() => keretSor(500, d));
  });
}
