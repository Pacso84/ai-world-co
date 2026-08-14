// ===================================================================
// TESZT — borítókép-őrszem
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-14, a user vette észre a főoldalon):
// a CÍMLAPSZTORI borítója üres bézs felület volt egyetlen csillogás-emojival.
// Nem dizájn-hiba: a képfájl NEM LÉTEZETT. A designer mindhárom mai cikkre
// "Cloudflare HTTP 400"-at kapott (a Cloudflare kivezette a width/height
// paramétert), és ezt SZÉPEN BE IS ÍRTA — a CI naplójába, ahová senki nem néz.
//
// Ez UGYANAZ a minta, mint a 08-10-i i18n-őrszemnél: az őrszem csak akkor őr,
// ha oda szól, ahol a user néz. Ezért ez az őrszem állapotfájlt ír, és a napi
// riport beolvassa.
//
// A SZIMPTÓMÁT mérjük (hiányzik a kép), nem az OKOT — így BÁRMILYEN jövőbeli
// ok (API-változás, kvóta, hálózat) ugyanúgy kiderül, nem csak a mostani.
// ===================================================================

import assert from 'assert/strict';
import { findMissingCovers, COVER_FRESH_DAYS } from './image-guard.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 borítókép-őrszem\n');

const MA = '2026-08-14T10:00:00.000Z';
const cikk = (slug, pub, extra = {}) => ({ slug, pub, ...extra });

t('a hiányzó borítót megtalálja', () => {
  const r = findMissingCovers({
    articles: [cikk('van-kepe', '2026-08-14T01:00:00Z'), cikk('nincs-kepe', '2026-08-14T02:00:00Z')],
    hasCover: s => s === 'van-kepe',
    now: MA
  });
  assert.equal(r.length, 1);
  assert.equal(r[0].slug, 'nincs-kepe');
});

t('ha mindennek van képe, NEM szólal meg', () => {
  const r = findMissingCovers({
    articles: [cikk('a', '2026-08-14T01:00:00Z'), cikk('b', '2026-08-13T01:00:00Z')],
    hasCover: () => true, now: MA
  });
  assert.deepEqual(r, [], 'csendes, ha nincs baj');
});

t('a CÍMLAPSZTORI hiánya KIEMELT', () => {
  const r = findMissingCovers({
    articles: [
      cikk('legfrissebb-hir', '2026-08-14T09:00:00Z'),
      cikk('regebbi-hir', '2026-08-14T01:00:00Z')
    ],
    hasCover: () => false, now: MA
  });
  assert.equal(r[0].slug, 'legfrissebb-hir');
  assert.equal(r[0].cimlap, true, 'meg is van jelölve címlapsztoriként');
  assert.equal(r[1].cimlap, false);
});

t('a címlapsztori NEM egyszerűen a legfrissebb cikk', () => {
  // ⚠️ ÉLESBEN MÉRVE (2026-08-14): aznap a legfrissebb cikk egy ÚTMUTATÓ volt,
  // a főoldal címlapján mégis a legfrissebb HÍR állt. A build hír-blokkja
  // kihagyja az útmutatókat (azok a /guides alatt élnek) ÉS a heti
  // összefoglalót (az külön ki van tűzve). Az első változatom emiatt NEM
  // jelölte volna meg a valódi esetet — ez a teszt őrzi, hogy ne csússzon vissza.
  const r = findMissingCovers({
    articles: [
      cikk('friss-utmutato', '2026-08-14T09:30:00Z', { guide: true }),
      cikk('friss-digest', '2026-08-14T09:20:00Z', { digest: true }),
      cikk('ez-a-cimlap', '2026-08-14T09:00:00Z')
    ],
    hasCover: () => false, now: MA
  });
  const cimlap = r.find(x => x.cimlap);
  assert.equal(cimlap.slug, 'ez-a-cimlap', 'a legfrissebb HÍR a címlapsztori');
  assert.equal(r.filter(x => x.cimlap).length, 1, 'pontosan egy címlapsztori van');
  assert.equal(r[0].cimlap, true, 'a címlapsztori áll a lista elején');
});

t('a RÉGI cikkeket nem firtatja', () => {
  // A régi képhiány más ügy (házmester/felújítás); ez az őrszem a FRISS
  // termésre néz, különben minden nap ugyanazt a több száz elemet sorolná,
  // és a riport-sor zajjá válna.
  const regi = new Date(Date.parse(MA) - (COVER_FRESH_DAYS + 3) * 864e5).toISOString();
  const r = findMissingCovers({
    articles: [cikk('nagyon-regi', regi)],
    hasCover: () => false, now: MA
  });
  assert.deepEqual(r, [], 'a régi hiány nem ennek az őrszemnek a dolga');
});

t('a slug nélküli cikk nem borítja fel', () => {
  const r = findMissingCovers({
    articles: [{ slug: '', pub: '2026-08-14T01:00:00Z' }, { pub: '2026-08-14T01:00:00Z' }],
    hasCover: () => false, now: MA
  });
  assert.deepEqual(r, [], 'amit nem tudunk azonosítani, arról nem állítunk semmit');
});

t('ha a kép-ellenőrzés HIBÁRA fut, NEM jelentünk hiányt', () => {
  // Óvatosság: egy fájlrendszer-hiba ne generáljon hamis riasztást a riportba.
  // Inkább maradjunk csendben, mint hogy farkast kiáltsunk.
  const r = findMissingCovers({
    articles: [cikk('a', '2026-08-14T01:00:00Z')],
    hasCover: () => { throw new Error('lemez-hiba'); }, now: MA
  });
  assert.deepEqual(r, [], 'bizonytalanságból nem lesz riasztás');
});

t('rossz bemenetre nem esik szét', () => {
  assert.deepEqual(findMissingCovers({}), []);
  assert.deepEqual(findMissingCovers({ articles: null, hasCover: () => false }), []);
  assert.deepEqual(findMissingCovers(), []);
});

t('a friss-ablak a napi termést fedi', () => {
  assert.ok(COVER_FRESH_DAYS >= 2 && COVER_FRESH_DAYS <= 14, 'se túl szűk, se zajos');
});

console.log('\n✅ image-guard.test: mind a ' + pass + ' eset rendben');
