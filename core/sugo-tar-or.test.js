// ===================================================================
// ŐR-TESZT — minden ügynök a súgó-tárból (core/sugo-tar.js sugoSzoveg) kéri a súgócikket
// ===================================================================
// INGYENES, hálózat nélküli: a fájlokat csak SZÖVEGKÉNT olvassa (az agents/*/agent.js-t SOHA nem importáljuk —
// feltétel nélküli main() fut le). Fut: node core/run-tests.js
//
// MIÉRT VAN: ha valaki visszaír egy `cikkSzoveg(...)` hívást az ügynökbe, az az ügynök megint saját letöltést
// végez, és nem ugyanazt a szöveget látja, mint a többi lépés — a tár (hash, változás-jelzés) kikerül a láncból.
// Kivétel: a core/elakadas-gen.js, ahol a `cikkSzoveg` DEFINIÁLVA van (a sugo-tar.js onnan importálja); a CLI-ben
// (main) viszont a ctx-be már a `sugoSzoveg` kerül.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const gyoker = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const olvas = rel => readFileSync(join(gyoker, rel), 'utf-8').split(/\r?\n/);
let pass = 0, bukott = 0;
function t(nev, fn) {
  try { fn(); pass++; console.log(`  ✓ ${nev}`); }
  catch (e) { bukott++; console.log(`  ✗ ${nev}\n    ${e.message}`); }
}
/** A találatok magyar leírása: „fájl:sor — a sor szövege”. */
const talalatok = (rel, re) => olvas(rel).map((s, i) => ({ s, n: i + 1 })).filter(x => re.test(x.s))
  .map(x => `${rel}:${x.n} — ${x.s.trim().slice(0, 110)}`);

// A 3 ismert súgó-olvasó ügynök: ezek importálják a sugoSzoveg-et.
const AGENTEK = ['agents/ellenorzo/agent.js', 'agents/guide/agent.js', 'agents/pairing/agent.js'];

// Az agents/ mappa MINDEN .js fájlja (rekurzívan): egyikben sem lehet cikkSzoveg — így egy új vagy eddig nem súgózó
// ügynök sem csempészhet vissza közvetlen letöltést a tár megkerülésével (záró átnézés 11-14, I-4).
const jsFajlok = rel => readdirSync(join(gyoker, rel), { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (e.name === 'node_modules' ? [] : jsFajlok(rel + '/' + e.name)) : (e.name.endsWith('.js') ? [rel + '/' + e.name] : []));
const MIND = jsFajlok('agents');

t('az agents/ bejárása nem üres, és a 3 ismert súgó-olvasó benne van', () => {
  assert.ok(MIND.length >= AGENTEK.length, 'az agents/ bejárása üres — az őr nem őriz semmit');
  for (const f of AGENTEK) assert.ok(MIND.includes(f), 'nincs a bejárásban: ' + f);
});

for (const f of MIND) {
  t(`${f}: nincs cikkSzoveg hívás / import (a súgót a tárból kéri)`, () => {
    const hibak = talalatok(f, /\bcikkSzoveg\b/);
    assert.deepEqual(hibak, [], `Az ügynök még közvetlenül a cikkSzoveg-et használja — a súgót a core/sugo-tar.js sugoSzoveg-én át kell kérni:\n    ${hibak.join('\n    ')}`);
  });
}

for (const f of AGENTEK) {
  t(`${f}: a sugoSzoveg-et a core/sugo-tar.js-ből importálja`, () => {
    assert.ok(talalatok(f, /import\s*\{[^}]*\bsugoSzoveg\b[^}]*\}\s*from\s*'\.\.\/\.\.\/core\/sugo-tar\.js'/).length === 1,
      `${f}: hiányzik az „import { sugoSzoveg } from '../../core/sugo-tar.js'” sor`);
  });
}

t('core/elakadas-gen.js: a cikkSzoveg csak a definícióban (export) és a feladat-kommentekben szerepel, a CLI ctx-ben a sugoSzoveg áll', () => {
  const sorok = olvas('core/elakadas-gen.js');
  const tiltott = sorok.map((s, i) => ({ s, n: i + 1 })).filter(x => /\bcikkSzoveg\b/.test(x.s))
    .filter(x => !/^\s*(\/\/|\*|\/\*)/.test(x.s))                       // komment
    .filter(x => !/export async function cikkSzoveg\(/.test(x.s))        // a definíció
    .filter(x => !/ctx\.cikkSzoveg\(/.test(x.s))                         // a feldolgoz hívja a ctx-ből (a beadott függvényt)
    .filter(x => !/cikkSzoveg:\s*sugoSzoveg/.test(x.s));                 // a ctx-be beadott sugoSzoveg
  assert.deepEqual(tiltott.map(x => `core/elakadas-gen.js:${x.n} — ${x.s.trim()}`), [],
    'A core/elakadas-gen.js-ben a cikkSzoveg csak a definícióban szerepelhet; a ctx-be „cikkSzoveg: sugoSzoveg” kell.');
  const ctxSor = sorok.filter(s => /cikkSzoveg:\s*sugoSzoveg/.test(s));
  assert.equal(ctxSor.length, 1, 'A core/elakadas-gen.js CLI ctx-ében „cikkSzoveg: sugoSzoveg” kell (a súgó a tárból jöjjön).');
});

t('core/elakadas-gen.js: a sugoSzoveg dinamikus importtal jön (körkörös import ellen), nem statikussal', () => {
  const sorok = olvas('core/elakadas-gen.js');
  assert.ok(sorok.some(s => /await import\('\.\/sugo-tar\.js'\)/.test(s)), 'hiányzik: await import(\'./sugo-tar.js\')');
  assert.ok(!sorok.some(s => /^\s*import\b.*sugo-tar\.js/.test(s)), 'a sugo-tar.js statikus importja körkörös importot okozna');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} sugo-tar-or.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
