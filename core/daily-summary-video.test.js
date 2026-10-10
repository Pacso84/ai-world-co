// core/daily-summary-video.js — napi „Today in AI" összefoglaló (2026-10-10). Hálózat és ffmpeg nélkül.
import assert from 'node:assert/strict';
import { napiHirek, rovid, elsoMondat, klipPrompt, osszesitoSzakaszok, HIR_MIN } from './daily-summary-video.js';

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

t('szakaszok: nyitó + hírek + záró; csak a záró lehet klip nélkül', () => {
  const sz = osszesitoSzakaszok([h('OpenAI adds a new voice mode to ChatGPT', 1), h('Gemini can now plan trips', 2)]);
  assert.equal(sz.length, 4);
  assert.ok(sz.slice(0, 3).every(s => s.prompt), 'nyitó és hírek: MI-klip');
  assert.equal(sz[3].prompt, null);
  assert.match(sz[0].mond, /two things/);
  assert.match(sz[1].mond, /^One\. OpenAI adds a new voice mode to ChatGPT\./);
  assert.match(sz[3].mond, /aiworldhq dot com/);
});

t('🚫 a klip-prompt tilt feliratot, logót, valódi embert; nem mondja ki a cikk állításait hosszan', () => {
  const p = klipPrompt('OpenAI adds a new "voice" mode to ChatGPT for millions of users worldwide starting today in every country');
  assert.match(p, /No text, no letters, no logos, no real people\./);
  assert.doesNotMatch(p, /"/);
  assert.ok(p.split(':')[1].split('.')[0].trim().split(' ').length <= 15, 'a téma legfeljebb ~14 szó');
});

t('🔴 a hang soha nem szakad félmondatnál: csak az alcím első, rövid mondata, vagy semmi', () => {
  assert.equal(elsoMondat('AWS shipped broader model choice this month. Here is why that matters for you.'), 'AWS shipped broader model choice this month');
  assert.equal(elsoMondat('An explainer on the new text-to-video model in Picsart AI Playground, what you feed it, and what comes out.'), '', 'túl hosszú → kimarad');
  const sz = osszesitoSzakaszok([h('A', 1, { subtitle: 'Short first. And a second one.' }), h('B', 2)]);
  assert.match(sz[1].mond, /^One\. A\. Short first\.$/);
  assert.doesNotMatch(sz.map(s => s.mond).join(' '), /…/);
});

t('rovid(): szóhatáron vág, jelzi a vágást', () => {
  assert.equal(rovid('one two three four', 2), 'one two…');
  assert.equal(rovid('one two', 5), 'one two');
});

if (hiba) { console.log(`\n❌ daily-summary-video.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ daily-summary-video.test: mind rendben');
