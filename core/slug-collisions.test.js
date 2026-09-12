// ===================================================================
// TESZT — slug-ütközés-őr: a BUILD kulcsát figyeli, nem a címet
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A `content/articles/`-t CSAK OLVASSA. Az egyetlen írás egy ideiglenes mappa
// az OS temp-jében (a bekötés-teszthez), amit a teszt a végén töröl.
//
// A build.js-t NEM importálja (futtatásnak indulna): a FORRÁSÁBÓL építi fel a
// slug-képletet, és viselkedésre hasonlít.
//
// MIÉRT (2026-09-12): az őr a címből képzett slugot nézte, a build viszont a
// rögzített `_meta.slug`-ot használja URL-nek — 961 cikkből 81-nél a kettő
// eltér. Részletek: core/slug-collisions.js fejléce.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { epulOldal, frontmatterCim, effektivSlug, slugUtkozesek } from './slug-collisions.js';
import { qualityFindings } from './quality-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 slug-ütközés-őr — a build kulcsa\n');

const cikk = (cim, slug, extra = {}) => ({
  article_markdown: `---\ntitle: "${cim}"\ncategory: work\n---\n# ${cim}\n\nSzöveg.`,
  original_title: cim,
  _meta: slug === undefined ? {} : { slug },
  ...extra
});

// ===================================================================
// (a) + (b) — A KÉT IRÁNY
// ===================================================================
t('🔑 (a) két azonos _meta.slug ÜTKÖZÉS, akkor is, ha a címek eltérnek', () => {
  const out = slugUtkozesek([
    { file: 'ARTICLE_egyik.json', data: cikk('How to plan a trip with Gemini', 'plan-a-trip-with-ai') },
    { file: 'ARTICLE_masik.json', data: cikk('Budget travel tips using ChatGPT', 'plan-a-trip-with-ai') }
  ]);
  assert.equal(out.length, 1, 'a valódi URL-ütközést NEM jelentette (a build az egyik oldalt felülírná)');
  assert.ok(out[0].includes('ARTICLE_masik.json') && out[0].includes('ARTICLE_egyik.json'),
    'a riport-sor nem nevezi meg mindkét fájlt: ' + out[0]);
});

t('🔑 (b) azonos CÍM, de eltérő _meta.slug → NINCS ütközés', () => {
  // Pontosan a 81 eltérő cikk esete: a cím átíródott, az URL rögzítve maradt.
  const out = slugUtkozesek([
    { file: 'ARTICLE_regi.json', data: cikk('How to organize your inbox with AI', 'how-to-organise-your-inbox-with-ai') },
    { file: 'ARTICLE_uj.json', data: cikk('How to organize your inbox with AI', 'how-to-organize-your-inbox-with-ai') }
  ]);
  assert.deepEqual(out, [], 'HAMIS riasztás: a két cikk külön URL-en él');
});

t('a riport-sor formátuma változatlan', () => {
  const out = slugUtkozesek([
    { file: 'ARTICLE_a.json', data: cikk('Első cím', 'ugyanaz') },
    { file: 'ARTICLE_b.json', data: cikk('Második cím', 'ugyanaz') }
  ]);
  assert.deepEqual(out, ['SLUG-ÜTKÖZÉS: "Második cím" — ARTICLE_b.json és ARTICLE_a.json egymásra épül!']);
});

// ===================================================================
// TARTALÉK — rögzített slug nélkül a build képlete
// ===================================================================
t('🔑 rögzített slug nélkül a CÍMRE esik vissza (és az ütközhet egy rögzítettel)', () => {
  // A CEO-út egyszer `slug: undefined`-dal publikált (core/publish-meta.js) —
  // a tartalék tehát élő út, nem elméleti.
  const out = slugUtkozesek([
    { file: 'ARTICLE_rogzitett.json', data: cikk('Valami egészen más', 'foo-bar-baz') },
    { file: 'ARTICLE_rogzitetlen.json', data: cikk('Foo Bar Baz', undefined) }
  ]);
  assert.equal(out.length, 1, 'a rögzítetlen cikk címből képzett URL-je ütközik, és az őr nem látta');
});

t('a tartalék sorrendje: frontmatter-cím → original_title → fájlnév', () => {
  assert.equal(effektivSlug({ _meta: { slug: 'rogzitett' }, article_markdown: '---\ntitle: Más\n---\n', original_title: 'X' }, 'ARTICLE_f.json'), 'rogzitett');
  assert.equal(effektivSlug({ article_markdown: '---\ntitle: Frontmatter Cím\n---\n', original_title: 'Eredeti' }, 'ARTICLE_f.json'), 'frontmatter-c-m');
  assert.equal(effektivSlug({ article_markdown: 'nincs frontmatter', original_title: 'Eredeti Cím' }, 'ARTICLE_f.json'), 'eredeti-c-m');
  assert.equal(effektivSlug({ article_markdown: '' }, 'ARTICLE_f.json'), 'article-f-json');
  assert.equal(effektivSlug({ _meta: { slug: '' }, article_markdown: '---\ntitle: ""\n---\n', original_title: 'Eredeti' }, 'ARTICLE_f.json'), 'eredeti',
    'üres slug és üres cím → a következő tartalék');
});

