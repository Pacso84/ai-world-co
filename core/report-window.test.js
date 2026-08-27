// ===================================================================
// TESZT — napi jelentés időablaka
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/report-window.js fejlécében (a 2026-08-27-i
// KIMARADT napi jelentés: mind a négy futás a sávon kívülre esett).
// ===================================================================

import assert from 'assert/strict';
import { shouldSendReport, KEZDES_ORA, VEGE_ORA } from './report-window.js';
import { TURELEM_ORA } from './pipeline-watchdog.js';

const MA = '2026-08-27';
const TEGNAP = '2026-08-26';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 napi jelentés — időablak\n');

t('A VALÓDI ESET: a 2026-08-27-i négy futás közül a 16:07-es MEHETETT VOLNA', () => {
  // Ez a teszt a hibát rögzíti. A régi sáv (7-15) mind a négyet kizárta,
  // és aznap nem ment ki jelentés — pedig 9 hír + 5 útmutató megjelent.
  const orak = [4, 5, 16, 18];          // 04:20, 05:37, 16:07, 18:29 UTC
  const mehet = orak.filter(h => shouldSendReport({ hour: h, lastSent: TEGNAP, today: MA }).send);
  assert.deepEqual(mehet, [16, 18], 'a délutáni futásoknak át kell menniük');
});

t('a hajnali futás NEM ébreszt', () => {
  for (const h of [0, 1, 3, 4, 5, 6]) {
    const r = shouldSendReport({ hour: h, lastSent: TEGNAP, today: MA });
    assert.equal(r.send, false, h + 'h átment');
    assert.ok(r.reason.includes('hajnal'), r.reason);
  }
});

t('a késő esti futás sem', () => {
  for (const h of [22, 23]) {
    assert.equal(shouldSendReport({ hour: h, lastSent: TEGNAP, today: MA }).send, false, h + 'h átment');
  }
});

t('a sávon belül minden óra mehet', () => {
  for (let h = KEZDES_ORA; h <= VEGE_ORA; h++) {
    assert.equal(shouldSendReport({ hour: h, lastSent: TEGNAP, today: MA }).send, true, h + 'h elakadt');
  }
});

t('épp a két határon', () => {
  assert.equal(shouldSendReport({ hour: KEZDES_ORA - 1, lastSent: TEGNAP, today: MA }).send, false);
  assert.equal(shouldSendReport({ hour: KEZDES_ORA, lastSent: TEGNAP, today: MA }).send, true);
  assert.equal(shouldSendReport({ hour: VEGE_ORA, lastSent: TEGNAP, today: MA }).send, true);
  assert.equal(shouldSendReport({ hour: VEGE_ORA + 1, lastSent: TEGNAP, today: MA }).send, false);
});

t('🔢 a határok ÉRTÉKE is rögzítve — nem csak a reláció', () => {
  // A fenti teszt ÖNHIVATKOZÓ: a konstansokkal méri a konstansokat, tehát
  // csak rossz relációs jelet fog meg, rossz ÉRTÉKET soha. Kimérve: a
  // VEGE_ORA 21→19-re, a KEZDES_ORA 7→9-re volt állítható úgy, hogy minden
  // teszt zöld maradjon. Ezért kell literál.
  assert.equal(KEZDES_ORA, 7, '07 UTC = 09:00 magyar idő — ne ébresszen');
  assert.equal(VEGE_ORA, 20, '20 UTC = 22:59-ig magyar idő (a 20-as óra MÉG átmegy)');

  // A cron három slotja: 00, 08, 16 UTC. A jelentés a 08-as és a 16-os
  // slotból is mehessen, mert bármelyik kimaradhat.
  for (const slot of [8, 16]) {
    assert.equal(shouldSendReport({ hour: slot, lastSent: TEGNAP, today: MA }).send, true,
      'a ' + slot + ':00 UTC cron-slot nem fér bele');
  }
  assert.equal(shouldSendReport({ hour: 0, lastSent: TEGNAP, today: MA }).send, false,
    'a 00:00 UTC slot ne küldjön — az 02:00 magyar idő');
});

// ── amitől NEM szabad elszabadulnia ───────────────────────────────
t('NAPONTA EGYSZER — a dedup a tágabb sávval is tart', () => {
  // EZ a napi egyszeri küldés valódi őre, nem az időablak. A nap
  // mindhárom (ma: négy) futása ugyanabba a sávba eshet.
  for (const h of [7, 12, 16, 18, 21]) {
    const r = shouldSendReport({ hour: h, lastSent: MA, today: MA });
    assert.equal(r.send, false, h + 'h duplikált');
    assert.ok(r.reason.includes('ma már ment'), r.reason);
  }
});

t('a dedup a sorrendben ELŐL van — beszédesebb indok', () => {
  // A régi kód a nap harmadik futásánál is "sávon kívül"-t írt, holott
  // a valódi ok az volt, hogy már ment.
  //
  // ⚠️ AZ ÓRA ITT SÁVON KÍVÜLI (hajnal) — SZÁNDÉKOSAN. Az első változat
  // `hour: 12`-t használt, ami BENNE van az ablakban, így fordított
  // sorrenddel is átment volna: tautológia volt, nem teszt. Csak egy
  // olyan óra dönti el a sorrendet, amit MINDKÉT kapu elutasítana.
  const r = shouldSendReport({ hour: 3, lastSent: MA, today: MA });
  assert.equal(r.send, false);
  assert.ok(r.reason.includes('ma már ment'), 'a dedupnak kell elöl lennie, ez jött: ' + r.reason);
  assert.ok(!r.reason.includes('hajnal'), 'az ablak válaszolt előbb: ' + r.reason);
});

t('🗓️ NAP-KAPU (heti riport): csak vasárnap, de a --force azt is megkerüli', () => {
  // Ez a kapu a core/search-report.js-ből költözött ide, hogy a --force
  // SORRENDJE tesztelhető legyen: ott kézzel írt `!FORCE &&` őrizte, és
  // azt a fájlt nem lehet importálni (feltétel nélkül hívja a main()-t).
  const alap = { hour: 12, lastSent: '2026-W34', today: '2026-W35', onlyOnDay: 0, periodNev: 'ezen a héten' };
  assert.equal(shouldSendReport({ ...alap, day: 0 }).send, true, 'vasárnap mennie kell');
  for (const nap of [1, 2, 3, 4, 5, 6]) {
    const r = shouldSendReport({ ...alap, day: nap });
    assert.equal(r.send, false, nap + '. napon átment');
    assert.ok(r.reason.includes('nem vasárnap'), r.reason);
  }
  // A --force a nap-kaput is megkerüli — pontosan úgy, ahogy a régi
  // `if (FORCE) return true;` tette a guard() legelső soraként.
  assert.equal(shouldSendReport({ ...alap, day: 3, force: true }).send, true, 'a --force elakadt a nap-kapun');
  // ...és a nap-kapu a dedup ELŐTT szól, mint régen.
  const h = shouldSendReport({ ...alap, day: 3, lastSent: '2026-W35' });
  assert.ok(h.reason.includes('nem vasárnap'), h.reason);
  // onlyOnDay nélkül a `day` teljesen közömbös (a napi jelentés útja).
  for (const nap of [0, 1, 5]) {
    assert.equal(shouldSendReport({ hour: 12, lastSent: TEGNAP, today: MA, day: nap }).send, true);
  }
});

t('a TEGNAPI küldés nem blokkolja a mait', () => {
  assert.equal(shouldSendReport({ hour: 8, lastSent: TEGNAP, today: MA }).send, true);
});

t('⚠️ itt a "NEM TUDOM" = "IGEN" — az őrkutyával SZÁNDÉKOSAN ellentétesen', () => {
  // Ott a vak cselekvés fizetős pipeline-futás; itt egy Telegram-üzenet,
  // amit a dedup naponta egyre fog. A rossz hallgatás a drágább hiba.
  for (const rossz of [null, undefined, NaN, '12', 7.5, -1, 24, {}]) {
    const r = shouldSendReport({ hour: rossz, lastSent: TEGNAP, today: MA });
    assert.equal(r.send, true, String(rossz) + ' némán elnyelte a jelentést');
    assert.ok(r.reason.startsWith('ISMERETLEN'), 'legyen LÁTHATÓ: ' + r.reason);
  }
  // ...de a dedup az ismeretlen óránál is erősebb — nem lesz belőle spam.
  assert.equal(shouldSendReport({ hour: NaN, lastSent: MA, today: MA }).send, false);
});

t('HETI riport: ugyanez a kapu, időszak-kulccsal', () => {
  // A core/search-report.js-ben szó szerint ugyanaz a két sor élt. Ott
  // ROSSZABB a hiba: vasárnap ÉS sávon belül kell futnia, tehát egy
  // kicsúszott vasárnap az EGÉSZ HÉT riportját elviszi.
  const HET = '2026-W35', ELOZO = '2026-W34';
  assert.equal(shouldSendReport({ hour: 16, lastSent: ELOZO, today: HET, periodNev: 'ezen a héten' }).send, true);
  const r = shouldSendReport({ hour: 12, lastSent: HET, today: HET, periodNev: 'ezen a héten' });
  assert.equal(r.send, false);
  assert.ok(r.reason.startsWith('ezen a héten már ment'), r.reason);
});

t('a --force mindent megkerül', () => {
  assert.equal(shouldSendReport({ hour: 3, lastSent: MA, today: MA, force: true }).send, true);
  assert.equal(shouldSendReport({ force: true }).send, true);
});

t('🔒 az ablak TÁGABB az őrkutya legnagyobb résénél', () => {
  // Ez a teszt KÉT MODUL összeillését őrzi, és pont az a fajta összefüggés,
  // ami külön-külön nézve láthatatlan.
  //
  // A pipeline-őrkutya TURELEM_ORA (9,5) után beavatkozik, óránként ellenőriz,
  // tehát két futás közt a legnagyobb rés ≈ 9,5 + 1 óra várakozás + indulás.
  // Ha ez a legnagyobb rés KISEBB, mint a riport-ablak hossza, akkor minden
  // ablakba muszáj beleesnie legalább egy futásnak.
  // ⚠️ AMIT EZ NEM BIZONYÍT — a cím SZÁNDÉKOSAN nem „lehetetlen", mert az
  // erősebb lenne, mint a bizonyíték (a hiba, amit a teszt őriz, épp egy
  // túl magabiztos feltevésből született):
  //   1. ha maga az őrkutya bukik (a dispatch hibázik, és a BOKES_SZUNET_ORA
  //      miatt 4 órát vár az újrapróbával), a rés megnő;
  //   2. a rés a futás INDULÁSÁRÓL szól, a `guard()` viszont a riport-lépésnél
  //      olvas órát, egy 10-23 perces pipeline VÉGÉN — ezt fedi a pipelineOra;
  //   3. job-időtúllépésnél a GitHub az `if: always()` lépéseket is KIHAGYJA
  //      (lásd auto.yml fejléc), tehát olyan futásból nincs riport, ablaktól
  //      függetlenül. Két egymás utáni időtúllépés újra néma napot adhat.
  // A 08-27-i hibát (a GitHub kihagy egy futást, mi jól működünk) kizárja —
  // ennél többet nem állít.
  const ablakOra = VEGE_ORA - KEZDES_ORA + 1;      // 07..20 → 14 óra
  const pipelineOra = 0.5;                         // futás-indulástól a riport-lépésig
  const legnagyobbRes = TURELEM_ORA + 1 + 0.5;     // észlelés + indulás

  assert.ok(legnagyobbRes < ablakOra - pipelineOra,
    'A riport-ablak (' + ablakOra + ' ó, a pipeline hosszát levonva ' + (ablakOra - pipelineOra) +
    ' ó) NEM nagyobb az őrkutya legnagyobb résénél (' + legnagyobbRes + ' ó) — így megint ' +
    'kimaradhat egy jelentés. Ha szűkíted az ablakot vagy növeled a TURELEM_ORA-t, EZT gondold végig.');
});

t('az indoklás MINDIG mond valamit', () => {
  // A napló ebből derül ki; a néma "false" nem elég.
  for (const be of [{ hour: 3 }, { hour: 12 }, { hour: 23 }, { hour: 12, lastSent: MA }]) {
    const r = shouldSendReport({ today: MA, lastSent: TEGNAP, ...be });
    assert.ok(typeof r.reason === 'string' && r.reason.length > 5, JSON.stringify(be));
  }
  assert.equal(typeof shouldSendReport().reason, 'string', 'paraméter nélkül sem néma');
});

console.log(`\n✅ ${pass} teszt rendben`);
