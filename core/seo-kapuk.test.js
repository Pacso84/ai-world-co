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
  seoKapuk, igeretKapuk, keresoFej, fejCimEsLeiras, withBrand, SITE_NAME
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
  assert.equal(withBrand('Short title'), 'Short title — AI WORLD HQ');
  assert.equal(withBrand(JO_CIM), JO_CIM);
});
t('fejCimEsLeiras: nincs keresőcím → az eredeti', () => {
  assert.deepEqual(fejCimEsLeiras({ title: 'Cím — AI World HQ', description: 'leírás', kereso: null }), { titleTag: cimTag('Cím — AI World HQ'), metaDesc: 'leírás' });
});
t('fejCimEsLeiras: van keresőcím → az kerül a <title>-be és a leírásba', () => {
  assert.deepEqual(fejCimEsLeiras({ title: 'X', description: 'Y', kereso: { cim: JO_CIM, leiras: JO_LEIRAS } }), { titleTag: cimTag(withBrand(JO_CIM)), metaDesc: JO_LEIRAS });
});
// ── MÁRKANÉV-KAPU (11-26, user: „úgy döntsél, minél több olvasót vonzzon”) — a 11-26-i mintában a
// „Try Free AI Demos in Your Browser with Hugging Face Spaces” → „How to Run AI Demos in Your Web Browser”
// lett: kiesett a „Hugging Face”, pedig az emberek az eszköz nevére keresnek.
t('MARKANEV: a régi címben lévő eszköznév kimarad az újból → hiba', () => {
  const h = kodok(seoKapuk({ cim: 'How to Run AI Demos in Your Web Browser', leiras: JO_LEIRAS, regiCim: 'Try Free AI Demos in Your Browser with Hugging Face Spaces' }));
  assert.ok(h.includes('MARKANEV'), JSON.stringify(h));
});
t('MARKANEV: megmaradt név → nincs hiba; a hosszabb név („GitHub Copilot”) a rövidebbet („Copilot”) is fedi', () => {
  assert.ok(!kodok(seoKapuk({ cim: 'Run Free AI Demos in Your Browser with Hugging Face', leiras: JO_LEIRAS, regiCim: 'Try Free AI Demos in Your Browser with Hugging Face Spaces' })).includes('MARKANEV'));
  assert.ok(!kodok(seoKapuk({ cim: 'GPT-6.2 Astra and Sol Now in GitHub Copilot', leiras: JO_LEIRAS, regiCim: 'GPT-6.2 Astra and Sol Come to GitHub Copilot: What They Do' })).includes('MARKANEV'));
  assert.ok(!kodok(seoKapuk({ cim: JO_CIM, leiras: JO_LEIRAS, regiCim: 'How to Find Your Google Meet Recordings' })).includes('MARKANEV'));
});
t('MARKANEV: a hiba megnevezi a kimaradt nevet (az AI ebből javít)', () => {
  const h = seoKapuk({ cim: 'Plan a Family Dinner Week and Shopping List', leiras: JO_LEIRAS, regiCim: 'Plan a Week of Family Dinners with Qwen' });
  assert.ok(h.some(x => x.startsWith('MARKANEV') && x.includes('Qwen')), JSON.stringify(h));
});
t('SEO_ELES_BE = true (2. rész, user 11-26: „rádbízom!” a 10 minta után)', () => assert.equal(SEO_ELES_BE, true));

// ── A build-bekötés forrás-szintű őre (a build.js-t helyben futtatni TILOS → a forrását nézzük) ──
const BUILD = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
t('build: a halott `_meta?.seo?.description` olvasás KIKERÜLT (ezen veszett el július óta minden leírás)', () => {
  assert.ok(!/_meta\?\.seo\?\.description/.test(BUILD));
});
t('build: a pageShell a fejCimEsLeiras-t hívja, a <title> és a meta-leírás abból jön', () => {
  assert.match(BUILD, /fejCimEsLeiras\(\{\s*title,\s*description,\s*kereso\s*\}\)/);
  assert.match(BUILD, /<title>\$\{escapeHtml\(titleTag\)\}<\/title>/);
  assert.match(BUILD, /<meta name="description" content="\$\{escapeHtml\(metaDesc\)\}">/);
});
t('build: az og:title / twitter:title NEM a keresőcím (a Facebook-előnézet változatlan)', () => {
  assert.match(BUILD, /<meta property="og:title" content="\$\{escapeHtml\(title\)\}">/);
  assert.match(BUILD, /<meta name="twitter:title" content="\$\{escapeHtml\(title\)\}">/);
  assert.match(BUILD, /<meta property="og:description" content="\$\{escapeHtml\(description\)\}">/);
});
t('build: a betöltő angolul keresoFej-et számol, a lokalizáló hu/es-re null-t ad', () => {
  assert.match(BUILD, /kereso: keresoFej\(data\._meta, \{ lang: 'en', cikkMd: body \}\)/);
  const lok = BUILD.slice(BUILD.indexOf('function localizeArticle'), BUILD.indexOf('function localizeArticle') + 900);
  assert.match(lok, /kereso: null/);
});
t('build: mindkét cikk-sablon átadja a keresőcímet a pageShell-nek', () => {
  assert.equal((BUILD.match(/kereso: a\.kereso/g) || []).length, 2);
});
t('build: SITE.name = SITE_NAME (a márkanév egy igazság)', () => {
  assert.match(BUILD, new RegExp("name: '" + SITE_NAME + "'"));
});
t('build: a withBrand a core-ból jön (egy igazság a buildben és az őrben)', () => {
  assert.match(BUILD, /import \{[^}]*withBrand[^}]*\} from '\.\.\/core\/seo-kapuk\.js'/);
  assert.ok(!/^function withBrand\(/m.test(BUILD));
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
