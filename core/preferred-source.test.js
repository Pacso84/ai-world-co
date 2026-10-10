// core/preferred-source.js — Google „Kedvenc forrás" kártya (2026-10-10). Hálózat nélkül.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { kedvencUrl, kedvencForrasHtml, SZOVEG } from './preferred-source.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 preferred-source');

t('a hivatalos mélylink-formátum, csak a domainnel (www és útvonal nélkül)', () => {
  assert.equal(kedvencUrl('https://aiworldhq.com'), 'https://www.google.com/preferences/source?q=aiworldhq.com');
  assert.equal(kedvencUrl('https://www.aiworldhq.com/es/'), 'https://www.google.com/preferences/source?q=aiworldhq.com');
  assert.equal(kedvencUrl('nem url'), '');
  assert.equal(kedvencForrasHtml('nem url', 'en'), '', 'érvénytelen címnél nincs törött kártya');
});

t('mindhárom nyelven cím + magyarázat + gomb; az egész kártya EGY link, új lapon', () => {
  for (const lang of ['en', 'hu', 'es']) {
    const h = kedvencForrasHtml('https://aiworldhq.com', lang);
    for (const k of ['cim', 'alcim', 'gomb']) assert.ok(h.includes(SZOVEG[lang][k].replace(/’/g, '’')), `${lang}.${k}`);
    assert.match(h, /^<a class="pref-src" href="https:\/\/www\.google\.com\/preferences\/source\?q=aiworldhq\.com" target="_blank" rel="noopener">/);
    assert.equal((h.match(/<a /g) || []).length, 1, 'egyetlen link (nincs link a linkben)');
  }
});

t('🚫 nincs Google-logó / kép, nincs lájk- vagy megosztás-kérés; a csillag dekoráció (aria-hidden)', () => {
  const h = kedvencForrasHtml('https://aiworldhq.com', 'en');
  assert.doesNotMatch(h, /<img|google\.com\/images|gstatic|logo/i);
  assert.match(h, /<svg[^>]*aria-hidden="true"/);
  for (const lang of ['en', 'hu', 'es']) assert.doesNotMatch(Object.values(SZOVEG[lang]).join(' '), /\b(like|share|lájk|megoszt|comparte)\w*/i, lang);
});

t('🔌 mindkét cikk-sablon ELEJÉN (az AI-jelölés után), egyszer-egyszer; a cikk alján már nincs', () => {
  const b = readFileSync(new URL('../website/build.js', import.meta.url), 'utf-8');
  assert.match(b, /from '\.\.\/core\/preferred-source\.js'/);
  assert.equal((b.match(/\$\{kedvencForrasHtml\(SITE\.url, LANG\)\}/g) || []).length, 2);
  assert.match(b, /aiLabelHtml\('aiLabelNews'\)\}\r?\n\s*\$\{kedvencForrasHtml\(SITE\.url, LANG\)\}/, 'hír-sablon: az AI-jelölés után');
  assert.match(b, /partnerJelzes\(PARTNER, a, LANG\)\}\r?\n\s*\$\{kedvencForrasHtml\(SITE\.url, LANG\)\}/, 'útmutató-sablon: a fejben');
  assert.doesNotMatch(b, /👎<\/button><\/div>\r?\n\s*\$\{kedvencForrasHtml/, 'a régi, alsó gomb visszakerült');
  const css = readFileSync(new URL('../website/assets/style.css', import.meta.url), 'utf-8');
  assert.match(css, /\.pref-src \{/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.pref-src/, 'a mozgás kikapcsolható legyen');
});

if (hiba) { console.log(`\n❌ preferred-source.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ preferred-source.test: mind rendben');
