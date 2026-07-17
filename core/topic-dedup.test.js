// ===================================================================
// KÖZELI-TÉMA-ŐR TESZT — futtatás: node core/topic-dedup.test.js
// Offline: injektált ál-embedText (nincs hálózat/AI). $0.
// ===================================================================
import { strict as assert } from 'assert';
import { isNearDuplicateTitle, normTitle } from './topic-dedup.js';

// Ál-embedFn: determinisztikus "jelentés-vektor" néhány kulcsszóra.
// A "meeting/notes/action" témák EGY irányba mutatnak → magas koszinusz.
const fakeEmbed = async (title) => {
  const t = title.toLowerCase();
  const dims = ['meeting', 'notes', 'action', 'email', 'photo', 'budget', 'recipe'];
  const v = dims.map(d => (t.includes(d) ? 1 : 0));
  // kis alapzaj, hogy a normálás ne osszon nullával
  v.push(0.01);
  return v;
};

const EXISTING = [
  'How to Turn Your Meeting Notes into Action Plans with AI',
  'Write a Polite Complaint Email with ChatGPT',
  'Clean Up Blurry Photos with Apple Intelligence'
];

// 1) JELENTÉSBEN KÖZELI (más szavak, ugyanaz a téma) → duplikátum
const d1 = await isNearDuplicateTitle('How to Turn Meeting Notes into Clear Action Plans', EXISTING, { embedFn: fakeEmbed });
assert.equal(d1.duplicate, true, 'közeli meeting-notes téma = duplikátum');
assert.ok(d1.closest.title.includes('Meeting Notes'), 'a legközelebbi a meeting-notes téma');

// 2) KÜLÖNBÖZŐ téma → NEM duplikátum
const d2 = await isNearDuplicateTitle('How to Plan a Weekly Budget with AI', EXISTING, { embedFn: fakeEmbed });
assert.equal(d2.duplicate, false, 'budget-téma nem duplikátum');

// 3) SZÓ SZERINT azonos (normalizálva) → duplikátum, embedding nélkül is
const d3 = await isNearDuplicateTitle('write a polite complaint email with chatgpt', EXISTING, { embedFn: null });
assert.equal(d3.duplicate, true, 'normalizálva azonos cím = duplikátum (exact)');
assert.equal(d3.closest.by, 'exact', 'exact ágon fogja');

// 4) EMBEDDING NÉLKÜL, Jaccard-tartalék: sok közös szó → duplikátum
const d4 = await isNearDuplicateTitle('Turn Your Meeting Notes into Action Plans', EXISTING, { embedFn: null });
assert.equal(d4.duplicate, true, 'Jaccard-tartalék fogja a majdnem-azonost');
assert.equal(d4.closest.by, 'jaccard', 'jaccard ágon');

// 5) ÜRES meglévő-lista → sosem duplikátum
const d5 = await isNearDuplicateTitle('Anything at all', [], { embedFn: fakeEmbed });
assert.equal(d5.duplicate, false, 'üres referencia = nincs duplikátum');

// 6) normTitle helyes
assert.equal(normTitle('How to  DO-it!! Now'), 'how to do it now', 'normTitle összevon és tisztít');

console.log('✅ topic-dedup.test: mind a 6 blokk átment');
