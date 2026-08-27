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

t('a VALÓDI eset: 11,4 óra némaság → beavatkozik', () => {
  // 2026-08-26 16:40 UTC volt az utolsó futás, 08-27 04:07-kor még semmi.
  const r = shouldTrigger({ lastRunAt: '2026-08-26T16:40:40Z', now: MOST });
  assert.equal(r.trigger, true);
  assert.ok(r.gapHours > 11 && r.gapHours < 12, 'a rés ' + r.gapHours);
  assert.ok(r.reason.includes('KIMARADT'));
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
