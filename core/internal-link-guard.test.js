// ===================================================================
// TESZT — belső hivatkozás-őr: mutat-e a saját oldalunk sehova?
// ===================================================================
// INGYENES, hálózat nélküli. A záró eset a VALÓDI `website/public/`-on fut,
// ha az elérhető (csak olvas).
//
// MI TÖRTÉNT (2026-09-08)
// ──────────────────────
// A user Search Console-képén „Nem található (404): 15" állt. Végigpásztáztam
// a 2822 épített oldal MINDEN belső hivatkozását, és három halott célt
// találtam. Kettő a 404-oldal nyelvváltójából jött (javítva), a harmadik egy
// heti összefoglaló „Read the full story" gombja volt — hat hete 404.
//
// A gyökérok tanulságos: az amerikai-helyesírás javítónk 2026-08-30 ELŐTT az
// URL-eket is átírta, így a „personalise" slugból „personalize" lett. A
// gépezet azóta javítva (a `core/us-spelling.js` védi az URL-eket), de a
// SÉRÜLÉS bent maradt — és semmi nem szólt róla hat héten át.
//
// 🔑 EZÉRT KELL EZ AZ ŐR: a halott belső link nem robban, nem dob hibát, és a
// tesztek is zöldek maradnak tőle. Csak az olvasó akad el rajta — és a
// kereső, ami 404-et jegyez fel a saját oldalunkról.
//
// ⚠️ AZ ÁTIRÁNYÍTOTT CÍM NEM HALOTT. A `_redirects` 301-et ad rá, tehát a
// látogató célba ér. Ha ezt az őr nem venné figyelembe, minden régi slugra
// riasztana — és a zaj miatt a valódi leletet senki nem venné észre.
// ===================================================================

import assert from 'assert/strict';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { belsoLinkek, atiranyitasTerkep, halottLinkek, linkSor } from './internal-link-guard.js';

// ⚠️ `fileURLToPath`, NEM `.pathname` — Windowson az utóbbi „/C:/AI%20work/…"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 belső hivatkozás-őr — mutat-e a saját oldalunk sehova\n');

// ===================================================================
// 1. A LINKEK KISZEDÉSE
// ===================================================================
t('🔑 a belső hivatkozásokat kiszedi, a KÜLSŐKET nem', () => {
  const l = belsoLinkek(`
    <a href="/guides">útmutatók</a>
    <a href="https://aiworldhq.com/tools">eszközök</a>
    <a href="https://openai.com/blog">külső</a>
    <a href="mailto:support@aiworldhq.com">levél</a>
    <a href="#tetejere">horgony</a>
  `);
  assert.deepEqual([...l].sort(), ['/guides', '/tools']);
});

t('🔑 a RELATÍV linket is feloldja (ez az első változatomból KIMARADT)', () => {
  // A főoldal kártyái `href="article/…"` alakúak, vezető `/` NÉLKÜL. Az első
  // szűrőm ezeket eldobta, és a főoldalról NULLA cikk-linket látott — az őr
  // tehát a legfontosabb linkjeinket nem is nézte volna. Kimérve: a főoldalon
  // 56 belső link van, ebből 40 cikk.
  const l = belsoLinkek('<a href="article/foo">x</a>', '/');
  assert.deepEqual([...l], ['/article/foo']);
});

t('🔑 a relatív link a KISZOLGÁLT címhez képest oldódik fel', () => {
  // A `/article/foo` lapon a `bar` a `/article/bar`-ra mutat: a böngésző az
  // utolsó szeletet eldobja. Fájlnévvel számolva egy szinttel elcsúsznánk.
  assert.deepEqual([...belsoLinkek('<a href="bar">x</a>', '/article/foo')], ['/article/bar']);
  assert.deepEqual([...belsoLinkek('<a href="article/foo">x</a>', '/hu/')], ['/hu/article/foo']);
  assert.deepEqual([...belsoLinkek('<a href="../index">x</a>', '/article/foo')], ['/index']);
});

