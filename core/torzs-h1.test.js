// core/torzs-h1.js — a cikk-törzsben nincs H1 (Bing: „Az oldalon több <h1> van”, 2026-11-05).
// Ingyenes, hálózat nélküli; a VALÓDI cikkeken (en/hu/es) is lefut.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { torzsH1, nincsH1 } from './torzs-h1.js';
import { h1Ellenorzes } from './output-guard.js';

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

t('útmutató-rész: minden megmaradt H1 → H2 (a címet a parseGuideSections már levette)', () => {
  assert.equal(nincsH1('<p>a</p><h1 id="x">Második cím</h1><h1>Harmadik</h1>'), '<p>a</p><h2 id="x">Második cím</h2><h2>Harmadik</h2>');
  assert.equal(nincsH1('<h2>marad</h2>'), '<h2>marad</h2>');
});

t('a build az útmutató-részeket (guideSectionHtml) is a nincsH1-en át rendereli', () => {
  const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  const m = src.match(/function guideSectionHtml\([\s\S]*?\r?\n}\r?\n/);
  assert.ok(m, 'guideSectionHtml nem található');
  assert.match(m[0], /nincsH1\(marked\.parse\(pre\)\)/);
  // minden blokk-szintű markdown-renderelés H1-szűrőn megy át (inline nem tud H1-et adni)
  const csupasz = [...src.matchAll(/marked\.parse\(/g)].filter(x => !/(torzsH1|nincsH1)\($/.test(src.slice(x.index - 8, x.index)));
  assert.equal(csupasz.length, 0, 'van H1-szűrő nélküli marked.parse a buildben');
});

t('kimenet-őr: 1 H1 = rendben; 0 vagy 2 = lelet; átirányító és google*.html kivétel', () => {
  const lap = n => '<html><body>' + '<h1 class="a">x</h1>'.repeat(n) + '</body></html>';
  assert.equal(h1Ellenorzes([{ f: 'article/a.html', h: lap(1) }, { f: 'hu/index.html', h: lap(1) }]), null);
  const l = h1Ellenorzes([{ f: 'article/a.html', h: lap(2) }, { f: 'es/tools.html', h: lap(0) }, { f: 'ok.html', h: lap(1) }]);
  assert.equal(l.code, 'H1_NEM_EGY'); assert.equal(l.db, 2);
  assert.equal(h1Ellenorzes([{ f: 'google9b2b.html', h: 'google-site-verification' }, { f: 'regi.html', h: '<meta http-equiv="refresh" content="0;url=/x">' }]), null);
});

t('kimenet-őr: a H1-lelet a lista ELEJÉRE kerül (a riport csak az első 3-at írja ki)', () => {
  const src = readFileSync(join(ROOT, 'core', 'output-guard.js'), 'utf-8');
  assert.match(src, /problems\.unshift\(h1\)/);
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
