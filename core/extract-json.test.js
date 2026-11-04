// ===================================================================
// TESZT — JSON-tömb kihámozása a modell válaszából
// ===================================================================
// INGYENES, hálózat nélküli.
//
// MIÉRT KÖZÖS MODUL: ez a függvény 2026-08-18-ig KÉTSZER volt lemásolva
// (agents/rss-scraper/agent.js és agents/guide/agent.js), core-ban sehol.
// A harmadik másolat helyett ide kerül — és így végre van rá teszt is.
// ===================================================================

import assert from 'assert/strict';
import { extractJsonArray } from './extract-json.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 JSON-kihámozás\n');

t('sima tömb', () => {
  assert.deepEqual(extractJsonArray('[{"a":1}]'), [{ a: 1 }]);
});

t('markdown-kerítésben', () => {
  assert.deepEqual(extractJsonArray('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.deepEqual(extractJsonArray('```\n[1,2]\n```'), [1, 2]);
});

t('fecsegés a tömb körül', () => {
  assert.deepEqual(extractJsonArray('Itt a valasz:\n[1,2,3]\nRemelem jo!'), [1, 2, 3]);
});

t('🔑 objektum-borítékból is kiszedi a tömböt', () => {
  // A JSON-mód (Cerebras/GLM-4.7) legfelül objektumot kényszerít. 2026-07-16-án
  // ezen bukott el a scraper 3 napra: "results is not iterable".
  assert.deepEqual(extractJsonArray('{"decisions":[{"index":0}]}'), [{ index: 0 }]);
  assert.deepEqual(extractJsonArray('{"groups":[{"theme":"x"}]}'), [{ theme: 'x' }]);
});

t('egyetlen döntés-objektumot tömbbe csomagol', () => {
  assert.deepEqual(extractJsonArray('{"index":0,"keep":true}'), [{ index: 0, keep: true }]);
});

t('szemétre HIBÁT dob (a hívó erre esik vissza)', () => {
  assert.throws(() => extractJsonArray('semmi ertelmes'));
  assert.throws(() => extractJsonArray(''));
  assert.throws(() => extractJsonArray('{"a":1}'));   // se tömb, se index
});

console.log('\n✅ extract-json.test: mind a ' + pass + ' eset rendben');
