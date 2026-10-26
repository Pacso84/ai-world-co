// core/elakadas-html.test.js — a „Ha elakadsz” doboz megjelenítése (2026-10-26, 2b bekötés, 3. lépés).
// Ingyenes, hálózat nélküli. Tiszta függvények + a build forrásának bekötés-vizsgálata.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { elakadasBetolt, elakadasHtml } from './elakadas-html.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8').replace(/\r\n/g, '\n');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const U1 = 'https://help.openai.com/en/articles/111-a';
const U2 = 'https://support.claude.com/en/articles/222-b';
const felirat = { cim: '🔧 If you get stuck', miert: 'Why:', mitTegyel: 'What to do:', forras: 'Source:' };
const tetel = (n, u) => ({ symptom: `Tünet ${n}`, why: `ok ${n}`, fix: `megoldás ${n}`, source: u });
const fajl = (extra = {}) => ({
  slug: 'x', probalva: '2026-10-26T00:00:00Z',
  doboz: { keszult: '2026-10-26T00:00:00Z', enHash: 'h', forrasok: { [U1]: 'Fix upload errors', [U2]: 'Claude limits' },
    en: [tetel(1, U1), tetel(2, U2)], hu: null, es: [tetel(3, U1), tetel(4, U2)], ...extra }
});

console.log('\n🧪 elakadas-html');

t('🔧 2 engedélyezett tétel → doboz: g-elakad, mindkét tünet, a nyelvi feliratok, forrás-link a súgócímmel', () => {
  const h = elakadasHtml(fajl(), 'en', felirat, true);
  assert.match(h, /^<section class="g-elakad">/);
  assert.match(h, /<h2 class="g-elakad__cim">🔧 If you get stuck<\/h2>/);
  assert.match(h, /<h3>Tünet 1<\/h3>/);
  assert.match(h, /<h3>Tünet 2<\/h3>/);
  assert.match(h, /<b>Why:<\/b> ok 1/);
  assert.match(h, /<b>What to do:<\/b> megoldás 2/);
  assert.ok(h.includes(`Source: <a href="${U1}" rel="noopener" target="_blank">Fix upload errors</a>`));
  // a spanyol a saját tételeit mutatja
  const es = elakadasHtml(fajl(), 'es', { ...felirat, cim: '🔧 Si te atascas' }, true);
  assert.match(es, /Si te atascas/); assert.match(es, /Tünet 3/); assert.doesNotMatch(es, /Tünet 1/);
});

t('🌐 hu: null (nincs még fordítás) → üres string; ismeretlen nyelv is üres', () => {
  assert.equal(elakadasHtml(fajl(), 'hu', felirat, true), '');
  assert.equal(elakadasHtml(fajl(), 'de', felirat, true), '');
});

t('🛡️ escape: <script> és idézőjel a tünetben, a súgócímben és a feliratban nem kerül ki nyersen', () => {
  const rossz = fajl({
    forrasok: { [U1]: '<script>alert(1)</script>"x"', [U2]: 'ok' },
    en: [{ symptom: '<script>alert(2)</script> "q"', why: '<img src=x onerror=1>', fix: 'a & b', source: U1 }, tetel(2, U2)]
  });
  const h = elakadasHtml(rossz, 'en', { ...felirat, cim: '<b>cím</b>"' }, true);
  assert.doesNotMatch(h, /<script/i);
  assert.doesNotMatch(h, /<img/i);
  assert.doesNotMatch(h, /<b>cím/);
  assert.match(h, /&lt;script&gt;alert\(2\)&lt;\/script&gt; &quot;q&quot;/);
  assert.match(h, /a &amp; b/);
});

t('🚫 nem engedélyezett forrású tétel kimarad; 1 marad → nincs doboz', () => {
  const f = fajl({ en: [tetel(1, 'https://example.com/x'), tetel(2, U2)] });
  assert.equal(elakadasHtml(f, 'en', felirat, true), '');
  // 3 tételből 1 kimarad → 2 marad → doboz, a kimaradt nincs benne
  const f3 = fajl({ en: [tetel(1, 'https://example.com/x'), tetel(2, U2), tetel(3, U1)] });
  const h = elakadasHtml(f3, 'en', felirat, true);
  assert.ok(h.includes('Tünet 2') && h.includes('Tünet 3') && !h.includes('Tünet 1'));
  // a javascript: séma sem megy át
  assert.equal(elakadasHtml(fajl({ en: [tetel(1, 'javascript:alert(1)'), tetel(2, U2)] }), 'en', felirat, true), '');
});