t('a horgonyt és a lekérdezés-részt levágja (ugyanaz az oldal)', () => {
  const l = belsoLinkek('<a href="/guides#lista">x</a><a href="/guides?v=2">y</a>');
  assert.deepEqual([...l], ['/guides']);
});

t('üres/hibás bemenetre nem dob és üreset ad', () => {
  for (const rossz of [null, undefined, '', 42, {}]) {
    assert.doesNotThrow(() => belsoLinkek(rossz));
    assert.equal(belsoLinkek(rossz).size, 0);
  }
});

// ===================================================================
// 2. AZ ÁTIRÁNYÍTÁS-TÉRKÉP
// ===================================================================
t('🔑 a `_redirects` forrásait kiolvassa', () => {
  const m = atiranyitasTerkep([
    '# komment',
    '/article/regi /article/uj 301',
    '/hu/article/regi /hu/article/uj 301',
    ''
  ].join('\n'));
  assert.equal(m.has('/article/regi'), true);
  assert.equal(m.has('/hu/article/regi'), true);
  assert.equal(m.size, 2);
});

t('a joker-szabályt (*) NEM veszi egyedi címnek', () => {
  // A `/pages.dev/* https://… 301` alakú szabály minden címre illik; ha
  // egyedi célként vennénk fel, semmi nem látszana halottnak.
  const m = atiranyitasTerkep('/* https://aiworldhq.com/:splat 301\n/a /b 301');
  assert.equal(m.has('/a'), true);
  assert.equal(m.has('/*'), false, 'a jokert egyedi címként vette fel');
});

t('hibás bemenetre üres térkép, nem dobás', () => {
  for (const rossz of [null, undefined, 42, '']) {
    assert.doesNotThrow(() => atiranyitasTerkep(rossz));
    assert.equal(atiranyitasTerkep(rossz).size, 0);
  }
});

// ===================================================================
// 3. A HALOTT LINK MEGÁLLAPÍTÁSA
// ===================================================================
const letezikTeszt = u => ['/guides', '/tools', '/', '/article/elo'].includes(u);

t('🔑 a nem létező célt HALOTTNAK jelenti', () => {
  const h = halottLinkek(
    new Map([['/article/nincs-ilyen', ['index.html']]]),
    { letezik: letezikTeszt, atiranyitasok: new Map() });
  assert.equal(h.length, 1);
  assert.equal(h[0].cel, '/article/nincs-ilyen');
});

t('🔑 az ÁTIRÁNYÍTOTT cél NEM halott (különben minden régi slug riasztana)', () => {
  const h = halottLinkek(
    new Map([['/article/regi', ['index.html']]]),
    { letezik: letezikTeszt, atiranyitasok: new Map([['/article/regi', '/article/elo']]) });
  assert.deepEqual(h, []);
});

t('a létező célra nem szól', () => {
  const h = halottLinkek(
    new Map([['/guides', ['index.html']], ['/tools', ['index.html']]]),
    { letezik: letezikTeszt, atiranyitasok: new Map() });
  assert.deepEqual(h, []);
});

t('megmondja, HÁNY oldalról hivatkozunk a halott célra', () => {
  const h = halottLinkek(
    new Map([['/article/nincs', ['a.html', 'b.html', 'c.html']]]),
    { letezik: letezikTeszt, atiranyitasok: new Map() });
  assert.equal(h[0].honnan, 3);
  assert.ok(h[0].pelda, 'nincs példa forrás-oldal');
});

t('hibás bemenetre nem dob', () => {
  for (const rossz of [null, undefined, 42, 'x', new Map()]) {
    assert.doesNotThrow(() => halottLinkek(rossz, { letezik: letezikTeszt }));
  }
});

// ===================================================================
// 4. A RIPORT-SOR — némán, ha nincs baj
// ===================================================================
t('a sor NÉMA, ha nincs halott link', () => {
  assert.equal(linkSor({ at: '2026-09-08T05:00:00Z', problems: [] }), null);
});

