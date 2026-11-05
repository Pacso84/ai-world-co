// core/torzs-h1.js — a cikk-törzsben nincs H1 (Bing: „Az oldalon több <h1> van”, 2026-11-05).
// Ingyenes, hálózat nélküli; a VALÓDI cikkeken (en/hu/es) is lefut.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { torzsH1 } from './torzs-h1.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 torzs-h1 (egy H1 a cikkoldalon)');

t('az elején álló H1 kimarad (a régi stripLeadH1 viselkedése)', () => {
  assert.equal(torzsH1('<h1>Cím</h1>\n<p>Szöveg</p>', 'Cím'), '<p>Szöveg</p>');
});

t('az „In short” idézet UTÁNI, címmel azonos H1 kimarad (a Stable Diffusion-eset)', () => {
  const md = '> **In short:** rövid.\n\n# How to Run Stable Diffusion Locally\n\n## Step 1 — Go\n\nText';
  const html = torzsH1(marked.parse(md), 'How to Run Stable Diffusion Locally');
  assert.doesNotMatch(html, /<h1/);
  assert.match(html, /In short/);
  assert.match(html, /<h2[^>]*>Step 1/);
});

t('írásjel/kisbetű eltérés a címhez képest is azonosnak számít', () => {
  const html = torzsH1('<p>x</p><h1>How to Spot AI‑Generated Content (and Use It)</h1>', 'How to spot AI-generated content — and use it');
  assert.doesNotMatch(html, /<h1|Spot/i);
});

t('az első H2 utáni, címtől ELTÉRŐ H1 nem vész el, hanem H2 lesz', () => {
  const html = torzsH1('<p>x</p><h2>1. lépés</h2><p>z</p><h1 id="a">Egészen más rész</h1><p>y</p>', 'Cím');
  assert.match(html, /<h2 id="a">Egészen más rész<\/h2>/);
  assert.doesNotMatch(html, /<h1/);
});

t('az első H2 ELŐTTI, a címre csak hasonlító (fordított) H1 kimarad — nem ismétlődik H2-ként', () => {
  const html = torzsH1('<blockquote><p>Röviden</p></blockquote><h1>Erősebb önéletrajz percek alatt AI-val</h1><h2>1. lépés</h2>', 'Így építsd fel vagy fejleszd tovább az önéletrajzod');
  assert.doesNotMatch(html, /Erősebb önéletrajz/);
  assert.match(html, /Röviden/);
  assert.match(html, /<h2>1\. lépés<\/h2>/);
});

t('a build mindkét helyen (angol + lokalizált) a torzsH1-et használja, a címmel', () => {
  const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.equal((src.match(/torzsH1\(marked\.parse\(body\),/g) || []).length, 2, 'a build nem mindkét helyen hívja');
  assert.doesNotMatch(src, /stripLeadH1\(marked/, 'maradt régi stripLeadH1-hívás');
});

t('VALÓDI cikkek: a megjelenített törzsben sehol nincs H1 (en/hu/es)', () => {
  const dir = join(ROOT, 'content', 'articles');
  const fm = md => { const m = String(md).match(/^---\s*\n([\s\S]*?)\n---\s*\n?/); const ti = m && m[1].match(/^title:\s*"?(.*?)"?\s*$/m); return { cim: ti ? ti[1] : '', body: m ? String(md).slice(m[0].length) : String(md) }; };
  const rossz = []; let db = 0;
  for (const f of readdirSync(dir)) {
    let a, tr = {};
    try { a = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    try { tr = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')); } catch {}
    for (const [ny, md] of [['en', a.article_markdown], ['hu', tr.hu], ['es', tr.es]]) {
      if (!md) continue;
      const { cim, body } = fm(md);
      db++;
      if (/<h1/i.test(torzsH1(marked.parse(body), cim))) rossz.push(ny + ':' + (a._meta?.slug || f));
    }
  }
  assert.ok(db > 500, 'kevés cikket olvasott be: ' + db);
  assert.deepEqual(rossz, []);
});

if (hiba) { console.log(`\n❌ torzs-h1.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ torzs-h1.test: mind rendben');
