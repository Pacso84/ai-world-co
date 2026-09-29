// TESZT — lépés-vázlat (core/guide-sketch.js) és „Következő útmutató" (core/next-guide.js).
// Ingyenes, hálózat nélkül; a valódi útmutatókon is végigmegy (csak olvas).
import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { vazlatAdat, vazlatSvg, vazlatHtml, FELIRAT } from './guide-sketch.js';
import { kovetkezoUtmutato } from './next-guide.js';
import { lepesReszek } from './guide-step-parts.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Lépés-vázlat + következő útmutató\n');

t('🔑 gomb: a félkövér név egy művelet-ige után, a helye a mondatból', () => {
  assert.deepEqual(vazlatAdat('Tap the **New chat** button at the top-right of the screen.', 'en'),
    { tipus: 'koppint', gomb: 'New chat', x: 'jobb', y: 'fent' });
  assert.deepEqual(vazlatAdat('Koppints a **Küldés** gombra jobb oldalt lent.', 'hu'),
    { tipus: 'koppint', gomb: 'Küldés', x: 'jobb', y: 'lent' });
  assert.deepEqual(vazlatAdat('Toca **Nuevo chat** arriba a la izquierda.', 'es'),
    { tipus: 'koppint', gomb: 'Nuevo chat', x: 'bal', y: 'fent' });
});

t('🔑 félkövér IGE NÉLKÜL nem gomb (kiemelés, nem felület)', () => {
  assert.equal(vazlatAdat('This is **really important** for your privacy.', 'en'), null);
});

t('beírandó minta csak beírós lépésnél és mondatnyi szövegnél', () => {
  const r = vazlatAdat('Type your question into the box.\n\n💬 Example: "What should I pack for a rainy weekend in Seattle?"', 'en');
  assert.equal(r.tipus, 'ir');
  assert.match(r.szoveg, /^What should I pack/);
  assert.equal(vazlatAdat('Open the menu.\n\n💬 Example: "New chat"', 'en'), null, 'gombnév nem beírandó szöveg');
  assert.equal(vazlatAdat('Ask it to redraw.\n\n💬 Example: "You notice the tree looks more like an oak."', 'en'), null, 'leírás nem beírandó');
});

t('🔑 a vázlat felirata kimondja, hogy illusztráció (3 nyelven), és a szöveg escape-elt', () => {
  const h = vazlatHtml('Tap **<b>Go</b>** now.', 'en', 'ChatGPT');
  assert.match(h, new RegExp(FELIRAT.en));
  assert.ok(!h.includes('<b>Go'), 'nyers HTML került az SVG-be');
  assert.match(vazlatHtml('Koppints a **Küldés** gombra.', 'hu'), /Vázlat — a te képernyőd/);
  assert.match(vazlatHtml('Toca **Enviar** ahora.', 'es'), /Boceto/);
  assert.match(vazlatSvg({ tipus: 'koppint', gomb: 'Go', x: 'kozep', y: 'kozep' }), /role="img" aria-label="Sketch: tap/);
  assert.equal(vazlatHtml('Nothing to draw here.', 'en'), '');
});

t('🔑 valódi útmutatókon: a lépések ≥35%-a kap vázlatot, és egyik gombnév sem üres/túl hosszú', () => {
  const AD = join(ROOT, 'content', 'articles');
  const STEP = /^##\s*(?:(?:step|paso)\s*\d*|\d+\s*\.?\s*l[ée]p[ée]s)/im;
  let ossz = 0, van = 0, rossz = 0;
  for (const f of readdirSync(AD).filter(x => x.includes('_GUIDE_'))) {
    const md = JSON.parse(readFileSync(join(AD, f), 'utf-8')).article_markdown || '';
    for (const l of md.split(/\n(?=##\s)/).filter(s => STEP.test(s))) {
      ossz++;
      const r = vazlatAdat(lepesReszek(l.split('\n').slice(1).join('\n'), 'en').fo, 'en');
      if (r) van++;
      if (r && r.tipus === 'koppint' && (r.gomb.length < 2 || r.gomb.length > 28)) rossz++;
    }
  }
  assert.ok(ossz > 1000, 'gyanúsan kevés lépés: ' + ossz);
  assert.ok(van / ossz >= 0.35, `lefedettség ${Math.round(van / ossz * 100)}%`);
  assert.equal(rossz, 0);
});

const G = (slug, tool, extra = {}) => ({ slug, tool, isGuide: true, publishedAt: '2026-09-01', ...extra });
t('🔑 következő útmutató: ugyanaz az eszköz, a beékelt két ajánló és maga a cikk kimarad', () => {
  const a = G('a', 'ChatGPT');
  const rel = [G('m1', 'ChatGPT'), G('m2', 'ChatGPT'), G('x', 'Gemini'), G('y', 'ChatGPT')];
  assert.equal(kovetkezoUtmutato(a, rel, rel).slug, 'y');
});

t('ha a rangsorban nincs azonos eszköz → a legfrissebb azonos eszközös; ha az sincs → a rangsor első útmutatója', () => {
  const a = G('a', 'Claude');
  const rel = [G('m1', 'Gemini'), G('m2', 'Gemini'), G('x', 'Gemini')];
  const osszes = [...rel, G('c1', 'Claude', { publishedAt: '2026-08-01' }), G('c2', 'Claude', { publishedAt: '2026-09-20' })];
  assert.equal(kovetkezoUtmutato(a, rel, osszes).slug, 'c2');
  assert.equal(kovetkezoUtmutato(G('b', 'Qwen'), rel, rel).slug, 'x');
  assert.equal(kovetkezoUtmutato(G('b', ''), [G('m1', ''), G('m2', ''), { slug: 'n', isGuide: false }], []), null, 'hírt nem ajánl');
});

t('🔑 a honlap TÉNYLEG használja, és mindkettő KIKAPCSOLHATÓ a config.json-ból', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ vazlatHtml \} from '\.\.\/core\/guide-sketch\.js';/);
  assert.match(b, /import \{ kovetkezoUtmutato \} from '\.\.\/core\/next-guide\.js';/);
  assert.match(b, /KAPCSOLO\.vazlat && vazlatHtml\(reszek\.fo, LANG, a\.tool\)/);
  assert.match(b, /KAPCSOLO\.kovetkezo \? nextGuideHtml\(a\) : ''/);
  assert.match(b, /guide_sketch !== false/);
  assert.match(b, /next_guide !== false/);
  assert.equal((b.match(/nextGuide: '/g) || []).length, 3, 'a „Következő útmutató" felirat nem mind a 3 nyelven van meg');
  const c = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  assert.equal(typeof c.website?.guide_sketch, 'boolean');
  assert.equal(typeof c.website?.next_guide, 'boolean');
  const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
  assert.match(css, /\.g-sk__gomb/);
  assert.match(css, /\.g-nextg/);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
