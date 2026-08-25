// ===================================================================
// REEL-SOR — melyik útmutatóból legyen ma videó?
// ===================================================================
//
// ⚠️ A CI NAPONTA HÁROMSZOR FUT. Jelölés nélkül ugyanaz a Reel naponta
// háromszor menne ki — ez az egyetlen ok, amiért a Reel eddig nem volt
// bekötve az automatikába (2026-08-24 óta készen áll minden más).
//
// A jelölés helye a cikk `_meta.reel_at` mezője — ugyanaz a minta, mint a
// Facebook-poszté (`posted_fb`), és ugyanabban a fájlban él, amit a CI
// amúgy is visszacommitol.
// ===================================================================

import assert from 'assert/strict';
import { reelMaMar, kovetkezoReel } from './reel-queue.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 reel-sor\n');

const MOST = Date.parse('2026-08-25T17:00:00Z');
const g = (slug, at, extra = {}) => ({
  slug, type: 'guide', published_at: at, ...extra
});

// ── ment-e ma már Reel? ─────────────────────────────────────────────

t('ma már ment → igen', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: '2026-08-25T02:10:00Z' })], MOST), true);
});

t('tegnap ment, ma még nem → nem', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: '2026-08-24T23:59:00Z' })], MOST), false);
});

t('soha nem ment → nem', () => {
  assert.equal(reelMaMar([g('a', '2026-01-01')], MOST), false);
  assert.equal(reelMaMar([], MOST), false);
  assert.equal(reelMaMar(null, MOST), false);
});

// ── kit válasszunk? ─────────────────────────────────────────────────
//
// A LEGRÉGEBBIT. Az útmutató ÖRÖKZÖLD, tehát nincs romlandósága — a friss
// előnyben részesítése (mint a Facebook-sornál) itt csak azt érné el, hogy
// a 358 régi soha ne kerüljön sorra. FIFO: a hátralék kiszámíthatóan fogy.

t('a LEGRÉGEBBI, még sosem használt útmutatót választja', () => {
  const cikkek = [
    g('uj', '2026-08-20'),
    g('regi', '2026-06-01'),
    g('kozepes', '2026-07-15')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'regi');
});

t('amiből már volt Reel, azt kihagyja', () => {
  const cikkek = [
    g('regi', '2026-06-01', { reel_at: '2026-07-01T00:00:00Z' }),
    g('kovetkezo', '2026-06-05')
  ];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'kovetkezo');
});

t('⛔ HÍRBŐL nem lesz Reel — csak útmutatóból', () => {
  // A videó szövege a „Step N —" fejlécekből épül; a hírben ilyen nincs.
  const cikkek = [{ slug: 'egy-hir', type: 'news', published_at: '2026-01-01' }, g('utm', '2026-08-01')];
  assert.equal(kovetkezoReel(cikkek, MOST)?.slug, 'utm');
});

t('⛔ ha ma már ment Reel, nem választ senkit', () => {
  const cikkek = [g('regi', '2026-06-01'), g('mai', '2026-08-01', { reel_at: '2026-08-25T02:00:00Z' })];
  assert.equal(kovetkezoReel(cikkek, MOST), null);
});

t('a szűrő (pl. „elég lépés van-e") kizárhat cikkeket', () => {
  // A videó legalább 3 lépést kér (core/short-video.js MIN_LEPES). Azt, hogy
  // egy cikkből TELIK-E videó, csak a markdown ismeretében lehet eldönteni —
  // ezért a hívó adja be szűrőként, nem itt találgatunk.
  const cikkek = [g('rovid', '2026-06-01'), g('jo', '2026-06-05')];
  const r = kovetkezoReel(cikkek, MOST, { alkalmas: c => c.slug !== 'rovid' });
  assert.equal(r?.slug, 'jo');
});

t('ha senki nem alkalmas, null — nem borulás', () => {
  assert.equal(kovetkezoReel([g('a', '2026-06-01')], MOST, { alkalmas: () => false }), null);
  assert.equal(kovetkezoReel([], MOST), null);
  assert.equal(kovetkezoReel(null, MOST), null);
});

t('dátum nélküli cikket nem választ — nem tudnánk sorba tenni', () => {
  assert.equal(kovetkezoReel([{ slug: 'nincs-datum', type: 'guide' }], MOST), null);
});

// ── a jelölés IRÁNYA ────────────────────────────────────────────────

t('⚠️ a HIBÁS reel_at nem számít „ma már ment"-nek', () => {
  // Ha a mező szemét, abból NEM következik, hogy ma ment ki Reel. A rossz
  // irány itt az lenne, hogy egy elrontott mező ÖRÖKRE elnémítja a Reelt.
  for (const rossz of ['', 'tegnap', null, 0, {}]) {
    assert.equal(reelMaMar([g('a', '2026-01-01', { reel_at: rossz })], MOST), false, JSON.stringify(rossz));
  }
});

console.log('\n✅ reel-queue.test: mind a ' + pass + ' eset rendben');
