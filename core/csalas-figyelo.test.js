// Csalás-figyelő alapmodul (2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 1. rész):
// kézi kapcsoló, napi +1 csalás-hely, 7 napos frissesség, csalás-forrás jelölés, szűrő-prompt és
// a szűrő válaszának értelmezése. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import {
  CSALAS_FIGYELO_BE, CSALAS_EXTRA_NAPI, CSALAS_MAX_KOR_NAP, CSATORNAK,
  csalasForras, csalasFriss, csalasExtraMaradek, csalasHir, csalasExtraHir,
  CSALAS_SZURO_RENDSZER, csalasSzuroPrompt, csalasDontesek,
} from './csalas-figyelo.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-figyelo (alapmodul, kikapcsolva)');

const NAP = 24 * 3600 * 1000;
const MOST = Date.parse('2026-11-23T12:00:00Z');

t('🔌 a kapcsoló KI van kapcsolva (élesítésig — az élesítő rész írja át true-ra)', () => {
  assert.equal(CSALAS_FIGYELO_BE, false);
});

t('🔢 állandók: napi 1 hely, 7 nap, 6 csatorna', () => {
  assert.equal(CSALAS_EXTRA_NAPI, 1);
  assert.equal(CSALAS_MAX_KOR_NAP, 7);
  assert.deepEqual(CSATORNAK, ['sms', 'email', 'chat', 'call', 'social', 'web']);
});

t('🛑 kikapcsolva 0 csalás-hely marad (akkor is, ha ma még nem volt csalás-hír)', () => {
  assert.equal(csalasExtraMaradek(0), 0);
  assert.equal(csalasExtraMaradek(1), 0);
});

t('📅 frissesség: 6 napos igen, 8 napos nem', () => {
  assert.equal(csalasFriss({ pubDate: new Date(MOST - 6 * NAP).toUTCString() }, MOST), true);
  assert.equal(csalasFriss({ pubDate: new Date(MOST - 8 * NAP).toUTCString() }, MOST), false);
});

t('📅 isoDate is elfogadott; hiányzó vagy hibás dátum → nem friss', () => {
  assert.equal(csalasFriss({ isoDate: new Date(MOST - 2 * NAP).toISOString() }, MOST), true);
  assert.equal(csalasFriss({}, MOST), false);
  assert.equal(csalasFriss({ pubDate: 'nem dátum' }, MOST), false);
  assert.equal(csalasFriss(null, MOST), false);
});

t('📅 jövőbeli (hibás órájú) dátum nem számít „7 napon belülinek” végtelenül — de 1 napos csúszás még friss', () => {
  assert.equal(csalasFriss({ pubDate: new Date(MOST + 0.5 * NAP).toUTCString() }, MOST), true);
  assert.equal(csalasFriss({ pubDate: new Date(MOST + 30 * NAP).toUTCString() }, MOST), false);
});

t('🏷️ csalás-forrás csak a `csalas: true` jelölésű', () => {
  assert.equal(csalasForras({ csalas: true }), true);
  assert.equal(csalasForras({}), false);
  assert.equal(csalasForras({ csalas: 'true' }), false);
  assert.equal(csalasForras(undefined), false);
});

t('🏷️ csalasHir / csalasExtraHir a _meta jelöléséből', () => {
  assert.equal(csalasHir({ csalas: true }), true);
  assert.equal(csalasHir({}), false);
  assert.equal(csalasHir(undefined), false);
  assert.equal(csalasExtraHir({ csalas_extra: '2026-11-23' }), true);
  assert.equal(csalasExtraHir({ csalas: true }), false);
});

t('🧾 szűrő-prompt: sorszámozott cím + kivonat', () => {
  const p = csalasSzuroPrompt([{ title: 'A', snippet: 'b' }, { title: 'C', snippet: '' }]);
  assert.ok(p.includes('[0] Title: A'), p);
  assert.ok(p.includes('b'));
  assert.ok(p.includes('[1] Title: C'));
});

t('🧾 rendszer-prompt kimondja a határokat és a válaszformát', () => {
  for (const szo of ['vulnerab', 'product feature', 'decisions', 'sms|email|chat|call|social|web']) {
    assert.ok(CSALAS_SZURO_RENDSZER.toLowerCase().includes(szo.toLowerCase()), 'hiányzik: ' + szo);
  }
});

t('🧩 döntések: {"decisions":[…]} boríték', () => {
  const d = csalasDontesek('{"decisions":[{"index":0,"csalas":true,"csatorna":"sms","ok":"x"},{"index":1,"csalas":false,"csatorna":null,"ok":"y"}]}', 2);
  assert.equal(d.length, 2);
  assert.deepEqual(d[0], { index: 0, csalas: true, csatorna: 'sms', ok: 'x' });
  assert.deepEqual(d[1], { index: 1, csalas: false, csatorna: null, ok: 'y' });
});

t('🧩 döntések: csupasz tömb és kódblokkba csomagolt válasz is jó', () => {
  assert.equal(csalasDontesek('[{"index":0,"csalas":true,"csatorna":"call","ok":"z"}]', 1)[0].csatorna, 'call');
  assert.equal(csalasDontesek('```json\n{"decisions":[{"index":0,"csalas":true,"csatorna":"email","ok":"z"}]}\n```', 1)[0].csatorna, 'email');
});

t('🧩 ismeretlen csatorna → null; „true” szöveg nem igaz; tartományon kívüli index kimarad', () => {
  const d = csalasDontesek('{"decisions":[{"index":0,"csalas":true,"csatorna":"fax","ok":"x"},{"index":1,"csalas":"true","csatorna":"sms"},{"index":5,"csalas":true,"csatorna":"sms"}]}', 2);
  assert.equal(d.length, 2);
  assert.equal(d[0].csatorna, null);
  assert.equal(d[1].csalas, false);
  assert.equal(d[1].ok, '');
});

t('🧩 hibás JSON → null', () => {
  assert.equal(csalasDontesek('nem json', 1), null);
  assert.equal(csalasDontesek('', 1), null);
  assert.equal(csalasDontesek('{"valami":1}', 1), null);
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ csalas-figyelo: minden rendben');
