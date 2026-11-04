// core/daily-summary-video.js — napi „Today in AI" összefoglaló (2026-10-10). Hálózat és ffmpeg nélkül.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { napiHirek, rovid, elsoMondat, napiPrompt, osszesitoSzakaszok, idosavok, kartyaCim, HIR_MIN, KLIP_MP } from './daily-summary-video.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 daily-summary-video');

const MOST = Date.parse('2026-10-10T18:00:00Z');
const h = (title, ora, extra = {}) => ({ utmutato: false, title, subtitle: 'A short plain-English subtitle about it', published_at: new Date(MOST - ora * 3600e3).toISOString(), ...extra });

t('csak FRISS, kiadott HÍR, a legfrissebb elöl, legfeljebb 3', () => {
  const cikkek = [h('Régi', 40), h('A', 2), h('B', 1), h('C', 5), h('D', 6), h('Útmutató', 1, { utmutato: true }), h('Jövő', -2)];
  assert.deepEqual(napiHirek(cikkek, MOST).map(x => x.title), ['B', 'A', 'C']);
});

t(`ha ${HIR_MIN}-nél kevesebb friss hír van → nincs videó (null)`, () => {
  assert.equal(napiHirek([h('A', 1)], MOST), null);
  assert.equal(napiHirek([], MOST), null);
});

t('szakaszok: nyitó + hírek + záró, a kimondott szöveg a saját cikkeinkből', () => {
  const sz = osszesitoSzakaszok([h('OpenAI adds a new voice mode to ChatGPT', 1), h('Gemini can now plan trips', 2)]);
  assert.equal(sz.length, 4);
  assert.match(sz[0].mond, /two things/);
  assert.match(sz[1].mond, /^One\. OpenAI adds a new voice mode to ChatGPT\./);
  assert.match(sz[3].mond, /aiworldhq dot com/);
  assert.ok(sz.every(s => !('prompt' in s)), 'egyik szakasz sem kér saját klipet');
});

t('🔴 EGY összefoglaló = EGY MI-animáció naponta (user, 10-10: „nem három külön klipet")', () => {
  const src = readFileSync(new URL('./daily-summary-video.js', import.meta.url), 'utf-8');
  assert.equal((src.match(/await klipFn\(/g) || []).length, 1, 'a renderelés egynél több MI-klipet kér');
  assert.ok(KLIP_MP <= 10 && KLIP_MP >= 6);
});

t('🔴 a hang soha nem szakad félmondatnál: csak az alcím első, rövid mondata, vagy semmi', () => {
  assert.equal(elsoMondat('AWS shipped broader model choice this month. Here is why that matters for you.'), 'AWS shipped broader model choice this month');
  assert.equal(elsoMondat('An explainer on the new text-to-video model in Picsart AI Playground, what you feed it, and what comes out.'), '', 'túl hosszú → kimarad');
  const sz = osszesitoSzakaszok([h('A', 1, { subtitle: 'Short first. And a second one.' }), h('B', 2)]);
  assert.match(sz[1].mond, /^One\. A\. Short first\.$/);
  assert.doesNotMatch(sz.map(s => s.mond).join(' '), /…/);
});

t('🔴 a kártya-cím nem vágódik le (10-10 bemutató): kettőspontnál kettéválik, legfeljebb 7 nagy szó', () => {
  assert.deepEqual(kartyaCim("Picsart's HeyGen Video: How Three Inputs Become a Short Clip With Sound"),
    { nagy: "Picsart's HeyGen Video", kicsi: 'How Three Inputs Become a Short Clip With Sound' });
  assert.match(kartyaCim('Big News: one two three four five six seven eight nine ten').kicsi, /…$/, '9 szó fölött jelzett vágás');
  assert.equal(kartyaCim('When AI Agents Become Your Customers: What Businesses Need to Know').nagy, 'When AI Agents Become Your Customers');
  assert.ok(kartyaCim('One two three four five six seven eight nine ten').nagy.split(' ').length <= 7);
  const sz = osszesitoSzakaszok([h('Big News: Small details here', 1), h('B', 2)]);
  assert.match(sz[1].mond, /Big News: Small details here/, 'a hang a TELJES címet mondja');
});

t('kártyák idősávjai egymás után, rés és átfedés nélkül', () => {
  assert.deepEqual(idosavok([2, 3.5, 1]), [{ tol: 0, ig: 2 }, { tol: 2, ig: 5.5 }, { tol: 5.5, ig: 6.5 }]);
});

t('🚫 az animáció-prompt tilt feliratot, logót, valódi embert', () => {
  assert.match(napiPrompt(), /No text, no letters, no logos, no real people\./);
});

t('rovid(): szóhatáron vág, jelzi a vágást', () => {
  assert.equal(rovid('one two three four', 2), 'one two…');
  assert.equal(rovid('one two', 5), 'one two');
});

if (hiba) { console.log(`\n❌ daily-summary-video.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ daily-summary-video.test: mind rendben');
