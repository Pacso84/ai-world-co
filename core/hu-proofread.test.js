// ===================================================================
// MAGYAR HELYESÍRÁS — 2. LÉPCSŐ: a bíró és a döntés-tár (tesztek)
// ===================================================================
// Az `ask` paraméter, ezért a teljes hibaág végigjárható pénz és hálózat
// nélkül. A LEGFONTOSABB eset a „kikapcsolva": ha a vészkapcsoló nem VALÓDI,
// a mező csak dísz (2026-08-19, ai-router).
// ===================================================================

import assert from 'assert/strict';
import { judgeWords, applyVerdicts, applyFixes, needsReview, isFixable, emptyStore } from './hu-proofread.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
const at = async (n, f) => { await f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 magyar helyesírás — bíró\n');

const JELOLTEK = [
  { word: 'többiünknek', context: 'Mit jelent ez a többiünknek?' },
  { word: 'refaktorálás', context: 'A refaktorálás hasznos.' }
];
const valasz = (obj, costUsd = 0.0002) => async () => ({ text: JSON.stringify(obj), costUsd });

await at('a bíró ítéletét szóalakonként adja vissza', async () => {
  const r = await judgeWords({
    candidates: JELOLTEK,
    ask: valasz({ words: [
      { word: 'többiünknek', ok: false, correct: 'többieknek' },
      { word: 'refaktorálás', ok: true }
    ] })
  });
  assert.equal(r.verdicts.length, 2);
  assert.equal(r.verdicts.find(v => v.word === 'többiünknek').ok, false);
  assert.equal(r.verdicts.find(v => v.word === 'refaktorálás').ok, true);
  assert.equal(r.costUsd, 0.0002);
});

await at('🔌 KIKAPCSOLVA: nem hív AI-t, nem költ', async () => {
  let hivas = 0;
  const r = await judgeWords({ candidates: JELOLTEK, enabled: false,
    ask: async () => { hivas++; return { text: '{"words":[]}', costUsd: 9 }; } });
  assert.equal(hivas, 0);
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0);
});

await at('nincs jelölt → nincs hívás', async () => {
  let hivas = 0;
  const ask = async () => { hivas++; return { text: '{"words":[]}', costUsd: 9 }; };
  for (const c of [[], null, undefined]) assert.deepEqual((await judgeWords({ candidates: c, ask })).verdicts, []);
  assert.equal(hivas, 0);
});

await at('⚠️ ÉRTELMEZHETETLEN VÁLASZ → NINCS ítélet, de a költség elszámolva', async () => {
  // A hallgatás a biztonságos irány: itelet nelkul senkit nem buktatunk el.
  const r = await judgeWords({ candidates: JELOLTEK, ask: async () => ({ text: 'bocsánat', costUsd: 0.003 }) });
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0.003);
});

await at('a hálózati hiba sem boríthatja fel a fordítást', async () => {
  const r = await judgeWords({ candidates: JELOLTEK, ask: async () => { throw new Error('lekapcsolt'); } });
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0);
});

await at('a NEM KÉRDEZETT szóra adott ítéletet eldobja', async () => {
  // A modell kitalálhat szavakat; csak arról fogadunk el dontest, amit kérdeztünk.
  const r = await judgeWords({ candidates: JELOLTEK,
    ask: valasz({ words: [{ word: 'kitalált', ok: false, correct: 'x' }] }) });
  assert.deepEqual(r.verdicts, []);
});

await at('a "rossz" ítélet JAVÍTÁS nélkül nem ér semmit — eldobjuk', async () => {
  const r = await judgeWords({ candidates: JELOLTEK,
    ask: valasz({ words: [{ word: 'többiünknek', ok: false }] }) });
  assert.deepEqual(r.verdicts, [], 'javaslat nélkül nem tudunk mit kezdeni vele');
});

t('applyVerdicts: a jó szó engedélylistára, a javítható a fix-térképbe', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'refaktorálás', ok: true },
    { word: 'többiünknek', ok: false, correct: 'többieknek', fixable: true }
  ]);
  assert.ok(s.ok.includes('refaktorálás'));
  assert.equal(s.fix['többiünknek'].correct, 'többieknek');
  assert.ok(!s.ok.includes('többiünknek'), 'egy szó nem lehet egyszerre jó és rossz');
});