t('🧩 hiányos tétel (üres mező / nem objektum) kimarad', () => {
  const f = fajl({ en: [{ symptom: 'x', why: '', fix: 'y', source: U1 }, tetel(2, U2), null, 5] });
  assert.equal(elakadasHtml(f, 'en', felirat, true), '');
});

t('⛔ kill-switch ki (paraméterrel) → üres; nincs doboz / nincs fájl → üres', () => {
  assert.equal(elakadasHtml(fajl(), 'en', felirat, false), '');
  assert.equal(elakadasHtml({ slug: 'x', probalva: 'r', doboz: null }, 'en', felirat, true), '');
  assert.equal(elakadasHtml(null, 'en', felirat, true), '');
  assert.equal(elakadasHtml(fajl(), 'en', null, true), '');
});

t('📂 elakadasBetolt: jó fájl betölt; hiányzó és sérült JSON → null, soha nem dob', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'elakad-'));
  try {
    mkdirSync(join(tmp, 'content', 'elakadas'), { recursive: true });
    writeFileSync(join(tmp, 'content', 'elakadas', 'jo.json'), JSON.stringify(fajl()));
    writeFileSync(join(tmp, 'content', 'elakadas', 'serult.json'), '{ nem json');
    writeFileSync(join(tmp, 'content', 'elakadas', 'tomb.json'), '[]');
    assert.equal(elakadasBetolt(tmp, 'jo').slug, 'x');
    assert.equal(elakadasBetolt(tmp, 'nincs-ilyen'), null);
    assert.equal(elakadasBetolt(tmp, 'serult'), null);
    assert.equal(elakadasBetolt(tmp, 'tomb'), null);
    assert.equal(elakadasBetolt(tmp, ''), null);
    assert.equal(elakadasBetolt(tmp, '../x'), null);
    assert.equal(elakadasBetolt('/nincs/ilyen/mappa', 'jo'), null);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

t('🔌 bekötés a buildben: az elakadasHtml( hívás a g-steps és a g-tovabb között áll, csak a buildGuidePage-ben', () => {
  const b = olvas('website/build.js');
  const hivasok = [...b.matchAll(/elakadasHtml\(/g)].map(m => m.index);
  assert.equal(hivasok.length, 1, 'pontosan egy hívás kell: ' + hivasok.length);
  const steps = b.indexOf('<div class="g-steps">');
  const tov = b.indexOf('<nav class="g-tovabb">');
  assert.ok(steps > 0 && tov > steps, 'g-steps / g-tovabb nem található');
  assert.ok(hivasok[0] > steps && hivasok[0] < tov, 'a hívás nem a g-steps és a g-tovabb között van');
  const fgv = b.lastIndexOf('function buildGuidePage');
  assert.ok(fgv > 0 && fgv < hivasok[0], 'a hívás nem a buildGuidePage-ben van');
  assert.ok(!/\nfunction \w+\(/.test(b.slice(fgv + 10, hivasok[0])), 'a hívás előtt másik függvény kezdődik: nem a buildGuidePage-ben van');
  // betöltés a cikk-objektumba (az útmutató slug-jával), a gyökérből
  assert.match(b, /elakadas:\s*elakadasBetolt\(PROJECT_ROOT,\s*slug\)/, 'a cikk-objektum nem tölti be a dobozt');
  assert.match(b, /import \{[^}]*elakadasBetolt[^}]*elakadasHtml[^}]*\} from '\.\.\/core\/elakadas-html\.js'/);
});

t('🌍 a 3 nyelvi tábla mindegyikében megvan a 4 felirat, a CSS pedig g- előtagú', () => {
  const b = olvas('website/build.js');
  for (const k of ['elakCim', 'elakMiert', 'elakMit', 'elakForras'])
    assert.equal([...b.matchAll(new RegExp(`\\b${k}:`, 'g'))].length, 3, k + ' nem 3 nyelven szerepel');
  assert.match(b, /elakCim: '🔧 If you get stuck'/);
  assert.match(b, /elakCim: '🔧 Ha elakadsz'/);
  assert.match(b, /elakCim: '🔧 Si te atascas'/);
  const css = olvas('website/assets/style.css');
  const osztalyok = [...css.matchAll(/\.(g-elakad[\w-]*)/g)].map(m => m[1]);
  assert.ok(osztalyok.length >= 4, 'hiányzik a CSS');
  assert.ok(osztalyok.every(o => o.startsWith('g-')));
  assert.match(css, /@media \(max-width: 560px\)[^}]*\.g-elakad/s, 'nincs mobil szabály');
});

if (hiba) { console.log(`\n❌ elakadas-html.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ elakadas-html.test: mind rendben');