t('adathiánynál is NÉMA (nem futott még őrjárat)', () => {
  assert.equal(linkSor(null), null);
  assert.equal(linkSor({}), null);
});

t('🔑 halott linknél kiírja a CÉLT és hogy honnan', () => {
  const s = linkSor({
    at: '2026-09-08T05:00:00Z',
    problems: ['/article/nincs-ilyen (3 oldalról, pl. index.html)']
  });
  assert.ok(s, 'nem adott sort valódi lelethez');
  assert.ok(/nincs-ilyen/.test(s), 'nincs benne a cél: ' + s);
});

// ===================================================================
// 5. A VALÓDI ÉPÍTETT OLDALON — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
t('🔑 az ÉLES build-kimeneten fut (ha van), és értelmes számot ad', () => {
  const dir = join(ROOT, 'website', 'public');
  if (!existsSync(join(dir, 'index.html'))) {
    console.log('     (nincs helyi build — kihagyva; a CI-ban mindig van)');
    return;
  }
  const red = existsSync(join(dir, '_redirects'))
    ? atiranyitasTerkep(readFileSync(join(dir, '_redirects'), 'utf-8'))
    : new Map();
  assert.ok(red.size > 100,
    'gyanúsan kevés átirányítás-szabály (' + red.size + ') — romlott a beolvasás');
  // A tényleges pásztázást a modul végzi; itt csak azt kötjük ki, hogy a
  // mérőeszköz LÁT is valamit — egy 0-t adó pásztázás semmit nem bizonyítana.
  // KIMÉRVE 2026-09-08-án: a főoldalon 56 belső link van, ebből 40 cikk-link.
  // A küszöb jóval alatta, hogy a kártyaszám változása ne buktassa el — a
  // kiszedés elromlása viszont 0 közelébe vinné, és azt elkapja.
  const linkek = belsoLinkek(readFileSync(join(dir, 'index.html'), 'utf-8'), '/');
  assert.ok(linkek.size >= 30,
    'a főoldalon csak ' + linkek.size + ' belső link — romlott a kiszedés');
  const cikkek = [...linkek].filter(u => u.startsWith('/article/'));
  assert.ok(cikkek.length >= 20,
    'a főoldalon csak ' + cikkek.length + ' CIKK-link — a kártyák nem követhetők');
});

// ===================================================================
// 6. BEKÖTÉS-ŐR — a lelet ELJUT a userhez
// ===================================================================
// „Az őrszem csak akkor őr, ha odaszól, ahol a user néz." A `daily-report.js`
// importálása Telegram-üzenetet küldene — forrásból ellenőrizzük.
t('🔌 a halott-link sor be van kötve a NAPI JELENTÉSBE', () => {
  const forras = readFileSync(join(ROOT, 'core', 'daily-report.js'), 'utf-8');
  assert.ok(/from '\.\/internal-link-guard\.js'/.test(forras),
    'nincs import az internal-link-guard.js-ből');
  // A HÍVÁST keressük: egy behozott, de sosem hívott függvény forrásszinten
  // pontosan úgy néz ki, mint egy működő bekötés.
  assert.ok(/linkSor\s*\(/.test(forras),
    'a linkSor() csak importálva van, nem HÍVVA');
  assert.ok(/link-guard\.json/.test(forras),
    'a riport nem olvassa az őrszem állapotfájlját');
});

t('🔌 a CI FUTTATJA az őrjáratot a build után', () => {
  // Enélkül az állapotfájl sosem frissülne, és a riport örökre a legutóbbi
  // helyi futásom eredményét mutatná — némán elavulva.
  const yml = readFileSync(join(ROOT, '.github', 'workflows', 'auto.yml'), 'utf-8');
  assert.ok(/node core\/internal-link-guard\.js/.test(yml),
    'a CI nem futtatja a belső hivatkozás-őrt');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} internal-link-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