t('⚠️ a NEM behelyettesíthető javaslat NEM a fix-térképbe megy', () => {
  // Élesben ilyet adott a bíró: «askolsz vagy „túl tág kérdéseket teszel fel».
  // Ha ezt a gép magától becserélné, értelmetlen szöveg kerülne az élő oldalra.
  const s = applyVerdicts(emptyStore(), [
    { word: 'asksz', ok: false, correct: 'askolsz vagy „túl tág kérdéseket teszel fel', fixable: false }
  ]);
  assert.equal(s.fix['asksz'], undefined, 'ehhez a gép NEM nyúlhat');
  assert.equal(s.review['asksz'].correct.startsWith('askolsz'), true, 'de jelezni kell');
  assert.deepEqual(needsReview(s).map(x => x.word), ['asksz']);
});

t('isFixable: csak az egyszavas, tiszta alak cserélhető', () => {
  assert.equal(isFixable('többieknek'), true);
  assert.equal(isFixable('jó-rossz'), true, 'a kötőjeles összetétel rendben');
  assert.equal(isFixable('heti számok'), false, 'két szó: nem csere, hanem átfogalmazás');
  assert.equal(isFixable('askolsz vagy valami'), false);
  assert.equal(isFixable('„idézet”'), false);
  assert.equal(isFixable(''), false);
  assert.equal(isFixable(null), false);
});

t('applyVerdicts nem duplikál és nem borul hiányos bemenetre', () => {
  let s = applyVerdicts(emptyStore(), [{ word: 'alma', ok: true }]);
  s = applyVerdicts(s, [{ word: 'ALMA', ok: true }, null, { ok: true }]);
  assert.deepEqual(s.ok, ['alma']);
});

t('🔧 applyFixes: az EGYSZER megítélt hiba ingyen, AI nélkül javul', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'többiünknek', ok: false, correct: 'többieknek', fixable: true }]);
  const r = applyFixes('Mit jelent ez a többiünknek?', s);
  assert.equal(r.text, 'Mit jelent ez a többieknek?');
  assert.deepEqual(r.fixed, [{ word: 'többiünknek', correct: 'többieknek' }]);
});

t('applyFixes IDEMPOTENS — a már javított szövegen nincs mit tenni', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'többiünknek', ok: false, correct: 'többieknek', fixable: true }]);
  const egyszer = applyFixes('Ez a többiünknek szól.', s);
  const ketszer = applyFixes(egyszer.text, s);
  assert.equal(ketszer.text, egyszer.text);
  assert.deepEqual(ketszer.fixed, []);
});

t('applyFixes megtartja a NAGY kezdőbetűt', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'hetodból', ok: false, correct: 'hetedből', fixable: true }]);
  assert.equal(applyFixes('Hetodból választok.', s).text, 'Hetedből választok.');
});

t('applyFixes SZÓHATÁRON cserél — nem előtagra', () => {
  // A helyesírás-szótár csapdája KÉTSZER megfogott (analysis→analyzis).
  const s = applyVerdicts(emptyStore(), [{ word: 'alma', ok: false, correct: 'körte', fixable: true }]);
  assert.equal(applyFixes('Az almafa virágzik.', s).text, 'Az almafa virágzik.');
  assert.equal(applyFixes('Az alma piros.', s).text, 'Az körte piros.');
});

t('applyFixes minden előfordulást javít, nem csak az elsőt', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'hetodból', ok: false, correct: 'hetedből', fixable: true }]);
  assert.equal(applyFixes('hetodból és hetodból', s).text, 'hetedből és hetedből');
});

t('applyFixes üres tárra és hiányzó szövegre sem borul', () => {
  assert.deepEqual(applyFixes('valami', emptyStore()).fixed, []);
  assert.equal(applyFixes(null, emptyStore()).text, '');
  assert.equal(applyFixes('valami', null).text, 'valami');
});

console.log('\n✅ hu-proofread.test: mind a ' + pass + ' eset rendben');
