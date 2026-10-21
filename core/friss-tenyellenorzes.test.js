// Friss cikkek tényellenőrzése (2026-10-21, user: „a tény-ellenőr a friss cikkeket nézze át, ne a régieket”).
// Ingyenes, hálózat nélküli: a sorrend, a forrás-tisztítás és a javítás-őr.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ellenorzesiSor, forrasSzoveg, MIN_FORRAS, hirCsereEp, HIR_RENDSZER } from './friss-tenyellenorzes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAP = 86400e3;
const NOW = Date.parse('2026-10-21T08:00:00Z');
const c = (nev, meta) => ({ file: nev + '.json', data: { _meta: meta, article_markdown: '' } });
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 friss-tenyellenorzes');

t('🆕 a friss (≤7 napos) hír a régi útmutató ELŐTT jön, és a legújabb hír az elsők között', () => {
  const sor = ellenorzesiSor([
    c('regi-utmutato', { type: 'guide', published_at: new Date(NOW - 90 * NAP).toISOString() }),
    c('hir-regi', { published_at: new Date(NOW - 5 * NAP).toISOString() }),
    c('hir-uj', { published_at: new Date(NOW - 1 * NAP).toISOString() }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['hir-uj.json', 'hir-regi.json', 'regi-utmutato.json']);
});

t('⏭️ az átnézett friss cikk kimarad, a megjelölt (emberre váró) is', () => {
  const sor = ellenorzesiSor([
    c('mar-atnezve', { published_at: new Date(NOW - 1 * NAP).toISOString(), fact_verified_at: new Date(NOW).toISOString() }),
    c('megjelolt', { published_at: new Date(NOW - 1 * NAP).toISOString(), fact_check_flag: 'may-be-obsolete' }),
    c('uj', { published_at: new Date(NOW - 2 * NAP).toISOString() }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['uj.json']);
});

t('📚 a régi hírt NEM nézi (csak a 30 napnál régebbi útmutatókat), és a régi útmutató a legrégebben átnézettel kezdődik', () => {
  const sor = ellenorzesiSor([
    c('regi-hir', { published_at: new Date(NOW - 60 * NAP).toISOString() }),
    c('util-a', { type: 'guide', published_at: new Date(NOW - 60 * NAP).toISOString(), fact_verified_at: '2026-10-10T00:00:00Z' }),
    c('util-b', { type: 'guide', published_at: new Date(NOW - 60 * NAP).toISOString(), fact_verified_at: '2026-09-01T00:00:00Z' }),
  ], NOW);
  assert.deepEqual(sor.map(x => x.file), ['util-b.json', 'util-a.json']);
});

t('🧹 a forrás-tisztítás eldobja a szkriptet és a stílust, és a szöveget megtartja', () => {
  const html = '<html><script>var x="ne";</script><style>p{}</style><main><h1>Gemini &amp; Docs</h1><p>Az új ár 20 dollár.</p></main></html>';
  const sz = forrasSzoveg(html);
  assert.equal(sz.includes('var x'), false);
  assert.equal(sz.includes('p{}'), false);
  assert.match(sz, /Gemini & Docs Az új ár 20 dollár\./);
});

t('🚫 túl rövid (JS-only / hibaoldal) forrásból nem ítélünk', () => {
  assert.ok(forrasSzoveg('<html><body>Enable JavaScript</body></html>').length < MIN_FORRAS);
});

t('🔒 a hír-javítás csak kicsi, célzott csere lehet: a nagy átírás és a fejezetszám-változás kiesik', () => {
  const eredeti = '---\ntitle: "A"\n---\n\n# A\n\n## Egy\n\n' + 'szó '.repeat(200) + '\n\n## Kettő\n\n' + 'szó '.repeat(200);
  const kicsi = eredeti.replace('szó szó szó', 'új szó szó szó');
  assert.equal(hirCsereEp(kicsi, eredeti), null, 'kis javítás elfogadva');
  assert.match(hirCsereEp('---\ntitle: "A"\n---\n\n# A\n\nrövid', eredeti), /túl nagy/);
  assert.match(hirCsereEp(eredeti.replace('## Kettő', 'Kettő'), eredeti), /fejezetek száma/);
  assert.match(hirCsereEp('nincs frontmatter', eredeti), /frontmatter/);
});

t('📜 a hír-prompt a FORRÁST tekinti hatóságnak, nem a modell emlékezetét (új funkciót nem tilthat le)', () => {
  assert.match(HIR_RENDSZER, /The source text is the ONLY authority/);
  assert.match(HIR_RENDSZER, /never call something false just because you have not heard of it/);
});

t('🔌 a tény-ellenőrző a friss sorrendet és a hír-ágat használja; a CI 4 cikket néz futásonként', () => {
  const src = readFileSync(join(ROOT, 'agents', 'fact-check', 'agent.js'), 'utf-8');
  assert.match(src, /if \(auto\) list = ellenorzesiSor\(list\);/);
  assert.match(src, /const hir = guide\.data\._meta\?\.type !== 'guide';/);
  assert.match(src, /fact_verified_at: new Date\(\)\.toISOString\(\)/);
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  assert.match(yml, /node agents\/fact-check\/agent\.js --limit 4/);
});

if (hiba) { console.log(`\n❌ friss-tenyellenorzes.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ friss-tenyellenorzes.test: mind rendben');
