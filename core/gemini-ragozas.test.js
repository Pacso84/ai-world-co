// node core/gemini-ragozas.test.js — a „Gemini” magyar ragozása (2026-11-19, kitaláció-keresés 5. része közben találva)
// A fordító 24 magyar szövegben rosszul ragozta: „a Gemit” / „Gemitől” / „Gemin-it” / „Geminnel” (helyesen: Geminit,
// Geminitől, Geminivel — a magánhangzóra végződő névhez a rag közvetlenül tapad). A javítás a magyar javító
// térképben él (memory/hu-word-verdicts.json → fix), amit a fordító minden új szövegre alkalmaz (applyFixes),
// a meglévőkre pedig: node core/hu-review.js --fix.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFixes } from './hu-proofread.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = JSON.parse(readFileSync(join(ROOT, 'memory', 'hu-word-verdicts.json'), 'utf-8'));

const ESETEK = [
  ['Nyisd meg a Gemit, és kérdezd meg a Gemitől.', 'Nyisd meg a Geminit, és kérdezd meg a Geminitől.'],
  ['Így kérd meg a Gemin-it, hogy magyarázza el.', 'Így kérd meg a Geminit, hogy magyarázza el.'],
  ['kapcsolja be a Geminít', 'kapcsolja be a Geminit'],
  ['ahol most használhatod a Gemitit', 'ahol most használhatod a Geminit'],
  ['a Geminnel és a Gemivel', 'a Geminivel és a Geminivel'],
  ['mondd a Geminek, bízd a Gemire', 'mondd a Gemininek, bízd a Geminire'],
  ['Gemit nyisd meg', 'Geminit nyisd meg']   // mondat eleji nagybetű megmarad
];
for (const [be, ki] of ESETEK) assert.equal(applyFixes(be, store).text, ki, be);
// a HELYES alakokhoz nem nyúl
for (const jo of ['a Geminit', 'a Geminitől', 'a Geminivel', 'a Gemini Live', 'Google Gemini']) assert.equal(applyFixes(jo, store).text, jo);
console.log('✅ gemini-ragozas.test: minden átment');
