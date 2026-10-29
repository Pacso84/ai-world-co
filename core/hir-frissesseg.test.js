// 🕰️ Korhatár az RSS-bejegyzésekre (2026-10-29, Sony AI: júniusi összefoglaló októberben hírként). Ingyenes.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tulRegiTetel, tetelDatum, ALAP_MAX_NAP } from './hir-frissesseg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const MOST = Date.parse('2026-10-21T02:28:00Z');   // a Sony-cikk írásának pillanata

console.log('\n🧪 hir-frissesseg');

t('🎯 a valódi eset: a Sony júniusi összefoglalója októberben túl régi', () => {
  assert.equal(tulRegiTetel({ pubDate: 'Tue, 01 Jul 2026 09:00:00 GMT' }, { most: MOST }), true);
});

t('✅ friss bejegyzés átmegy; a határ a sitemap-forrásokéval egyező 21 nap', () => {
  assert.equal(ALAP_MAX_NAP, 21);
  assert.equal(tulRegiTetel({ isoDate: '2026-10-20T10:00:00Z' }, { most: MOST }), false);
  assert.equal(tulRegiTetel({ isoDate: '2026-10-01T03:00:00Z' }, { most: MOST }), false, '20 napos még friss');
  assert.equal(tulRegiTetel({ isoDate: '2026-09-28T00:00:00Z' }, { most: MOST }), true, '23 napos már régi');
});

t('🔧 a forrás saját max_age_days értéke felülírja az alapot', () => {
  const item = { isoDate: '2026-10-11T00:00:00Z' };   // 10 napos
  assert.equal(tulRegiTetel(item, { most: MOST, forras: { max_age_days: 7 } }), true);
  assert.equal(tulRegiTetel(item, { most: MOST, forras: { max_age_days: 0 } }), false, 'a 0 nem kapcsolja ki a hírt, az alap marad');
});

t('❔ dátum nélkül vagy értelmezhetetlen dátummal NEM dobunk el semmit', () => {
  assert.equal(tulRegiTetel({}, { most: MOST }), false);
  assert.equal(tulRegiTetel({ pubDate: 'not a date' }, { most: MOST }), false);
  assert.ok(Number.isNaN(tetelDatum(null)));
});

t('🔌 az rss-scraper a látott-ellenőrzés UTÁN, a kulcsszó-szűrő ELŐTT hívja, és látottnak jelöli', () => {
  const src = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8').replace(/\r\n/g, '\n')
    .replace(/^\s*\/\/.*$/gm, '');   // a kommentek ne tegyék zölddé (munkamodszer-tanulsagok)
  assert.match(src, /import \{ tulRegiTetel \} from '\.\.\/\.\.\/core\/hir-frissesseg\.js'/);
  const hivas = src.indexOf('tulRegiTetel(item, { forras: feedConfig })');
  assert.ok(hivas > 0, 'nincs bekötve');
  assert.ok(src.indexOf('seenLinks.has(item.link)') < hivas && hivas < src.indexOf('!keywordPrefilter(item)'), 'rossz helyen');
  assert.match(src.slice(hivas, hivas + 200), /seen\[feedConfig\.id\]\.push\(item\.link\)/, 'nem jelöli látottnak → minden nap újra előjönne');
});

if (hiba) { console.log(`\n❌ hir-frissesseg.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ hir-frissesseg.test: mind rendben');
