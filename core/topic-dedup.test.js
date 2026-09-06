// ===================================================================
// KÖZELI-TÉMA-ŐR TESZT — futtatás: node core/topic-dedup.test.js
// Offline: injektált ál-embedText (nincs hálózat/AI). $0.
// ===================================================================
import { strict as assert } from 'assert';
import { tmpdir } from 'os';
import { join as pjoin } from "path";
import { fileURLToPath } from "url";
import { existsSync, rmSync, readFileSync as rfs } from 'fs';

// ===================================================================
// 🔒 A TESZT NEM ÍRHAT AZ ÉLES BEÁGYAZÁS-CACHE-BE (2026-09-06)
// ===================================================================
// A lenti ál-embedFn 8 DIMENZIÓS vektorokat ad. Ezek eddig a valódi
// `guides/topic-embeddings.json`-be íródtak (mérve: 2 ilyen bejegyzés volt
// benne). Önmagában ártalmatlan — a dimenzió-őr tévesztésnek veszi és
// újraszámolja —, de 2026-09-06 óta a CI is futtatja a teszteket, tehát a
// szemét mostantól MINDEN futásnál keletkezne.
//
// ⚠️ AZ ÉRTÉKADÁS AZ IMPORT ELŐTT KELL. A statikus `import` felülemelkedik a
// kódon, tehát a modul a régi úttal töltődne be — ezért DINAMIKUS az import
// alább. (Ez a csapda egyszer már megfogott egy másik teszten.)
// ⚠️ `fileURLToPath`, NEM `.pathname`: Windowson az utóbbi „/C:/AI%20work/…"-et
// ad (vezető perjel + URL-kódolt szóköz), amitől az `existsSync` némán hamisat
// mond — és a záró őr úgy hallgatna, mintha minden rendben lenne.
const ELES_CACHE = fileURLToPath(new URL('../guides/topic-embeddings.json', import.meta.url));
const ELES_ELOTTE = existsSync(ELES_CACHE) ? rfs(ELES_CACHE, 'utf-8') : null;
process.env.TOPIC_EMBED_CACHE_PATH = pjoin(tmpdir(), 'topic-embed-teszt-' + process.pid + '.json');

const { isNearDuplicateTitle, normTitle } = await import('./topic-dedup.js');

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

// --- 7. LEVETT TÉMA őr (SkillOpt-zombi tanulsága): id- ÉS cím-egyezésre fog ---
import { isRemovedTopic } from './topic-dedup.js';
import { readFileSync as rf } from 'fs';
const topicsNow = JSON.parse(rf('guides/guide-topics.json', 'utf-8'));
const removedNow = (topicsNow.topics || []).find(x => x.status === 'removed');
if (removedNow) {
  assert.equal(isRemovedTopic({ guide_topic_id: removedNow.id }, ''), true, 'levett téma id-ról felismerve');
  assert.equal(isRemovedTopic({}, removedNow.title), true, 'levett téma címről felismerve');
}
assert.equal(isRemovedTopic({ guide_topic_id: 'no-such-topic-xyz' }, 'Totally Fresh Topic'), false, 'élő téma nem jelez');

console.log('✅ topic-dedup.test: mind a 7 blokk átment');

// 🔒 ZÁRÓ ŐR: az éles cache bájtra változatlan maradt-e?
if (ELES_ELOTTE !== null) {
  const most = existsSync(ELES_CACHE) ? rfs(ELES_CACHE, 'utf-8') : null;
  assert.equal(most, ELES_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES BEÁGYAZÁS-CACHE-BE!');
  console.log('  ✅ az éles topic-embeddings.json érintetlen');
}
try { rmSync(process.env.TOPIC_EMBED_CACHE_PATH, { force: true }); } catch { /* */ }
