// ===================================================================
// TESZT — pipeline-őrkutya
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/pipeline-watchdog.js fejlécében (a 2026-08-27-i
// kimaradt 00:00 UTC-s futás).
// ===================================================================

import assert from 'assert/strict';
import { shouldTrigger, TURELEM_ORA, BOKES_SZUNET_ORA, CIKLUS_ORA } from './pipeline-watchdog.js';

const ORA = 3600e3;
const MOST = Date.parse('2026-08-27T04:07:00.000Z');
const ezelott = o => new Date(MOST - o * ORA).toISOString();

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 pipeline-őrkutya\n');

// ⚠️ KORREKCIÓ (2026-09-06). Ez a teszt eredetileg a 2026-08-27-i esetet
// „VALÓDI kimaradásnak" nevezte: 08-26 16:40 volt az utolsó futás, és 04:07-kor
// még semmi — 11,4 óra némaság. AKKOR ez ésszerű következtetés volt, mert a
// megelőző 12 futás mind 40 percen belül indult.
//
// A GitHub API utólagos lekérdezése MÁST mond: aznap **05:37-kor lefutott egy
// `schedule` esemény**, vagyis a 00:00-s slot NEM MARADT KI — 5,6 órát KÉSETT.
// A 11,4 óra tehát nem kimaradás volt, hanem a mai mércével NORMÁL késés
// (a mért leghosszabb normál szünet 13,4 óra).
//
// Ezért a teszt most azt rögzíti, ami TÉNYLEG igaz: 11,4 óra némaságra NEM
// avatkozunk be. Az az eset, amiért a modul készült (a napi jelentés
// elmaradása), önálló javítást kapott — `core/report-window.js`.
t('a 2026-08-27-i 11,4 óra NEM kimaradás volt, csak késés → nem avatkozik be', () => {
  const r = shouldTrigger({ lastRunAt: '2026-08-26T16:40:40Z', now: MOST });
  assert.ok(r.gapHours > 11 && r.gapHours < 12, 'a rés ' + r.gapHours);
  assert.equal(r.trigger, false,
    '11,4 óra némaságra pótfutást indít — a mérés szerint ez NORMÁL késés');
});

t('egy TÉNYLEG kimaradt futás viszont beavatkozást kap', () => {
  // Kihagyott slot = 16+ óra csend. Erre kell reagálni.
  const r = shouldTrigger({ lastRunAt: ezelott(17), now: MOST });
  assert.equal(r.trigger, true);
  assert.ok(r.reason.includes('KIMARADT'), r.reason);
});

t('a NORMÁLIS késés NEM riaszt', () => {
  // A mért 12 futás késése: 12-40 perc. Egyik sem beavatkozás-ok.
  for (const perc of [12, 16, 22, 23, 29, 34, 36, 37, 39]) {
    const r = shouldTrigger({ lastRunAt: ezelott(CIKLUS_ORA + perc / 60), now: MOST });
    assert.equal(r.trigger, false, perc + ' perc késés riasztott');
  }
});

t('épp a küszöb két oldalán', () => {
  assert.equal(shouldTrigger({ lastRunAt: ezelott(TURELEM_ORA - 0.1), now: MOST }).trigger, false);
  assert.equal(shouldTrigger({ lastRunAt: ezelott(TURELEM_ORA + 0.1), now: MOST }).trigger, true);
});

// ===================================================================
// 🔑 A KÜSZÖB ÉRTÉKE MÉRÉS, NEM ÍZLÉS (2026-09-06)
// ===================================================================
// Mérve, 90 ütemezett futáson (2026-08-06…09-05):
//     késés  — medián 0,7 · 90% 4,3 · LEGNAGYOBB 7,8 óra
//     szünet — medián 7,9 · 90% 10,4 · LEGNAGYOBB 13,4 óra
// A régi 9,5 órás türelem mellett a futások 34%-a túllépte a küszöböt, és
// egy hónap alatt 9 FÖLÖSLEGES pótfutás indult (mindegyik után 12-211 percen
// belül megjött az ütemezett futás magától). Egyik sem előzött meg valódi
// kimaradást — viszont mindegyik pénzbe és ~9 Make-műveletbe került.
//
// EZ A TESZT NEM A SZÁMOT VÉDI, HANEM A KÉT HATÁRT KÖZTE:
//   - a mért leghosszabb NORMÁL szünet FÖLÖTT, különben a késés riasztásnak
//     látszik és fölöslegesen költünk;
//   - egy TÉNYLEG kihagyott slot csendje ALATT, különben vak marad arra,
//     amiért az egész modul készült.
t('🔑 a türelem a MÉRT valóság és a valódi kimaradás közé esik', () => {
  const LEGHOSSZABB_NORMAL_SZUNET = 13.4;   // mérve, 89 futás-pár
  const KIHAGYOTT_SLOT = CIKLUS_ORA * 2;    // egy kimaradt futás ennyi csend

  assert.ok(TURELEM_ORA > LEGHOSSZABB_NORMAL_SZUNET,
    'a türelem (' + TURELEM_ORA + ' óra) NEM haladja meg a mért leghosszabb normál '
    + 'szünetet (' + LEGHOSSZABB_NORMAL_SZUNET + ' óra) — fölösleges pótfutásokat indít');

  assert.ok(TURELEM_ORA < KIHAGYOTT_SLOT,
    'a türelem (' + TURELEM_ORA + ' óra) eléri egy kihagyott futás csendjét ('
    + KIHAGYOTT_SLOT + ' óra) — vakká válna arra, amiért készült');

  // A MÉRT, valódi szünetek közül egyik sem indíthat pótfutást…
  for (const szunet of [7.9, 10.3, 10.4, 10.5, 11.1, 12.0, 12.9, 13.0, 13.3, 13.4]) {
    assert.equal(shouldTrigger({ lastRunAt: ezelott(szunet), now: MOST }).trigger, false,
      szunet + ' óra (MÉRT, normál szünet) fölöslegesen indított');
  }
  // …egy tényleg kihagyott slot viszont IGEN.
  for (const szunet of [16.1, 18, 24]) {
    assert.equal(shouldTrigger({ lastRunAt: ezelott(szunet), now: MOST }).trigger, true,
      szunet + ' óra csendre NEM indított');
  }
});

t('friss futás után csendben marad', () => {
  for (const o of [0, 0.5, 3, 8]) {
    assert.equal(shouldTrigger({ lastRunAt: ezelott(o), now: MOST }).trigger, false, o + ' óra');
  }
});

// ── amitől NEM szabad elszabadulnia ───────────────────────────────
t('ha nemrég bökött, NEM bök újra', () => {
  // Enélkül egy elakadt indítás óránként ismétlődő próbálkozássá fajulna.
  const r = shouldTrigger({ lastRunAt: ezelott(20), lastPokeAt: ezelott(1), now: MOST });
  assert.equal(r.trigger, false);
  assert.ok(r.reason.includes('már bökött'));
});

t('a bökés-szünet UTÁN viszont újra próbálkozik', () => {
  const r = shouldTrigger({ lastRunAt: ezelott(20), lastPokeAt: ezelott(BOKES_SZUNET_ORA + 0.1), now: MOST });
  assert.equal(r.trigger, true);
});

t('⚠️ a "NEM TUDOM" nem "IGEN"', () => {
  // Vak indítás = duplikált futás és dupla költés. Ha nem derül ki az
  // utolsó futás ideje, inkább NEM csinálunk semmit.
  for (const rossz of [null, undefined, '', 'nem-datum', NaN, {}]) {
    const r = shouldTrigger({ lastRunAt: rossz, now: MOST });
    assert.equal(r.trigger, false, String(rossz));
    assert.ok(r.reason.startsWith('ISMERETLEN'), 'a "nem tudom" legyen LÁTHATÓ: ' + r.reason);
  }
  assert.equal(shouldTrigger().trigger, false, 'paraméter nélkül sem indít');
});

t('jövőbeli időbélyegre nem cselekszik', () => {
  const r = shouldTrigger({ lastRunAt: ezelott(-5), now: MOST });
  assert.equal(r.trigger, false);
  assert.ok(r.reason.includes('JÖVŐBEN'));
});

t('az indoklás MINDIG mond valamit', () => {
  // Az őrkutya a napi riportba is ír; a néma "false" nem elég.
  for (const be of [{ lastRunAt: ezelott(1) }, { lastRunAt: ezelott(20) }, { lastRunAt: null },
    { lastRunAt: ezelott(20), lastPokeAt: ezelott(1) }]) {
    const r = shouldTrigger({ ...be, now: MOST });
    assert.ok(typeof r.reason === 'string' && r.reason.length > 8, JSON.stringify(be));
  }
});

t('a milliszekundumos alak is jó', () => {
  assert.equal(shouldTrigger({ lastRunAt: MOST - 20 * ORA, now: MOST }).trigger, true);
  assert.equal(shouldTrigger({ lastRunAt: MOST - 2 * ORA, now: MOST }).trigger, false);
});

console.log(`\n✅ ${pass} teszt rendben`);
