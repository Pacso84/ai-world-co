// core/preferred-source.js — Google „Kedvenc forrás" gomb (2026-10-10). Hálózat nélkül.
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
  assert.equal(kedvencForrasHtml('nem url', 'en'), '', 'érvénytelen címnél nincs törött gomb');
});

t('mindhárom nyelven van szöveg; új lapon nyílik; nincs Google-logó, nincs lájk/megosztás-kérés', () => {
  for (const lang of ['en', 'hu', 'es']) {
    const h = kedvencForrasHtml('https://aiworldhq.com', lang);
    assert.ok(h.includes(SZOVEG[lang].gomb), lang);
    assert.match(h, /target="_blank" rel="noopener"/);
    assert.doesNotMatch(h, /<img|<svg/i);
    assert.doesNotMatch(h, /\b(like|share|lájk|megoszt|comparte)\b/i);
  }
});

t('🔌 mindkét cikk-sablonban (hír + útmutató) ott van a 👍/👎 után, pontosan egyszer-egyszer', () => {
  const b = readFileSync(new URL('../website/build.js', import.meta.url), 'utf-8');
  assert.match(b, /from '\.\.\/core\/preferred-source\.js'/);
  assert.equal((b.match(/👎<\/button><\/div>\r?\n\s*\$\{kedvencForrasHtml\(SITE\.url, LANG\)\}/g) || []).length, 2);
  assert.match(readFileSync(new URL('../website/assets/style.css', import.meta.url), 'utf-8'), /\.pref-src \{/);
});

if (hiba) { console.log(`\n❌ preferred-source.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ preferred-source.test: mind rendben');
