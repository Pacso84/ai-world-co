// ===================================================================
// SOCIAL SOR TESZT — futtatás: node core/social-queue.test.js
//
// A fő eset a MAI ÉLES ÁLLAPOTBÓL való (2026-08-04): 13 friss hír és 156
// örökzöld útmutató áll a sorban, a CI `--limit 2`-vel fut. A régi
// rangsorolás ilyenkor KÉT frisset küldött és nulla útmutatót — örökre.
// ===================================================================
import { strict as assert } from 'assert';
import { selectSocialBatch } from './social-queue.js';

const fresh = (n, day) => ({ pubAt: `2026-08-${String(day).padStart(2, '0')}`, isGuide: false, isFresh: true, id: 'fresh' + n });
const freshGuide = (n, day) => ({ pubAt: `2026-08-${String(day).padStart(2, '0')}`, isGuide: true, isFresh: true, id: 'fg' + n });
const ever = (n, day) => ({ pubAt: `2026-07-${String(day).padStart(2, '0')}`, isGuide: true, isFresh: false, id: 'ever' + n });

// ── 1) ★ A MAI ÉLES HELYZET: 13 friss + 156 örökzöld, limit 2 ────────
{
  const items = [...Array(13)].map((_, i) => fresh(i, 4)).concat([...Array(156)].map((_, i) => ever(i, 10 + (i % 20))));
  const batch = selectSocialBatch(items, 2);
  assert.equal(batch.length, 2, 'a kiküldött posztok SZÁMA nem csökken');
  assert.equal(batch.filter(x => x.isFresh).length, 1, '1 friss');
  assert.equal(batch.filter(x => !x.isFresh).length, 1, '1 örökzöld útmutató ← EZ HIÁNYZOTT');
}

// ── 2) NINCS örökzöld → minden hely a frissé (nem vész el hely) ──────
{
  const batch = selectSocialBatch([fresh(1, 4), fresh(2, 3), fresh(3, 2)], 2);
  assert.equal(batch.length, 2);
  assert.ok(batch.every(x => x.isFresh), 'örökzöld híján a friss tölti fel');
}

// ── 3) NINCS friss → minden hely az örökzöldé ────────────────────────
{
  const batch = selectSocialBatch([ever(1, 10), ever(2, 11), ever(3, 12)], 2);
  assert.equal(batch.length, 2);
  assert.ok(batch.every(x => !x.isFresh));
}

// ── 4) CSAK 1 örökzöld van, limit 4 → 1 örökzöld + 3 friss ───────────
{
  const items = [fresh(1, 4), fresh(2, 3), fresh(3, 2), fresh(4, 1), ever(1, 10)];
  const batch = selectSocialBatch(items, 4);
  assert.equal(batch.length, 4, 'a hely nem vész el');
  assert.equal(batch.filter(x => !x.isFresh).length, 1);
  assert.equal(batch.filter(x => x.isFresh).length, 3);
}

// ── 5) FRISS ÚTMUTATÓ továbbra is a friss ágon versenyez (nem esik ki) ─
{
  const items = [fresh(1, 4), freshGuide(1, 4), ever(1, 10)];
  const batch = selectSocialBatch(items, 2);
  assert.equal(batch.length, 2);
  assert.equal(batch.filter(x => !x.isFresh).length, 1, '1 hely az örökzöldé');
  assert.ok(batch.some(x => x.isFresh), 'a friss ág is kap helyet');
}

// ── 6) ÖRÖKZÖLD SORREND: a LEGRÉGEBBI megy előbb (a hátralék ürüljön) ─
{
  const items = [ever(1, 20), ever(2, 5), ever(3, 12)];
  const batch = selectSocialBatch(items, 1);
  // limit 1 → nincs fenntartás, de friss sincs, tehát örökzöld megy
  assert.equal(batch.length, 1);
  assert.equal(batch[0].pubAt, '2026-07-05', 'a legrégebbi megy elsőként');
}

// ── 7) FRISS SORREND változatlan: a LEGÚJABB megy előbb ──────────────
{
  const items = [fresh(1, 1), fresh(2, 4), fresh(3, 2)];
  const batch = selectSocialBatch(items, 1);
  assert.equal(batch[0].pubAt, '2026-08-04', 'a legfrissebb hír megy elsőként');
}

// ── 8) Széles esetek: üres bemenet, 0 limit ──────────────────────────
{
  assert.deepEqual(selectSocialBatch([], 2), []);
  assert.deepEqual(selectSocialBatch([fresh(1, 4)], 0), []);
  assert.deepEqual(selectSocialBatch(null, 2), []);
}

// ── 9) A RÉGI HÍR (nem friss, nem útmutató) SOHA nem kerül be ────────
//     — azt a hívó már 'skipped-stale'-lel lezárta, ide nem juthat.
{
  const staleNews = { pubAt: '2026-07-01', isGuide: false, isFresh: false, id: 'stale' };
  const batch = selectSocialBatch([staleNews, ever(1, 10)], 2);
  assert.ok(!batch.some(x => x.id === 'stale'), 'lejárt hír nem kerülhet a kötegbe');
}

console.log('✅ social-queue.test: minden átment');
