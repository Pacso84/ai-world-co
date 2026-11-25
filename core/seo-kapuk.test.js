// ===================================================================
// TESZT — keresőcím-kapuk, kapcsoló, fejléc-választás (core/seo-kapuk.js)
// Ingyenes, hálózat nélkül. A VALÓDI Google Meet-cikkből dolgozik.
// Kapcsolódó: docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0. + 6.5)
// ===================================================================
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cimTag } from './title-tag.js';
import {
  SEO_ELES_BE, CIM_MIN, CIM_MAX, LEIRAS_MIN, LEIRAS_MAX,
  seoKapuk, igeretKapuk, keresoFej, fejCimEsLeiras, withBrand
} from './seo-kapuk.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 SEO keresőcím-kapuk\n');

const MEET_SLUG = 'how-to-find-your-google-meet-recordings-transcripts-and-notes';
const meetFajl = readdirSync(join(ROOT, 'content', 'articles')).find(f => {
  try { return JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'))._meta?.slug === MEET_SLUG; } catch { return false; }
});
const MEET = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', meetFajl), 'utf-8'));
const MD = MEET.article_markdown;
const JO_CIM = 'Where to Find Google Meet Recordings, Transcripts and Notes';
const JO_LEIRAS = "Google Meet saves recordings, transcripts and Gemini notes in the organizer's Google Drive, in a folder called Meet Recordings. Here is how to find them.";
const kodok = h => h.map(x => x.split(':')[0]);
const kapu = (o) => kodok(seoKapuk({ cim: JO_CIM, leiras: JO_LEIRAS, cikkMd: MD, ...o }));

t('határok a spec szerint (25–60 / 120–158)', () => {
  assert.deepEqual([CIM_MIN, CIM_MAX, LEIRAS_MIN, LEIRAS_MAX], [25, 60, 120, 158]);
});
t('jó cím + leírás a valódi Meet-cikken → nincs hiba', () => {
  assert.deepEqual(seoKapuk({ cim: JO_CIM, leiras: JO_LEIRAS, cikkMd: MD }), []);
});
t('CIM_HOSSZ: 61 karakter', () => assert.ok(kapu({ cim: JO_CIM + 'xx' }).includes('CIM_HOSSZ')));
t('CIM_HOSSZ: 24 karakter', () => assert.ok(kapu({ cim: 'Find Meet Recordings Now' }).includes('CIM_HOSSZ')));
t('LEIRAS_HOSSZ: 119 és 159 karakter', () => {
  assert.ok(kapu({ leiras: 'x'.repeat(119) }).includes('LEIRAS_HOSSZ'));
  assert.ok(kapu({ leiras: 'x'.repeat(159) }).includes('LEIRAS_HOSSZ'));
});
t('AR: dollárár a leírásban', () => assert.ok(kapu({ leiras: JO_LEIRAS.slice(0, 120) + ' Plans start at $9.99 a month.' }).includes('AR')));
t('AR: kreditszám', () => assert.ok(kapu({ leiras: JO_LEIRAS.slice(0, 120) + ' A clip uses 10 credits.' }).includes('AR')));
t('OSSZEHASONLITAS: „Best” a címben', () => assert.ok(kapu({ cim: 'Best Way to Find Google Meet Recordings and Notes' }).includes('OSSZEHASONLITAS')));
t('OSSZEHASONLITAS: „vs”', () => assert.ok(kapu({ cim: 'Google Meet Recordings vs Transcripts: Where to Find' }).includes('OSSZEHASONLITAS')));
t('KATTINTASVADASZ: felkiáltójel', () => assert.ok(kapu({ cim: 'Find Your Google Meet Recordings and Notes Fast!' }).includes('KATTINTASVADASZ')));
t('KATTINTASVADASZ: CSUPA NAGY szó, de az AI/PDF rövidítés nem', () => {
  assert.ok(kapu({ cim: 'Find Google Meet Recordings and Notes, FREE' }).includes('KATTINTASVADASZ'));
  assert.ok(!kodok(seoKapuk({ cim: 'Find Google Meet Recordings and AI Notes as PDF', leiras: JO_LEIRAS, cikkMd: MD + ' notes ai pdf' })).includes('KATTINTASVADASZ'));
});
t('SABLON: „with our guide”', () => assert.ok(kapu({ leiras: JO_LEIRAS.slice(0, 125) + ' Learn more with our guide.' }).includes('SABLON')));
t('IGERET_ESZKOZ: a cikkben nem szereplő ismert eszköz (Canva)', () => assert.ok(kapu({ cim: 'Find Google Meet Recordings and Share Them on Canva' }).includes('IGERET_ESZKOZ')));
t('IGERET_SZAVAK: a cikk nem adja meg, amit a cím ígér', () => assert.ok(kapu({ cim: 'Export Recordings Automatically Every Single Week' }).includes('IGERET_SZAVAK')));
t('ígéret: előtag-illesztés NEM számít („record” ≠ „recording”)', () => {
  assert.ok(kodok(igeretKapuk('Recording Your Calls', 'You can record your calls here.')).includes('IGERET_SZAVAK'));
});
t('VALTOZATLAN: ugyanaz, mint a régi', () => assert.ok(kapu({ regiCim: JO_CIM, regiLeiras: JO_LEIRAS }).includes('VALTOZATLAN')));
t('minden hiba „KÓD: magyarázat” alakú (az AI újrapróbán ezt kapja)', () => {
  for (const h of seoKapuk({ cim: 'x', leiras: 'y', cikkMd: MD })) assert.match(h, /^[A-Z_]+: \S/);
});

const v2 = { seo: { v: 2, eles: true, seo_title: JO_CIM, meta_description: JO_LEIRAS } };
t('keresoFej: kapcsoló KI → null', () => assert.equal(keresoFej(v2, { lang: 'en', cikkMd: MD, be: false }), null));
t('keresoFej: hu/es lap → null', () => {
  assert.equal(keresoFej(v2, { lang: 'hu', cikkMd: MD, be: true }), null);
  assert.equal(keresoFej(v2, { lang: 'es', cikkMd: MD, be: true }), null);
});
t('keresoFej: v1 / eles:false / megtartva → null', () => {
  assert.equal(keresoFej({ seo: { ...v2.seo, v: 1 } }, { lang: 'en', cikkMd: MD, be: true }), null);
  assert.equal(keresoFej({ seo: { ...v2.seo, eles: false } }, { lang: 'en', cikkMd: MD, be: true }), null);
  assert.equal(keresoFej({ seo: { ...v2.seo, megtartva: true } }, { lang: 'en', cikkMd: MD, be: true }), null);
  assert.equal(keresoFej({}, { lang: 'en', cikkMd: MD, be: true }), null);
});
t('keresoFej: jó v2 → {cim, leiras}', () => {
  assert.deepEqual(keresoFej(v2, { lang: 'en', cikkMd: MD, be: true }), { cim: JO_CIM, leiras: JO_LEIRAS });
});
t('keresoFej: a cikk azóta megváltozott, a cím már nem fedezett → null', () => {
  const kanonos = { seo: { ...v2.seo, seo_title: 'Find Google Meet Recordings Saved in Google Drive' } };
  assert.ok(keresoFej(kanonos, { lang: 'en', cikkMd: MD, be: true }));
  const atirt = MD.replace(/Google Drive/g, 'the cloud').replace(/\bDrive\b/g, 'cloud');
  assert.equal(keresoFej(kanonos, { lang: 'en', cikkMd: atirt, be: true }), null);
});
t('withBrand: ha belefér, márkanév; ha nem, a cím magában', () => {
  assert.equal(withBrand('Short title'), 'Short title — AI World HQ');
  assert.equal(withBrand(JO_CIM), JO_CIM);
});
t('fejCimEsLeiras: nincs keresőcím → az eredeti', () => {
  assert.deepEqual(fejCimEsLeiras({ title: 'Cím — AI World HQ', description: 'leírás', kereso: null }), { titleTag: cimTag('Cím — AI World HQ'), metaDesc: 'leírás' });
});
t('fejCimEsLeiras: van keresőcím → az kerül a <title>-be és a leírásba', () => {
  assert.deepEqual(fejCimEsLeiras({ title: 'X', description: 'Y', kereso: { cim: JO_CIM, leiras: JO_LEIRAS } }), { titleTag: cimTag(withBrand(JO_CIM)), metaDesc: JO_LEIRAS });
});
t('SEO_ELES_BE = false (1. rész: a user a 10 minta után kapcsolja be)', () => assert.equal(SEO_ELES_BE, false));

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