t('csak abból ellenőriz, amiből a build oldalt épít (ARTICLE_*.json)', () => {
  assert.equal(epulOldal('ARTICLE_x.json'), true);
  assert.equal(epulOldal('README.md'), false);
  assert.equal(epulOldal('draft_x.json'), false);
  const out = slugUtkozesek([
    { file: 'ARTICLE_a.json', data: cikk('A', 'ugyanaz') },
    { file: 'NOT_AN_ARTICLE.json', data: cikk('B', 'ugyanaz') },
    { file: 'ARTICLE_c.json', data: null }
  ]);
  assert.deepEqual(out, []);
});

t('hibás bemenetre nem dob', () => {
  assert.deepEqual(slugUtkozesek(), []);
  assert.deepEqual(slugUtkozesek(null), []);
  assert.doesNotThrow(() => slugUtkozesek([{ file: 'ARTICLE_x.json', data: { article_markdown: 42, original_title: 7 } }]));
  assert.equal(frontmatterCim(undefined), '');
});

// ===================================================================
// PARITÁS A BUILD.JS-SZEL — a képletet a FORRÁSÁBÓL építjük fel
// ===================================================================
const buildForras = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8')
  .replace(/\r\n/g, '\n')
  .split('\n').filter(sor => !/^\s*\/\//.test(sor)).join('\n');   // egész soros kommentek ki
const fuggveny = (nev) => (buildForras.match(new RegExp(`function ${nev}\\s*\\([\\s\\S]*?\\n\\}`)) || [])[0];

let builder = null;
t('a build.js slug-képlete kiolvasható (ha ez bukik, a build megváltozott — nézd át az őrt!)', () => {
  const load = fuggveny('loadArticles');
  assert.ok(load, 'nincs loadArticles() a build.js-ben');
  assert.ok(load.includes('parseFrontmatter(data.article_markdown)'), 'a build már nem a markdown frontmatteréből veszi a címet');
  const slugKif = (load.match(/const slug = ([^;\n]+);/) || [])[1];
  const szuroKif = (load.match(/readdirSync\(ARTICLES_DIR\)\.filter\((.+)\);/) || [])[1];
  assert.ok(slugKif, 'nincs `const slug = …` sor a loadArticles()-ben');
  assert.ok(szuroKif, 'nincs fájl-szűrő a loadArticles()-ben');
  const slugify = new Function(`${fuggveny('slugify')}; return slugify;`)();
  const parseFrontmatter = new Function(`${fuggveny('parseFrontmatter')}; return parseFrontmatter;`)();
  const slugFn = new Function('data', 'file', 'meta', 'slugify', `return ${slugKif};`);
  builder = {
    szuro: new Function(`return (${szuroKif});`)(),
    slug: (data, file) => slugFn(data, file, parseFrontmatter(data.article_markdown).meta, slugify)
  };
});

t('🔗 PARITÁS szintetikus mintákon — beleértve, ahol a RÉGI őr tévedett', () => {
  assert.ok(builder, 'a build képlete nem olvasható ki');
  const minta = [
    cikk('Sima cím', 'rogzitett-slug'),
    cikk('Sima cím', undefined),
    { article_markdown: '---\ntitle: Idézőjel nélkül\n---\nx', original_title: 'Más' },
    { article_markdown: "---\ntitle: 'Egyszeres idézőjel'\n---\nx" },
    { article_markdown: '---\ntitle: "He said "hi""\n---\nx' },
    { article_markdown: '---\ntitle: Első\ntitle: Második\n---\nx' },
    { article_markdown: '---\ntitle:\n---\nx', original_title: 'Üres cím után' },
    // A RÉGI őr ezt a törzsbeli sort címnek hitte; a build nem látja (nincs frontmatter):
    { article_markdown: '# Cím\n\ntitle: Törzsbeli sor\n', original_title: 'Az igazi eredeti' },
    // CRLF-es markdownban a build NEM talál frontmattert:
    { article_markdown: '---\r\ntitle: CRLF cím\r\n---\r\nx', original_title: 'CRLF tartalék' },
    { article_markdown: '', original_title: '' },
    { article_markdown: '---\ntitle: ' + 'Nagyon hosszú '.repeat(10) + '\n---\n' },
    { article_markdown: '---\ntitle: ——— !!! ———\n---\n', original_title: 'x' }
  ];
  for (const [i, d] of minta.entries()) {
    const f = `ARTICLE_minta-${i}.json`;
    assert.equal(effektivSlug(d, f), builder.slug(d, f), `eltér a build.js-től a(z) ${i}. mintán`);
  }
  for (const f of ['ARTICLE_a.json', 'README.md', 'x.json', 'ARTICLE_b.JSON', 'article_c.json'])
    assert.equal(epulOldal(f), builder.szuro(f), `a fájl-szűrő eltér: ${f}`);
});

t('🔑 (c) VALÓDI cikkeken: minden URL-slug egyezik a buildével, és nincs ütközés', () => {
  assert.ok(builder, 'a build képlete nem olvasható ki');
  assert.ok(existsSync(ARTICLES_DIR), 'nincs content/articles mappa');
  const bejegyzesek = [];
  let rosszJson = 0;
  for (const file of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try { bejegyzesek.push({ file, data: JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')) }); }
    catch { rosszJson++; }
  }
  let ellenorzott = 0, buildElszall = 0, rogzitetlen = 0, cimbolMas = 0;
  for (const { file, data } of bejegyzesek) {
    if (!builder.szuro(file)) continue;
    let varhato;
    try { varhato = builder.slug(data, file); } catch { buildElszall++; continue; }   // a build is átugorja
    ellenorzott++;
    assert.equal(effektivSlug(data, file), varhato, `eltér a build.js-től: ${file.slice(0, 60)}`);
    if (!data?._meta?.slug) rogzitetlen++;
    const cimbol = String(frontmatterCim(data.article_markdown) || data.original_title || file)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
    if (cimbol !== varhato) cimbolMas++;
  }
  console.log(`     ℹ️  ${ellenorzott} cikk ellenőrizve (rögzítetlen slug: ${rogzitetlen}, hibás JSON: ${rosszJson}, a build is átugorná: ${buildElszall})`);
  console.log(`     ℹ️  ${cimbolMas} cikknél tér el a CÍMBŐL képzett slug a valódi URL-től — a régi őr ezeket rossz kulcson nézte`);
  assert.ok(ellenorzott > 0, 'egyetlen cikket sem ellenőrzött — a teszt üresen menne át');
  const utkozes = slugUtkozesek(bejegyzesek);
  assert.deepEqual(utkozes, [],
    'VALÓDI URL-ÜTKÖZÉS az élő cikkek közt — a build az egyik oldalt a másikkal írja felül:\n     ' + utkozes.join('\n     '));
});

// ===================================================================
// BEKÖTÉS — a qualityFindings() tényleg EZT az őrt hívja (futásidőben)
// ===================================================================
// Egy tiszta függvény tökéletesen működhet úgy is, hogy a válaszát senki nem
// használja (a chip-szabály mutációs próbája pont ezt találta, 2026-09-06).
// A napi Telegram-jelentés a `qualityFindings()`-et írja ki, ezért azon át mérünk.
t('🔌 a qualityFindings() a BUILD kulcsán jelez (ideiglenes cikk-mappával)', () => {
  const mappa = mkdtempSync(join(tmpdir(), 'slug-utkozes-'));
  const regi = process.env.SLUG_GUARD_ARTICLES_DIR;
  try {
    const ir = (f, d) => writeFileSync(join(mappa, f), JSON.stringify(d), 'utf-8');
    ir('ARTICLE_1-rogzitett.json', cikk('Teljesen más cím egy', 'kozos-url'));
    ir('ARTICLE_2-rogzitett.json', cikk('Teljesen más cím kettő', 'kozos-url'));
    ir('ARTICLE_3-cim.json', cikk('Azonos cím', 'azonos-cim-regi'));
    ir('ARTICLE_4-cim.json', cikk('Azonos cím', 'azonos-cim-uj'));
    process.env.SLUG_GUARD_ARTICLES_DIR = mappa;
    const sorok = qualityFindings().filter(x => x.startsWith('SLUG-ÜTKÖZÉS'));
    assert.equal(sorok.length, 1, 'nem pontosan 1 ütközést jelentett:\n     ' + sorok.join('\n     '));
    assert.ok(sorok[0].includes('ARTICLE_2-rogzitett') && sorok[0].includes('ARTICLE_1-rogzitett'),
      'nem a _meta.slug-ütközést jelentette: ' + sorok[0]);
  } finally {
    if (regi === undefined) delete process.env.SLUG_GUARD_ARTICLES_DIR;
    else process.env.SLUG_GUARD_ARTICLES_DIR = regi;
    rmSync(mappa, { recursive: true, force: true });
  }
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} slug-collisions.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
