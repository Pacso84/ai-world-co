// ===================================================================
// TESZT — melyik cikkhez melyik megosztás-képet gyártsuk le
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { selectFormats, queuedSlugs, POST_ONLY } from './image-targets.js';

const ALL = [{ key: 'share' }, { key: 'pin' }, { key: 'fb' }];
const keys = list => list.map(f => f.key);

// --- selectFormats: friss cikk mindent kap -------------------------
assert.deepEqual(
  keys(selectFormats({ ageDays: 0, freshDays: 7, isQueued: false, all: ALL })),
  ['share', 'pin', 'fb'],
  'a ma publikált cikk minden formátumot megkap');

assert.deepEqual(
  keys(selectFormats({ ageDays: 7, freshDays: 7, isQueued: false, all: ALL })),
  ['share', 'pin', 'fb'],
  'a HATÁRON lévő cikk még friss (<=, nem <)');

// --- selectFormats: régi, de posztolásra vár ------------------------
// Ez a lényeg: az örökzöld útmutató hetekkel a publikálás után megy ki
// fenntartott helyen (core/social-queue.js), és eddig CÍM NÉLKÜLI sima
// borítót kapott, mert a 7 napos ablak már nem gyártott neki képet.
assert.deepEqual(
  keys(selectFormats({ ageDays: 40, freshDays: 7, isQueued: true, all: ALL })),
  ['pin', 'fb'],
  'a sorban álló régi cikk CSAK a posztoló formátumokat kapja');

// A share/ SZÁNDÉKOSAN kimarad: azt az og:image-hez és a régi tartaléknak
// tartjuk, a posztolók viszont a fb/ és pin/ képet keresik először.
assert.ok(!POST_ONLY.includes('share'), 'a share nem posztoló formátum');

// --- selectFormats: régi és nem is vár sorra ------------------------
assert.deepEqual(
  selectFormats({ ageDays: 40, freshDays: 7, isQueued: false, all: ALL }), [],
  'a régi, már kiküldött cikkhez nem gyártunk semmit');

// --- ismeretlen kor: ne dolgozzunk vakon ----------------------------
assert.deepEqual(
  selectFormats({ ageDays: NaN, freshDays: 7, isQueued: true, all: ALL }), [],
  'hiányzó dátumnál inkább kihagyjuk, mint hogy 600 képet gyártsunk');

// --- queuedSlugs: csak a KI NEM KÜLDÖTT elemek ----------------------
const q = queuedSlugs([
  { slug: 'a', posted_fb: true, posted_pin: true },
  { slug: 'b', posted_fb: true },                    // Pinterestre még nem ment
  { slug: 'c' },                                      // egyikre sem
  { slug: 'd', posted_pin: 'skipped-stale-news', posted_fb: true },
  { posted_fb: false },                               // slug nélkül: kihagyjuk
  { slug: 'e', url: 'https://x/article/e-real' }      // az url a mérvadó
]);
assert.ok(!q.has('a'), 'a mindkét helyre kiküldött nem kell');
assert.ok(q.has('b'), 'a félig kiküldött még kell (Pinterest vár rá)');
assert.ok(q.has('c'), 'a sehova ki nem küldött kell');
assert.ok(!q.has('d'), 'a lezárt (stale) elem nem kell');
assert.ok(q.has('e-real'), 'az url-ből fejtett slug a mérvadó, nem a slug mező');
assert.equal(q.size, 3, 'pontosan 3 slug vár képre');

console.log('✅ image-targets: minden teszt átment');
