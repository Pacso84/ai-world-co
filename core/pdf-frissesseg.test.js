// 📕 PDF-csomagok frissessége (2026-11-08): a 10-19-i PDF-ekben 39 már törölt és
// 26 azóta javított útmutató maradt, és semmi nem jelezte.
import assert from 'assert';
import { pdfFrissesseg, pdfFrissessegSor, pdfModositasNap, tartalomBeolvas, eloUtmutatok, JAVULT_KUSZOB } from './pdf-frissesseg.js';

let fail = 0;
const t = (n, f) => { try { f(); console.log('  ✅', n); } catch (e) { fail++; console.log('  ❌', n, '\n    ', e.message); } };

const elo = new Map([
  ['regi-valtozatlan', { published_at: '2026-08-01T00:00:00Z' }],
  ['javult', { published_at: '2026-08-01T00:00:00Z', fresh_updated_at: '2026-11-07T10:00:00Z' }],
  ['csak-elakadas', { published_at: '2026-08-01T00:00:00Z', elakadas_at: '2026-11-01T00:00:00Z' }],
  ['gyanus-flag', { published_at: '2026-08-01T00:00:00Z', fact_checked_at: '2026-11-01T00:00:00Z', fact_check_flag: true }],
]);
const tartalom = { gyartva: '2026-10-19T10:25:00Z', utmutatok: ['regi-valtozatlan', 'javult', 'torolt-mar', 'csak-elakadas', 'gyanus-flag'] };

t('törölt és javult útmutatót külön számol; a „Ha elakadsz” doboz és a megjelölt gyanú nem számít javulásnak', () => {
  const r = pdfFrissesseg(tartalom, elo);
  assert.deepEqual(r.torolt, ['torolt-mar']);
  assert.deepEqual(r.javult, ['javult']);
});

t('ugyanazon a napon történt javítás nem „későbbi” (a gyártás már tartalmazza)', () => {
  assert.deepEqual(pdfFrissesseg({ gyartva: '2026-11-07T23:00:00Z', utmutatok: ['javult'] }, elo).javult, []);
});

t('a riportsor: törölt útmutatónál MÁR 1-től ⚠️ és megmondja a parancsot', () => {
  const s = pdfFrissessegSor(tartalom, elo);
  assert.match(s, /⚠️/); assert.match(s, /1 már NINCS FENN/); assert.match(s, /ebook-build\.js --mind --pdf/);
});

t('🔑 ELLENIRÁNY: naprakész csomagnál ✅, kevés javulásnál csak ℹ️ (nem riaszt fölöslegesen)', () => {
  assert.match(pdfFrissessegSor({ gyartva: '2026-10-19', utmutatok: ['regi-valtozatlan'] }, elo), /✅ naprakészek/);
  const s = pdfFrissessegSor({ gyartva: '2026-10-19', utmutatok: ['regi-valtozatlan', 'javult'] }, elo);
  assert.match(s, /ℹ️/); assert.doesNotMatch(s, /⚠️/);
  assert.ok(JAVULT_KUSZOB > 1);
});

t('hiányzó tartalomlista NEM néma „rendben”', () => {
  assert.match(pdfFrissessegSor(null, elo), /⚠️ nincs tartalomlista/);
});

t('pdfModositasNap: a tartalmi mezők közül a legkésőbbi napot adja', () => {
  assert.equal(pdfModositasNap({ howto_upgraded_at: '2026-09-01T00:00:00Z', fresh_updated_at: '2026-11-07T01:00:00Z' }), '2026-11-07');
  assert.equal(pdfModositasNap({}), '');
});

t('a VALÓDI repóban megvan a PDF-ek tartalomlistája, és a riportsor kiszámolható belőle', () => {
  const tl = tartalomBeolvas();
  assert.ok(tl && Array.isArray(tl.utmutatok) && tl.utmutatok.length > 0, 'website/assets/free/tartalom.json hiányzik');
  assert.ok(/^\d{4}-\d{2}-\d{2}/.test(tl.gyartva), 'gyartva dátum hiányzik');
  // A törlés/javulás NEM tesztbukás (a 0 olvasós törlés rendes működés) — azt a
  // napi Telegram-riport 📕 sora jelzi, ott, ahol a user néz.
  assert.match(pdfFrissessegSor(tl, eloUtmutatok()), /^📕 PDF-csomagok/);
});

if (fail) { console.log(`❌ ${fail} hiba`); process.exit(1); }
console.log('✅ pdf-frissesseg: minden rendben');
