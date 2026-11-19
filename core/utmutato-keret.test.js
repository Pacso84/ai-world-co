// node core/utmutato-keret.test.js — a napi útmutató-keret nem csordulhat túl az átdolgozott régiek miatt
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { utmutatoKeret } from './utmutato-keret.js';

// 1) A 11-17-i eset: reggel 0 publikált, 1 elbukott (javítható) trend-útmutató → csak 1 új írható, nem 2
assert.equal(utmutatoKeret({ max: 2, maPublikalt: 0, varoVazlat: 0, atdolgozhato: 1 }), 1);
// 2) A 11-12-i eset: 1 publikált + 2 javítható elbukott → 0 új (különben 3–4 / 2 lett)
assert.equal(utmutatoKeret({ max: 2, maPublikalt: 1, atdolgozhato: 2 }), 0);
// 3) A főnök döntésére váró (4 kör után) is foglal helyet — a főnök kiadhatja
assert.equal(utmutatoKeret({ max: 2, maPublikalt: 1, fonokDontesre: 1 }), 0);
// 4) Üres nap → a teljes keret; sosem negatív; hibás bemenet nem nyit kaput
assert.equal(utmutatoKeret({ max: 2 }), 2);
assert.equal(utmutatoKeret({ max: 2, maPublikalt: 3, atdolgozhato: 2 }), 0);
assert.equal(utmutatoKeret({ max: 2, atdolgozhato: NaN, varoVazlat: -1 }), 2);
assert.equal(utmutatoKeret({ max: undefined }), 0);
// 5) Bekötés-őr: a főnök (CEO) TÉNYLEG ezzel számolja a guides_remaining-et, és átadja neki a javíthatókat
{
  const src = readFileSync(new URL('../agents/ceo/agent.js', import.meta.url), 'utf-8')
    .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
  assert.ok(/guides_remaining:\s*utmutatoKeret\s*\(/.test(src), '⚠️ a guides_remaining megint a régi, rés-es képlettel számol');
  assert.ok(/atdolgozhato:\s*countGuideReworkable\s*\(\s*\{\s*extraNelkul:\s*true\s*\}\s*\)/.test(src), 'a javítható elbukott útmutatók nincsenek levonva');
  assert.ok(/fonokDontesre:\s*countGuideEscalatable\s*\(\s*\{\s*extraNelkul:\s*true\s*\}\s*\)/.test(src), 'a főnök-döntésre várók nincsenek levonva');
}
console.log('✅ utmutato-keret.test: minden átment');
