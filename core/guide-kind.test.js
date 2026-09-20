// ===================================================================
// TESZT — „útmutató-e ez a cikk?" EGY közös válasz, és a BEKÖTÉSE
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A MIÉRT. 2026-09-16-ig HÁROM külön szabály felelt ugyanerre a kérdésre:
//   A) `type || frontmatter.category`  — website/build.js, core/tool-kinds.js
//   B) `type || ARTICLE_GUIDE_ fájlnév` — core/social-published.js,
//      core/daily-report.js, core/housekeeping.js, core/image-guard.js
//   C) `type` egyedül                   — core/reel-post.js, core/quality-guard.js
//
// A 986 élő cikken MIND A HÁROM ugyanazt a 441-et mondta: **0 eltérés**.
// 🔑 Ez NEM megnyugtató lelet. Azt jelenti, hogy ma még egyezik, és SEMMI nem
// őrzi — pontosan a két cikk-sablon helyzete, ahol NÉGYSZER került javítás
// csak az egyik példányba. Ez a fájl az, ami mostantól őrzi.
//
// KÉT RÉSZ:
//   1. VISELKEDÉS — a közös függvény minden él-esete rögzítve.
//   2. BEKÖTÉS-ŐR — a hívási helyek TÉNYLEG a közös függvényt hívják, és a
//      régi, bemásolt feltétel SEHOL nem maradt/születik újra a core/ és a
//      website/ alatt.
//
// ⚠️ A bekötést FORRÁS-SZINTEN nézzük, mert a hívók egy részét futtatni és
// importálni is TILOS (core/daily-report.js, core/housekeeping.js,
// core/reel-post.js, website/build.js — a puszta import pénzt költ, publikál
// vagy törölne). Ezért olvasunk szöveget.
//
// ⚠️ AMIT EZ AZ ŐR NEM LÁT: hogy a hívó a JÓ argumentumokat adja-e át
// (fájlnév + cikk), és hogy futásidőben tényleg lefut-e az ág. A valódi
// adaton mért egyezést ezért külön eset rögzíti lentebb (`content/articles`).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { utmutatoE, utmutatoJelek } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Forrás CRLF-normalizálva. A repót Windowson is szerkesztik. */
const forras = (p) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');

/**
 * A forrás TELJES SOROS `//` kommentek nélkül.
 * Muszáj kiszűrni: ezekben a fájlokban a régi szabály PRÓZÁBAN is szerepel
 * (a fejlécek leírják, mi volt a hiba) — a saját dokumentációnk nem buktathatja
 * el az őrt. Ugyanaz a megoldás, mint a core/test-hygiene.test.js-ben.
 */
const kod = (p) => forras(p).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
};

console.log('🧪 útmutató-besorolás — egy közös szabály + bekötés\n');

// ===================================================================
// 1. VISELKEDÉS
// ===================================================================

const md = (kategoria) => `---\ntitle: "X"\ncategory: ${kategoria}\n---\n\nSzöveg.`;

t('a `_meta.type` egyedül elég', () => {
  assert.equal(utmutatoE('ARTICLE_2026-01-01_hir.json', { _meta: { type: 'guide' } }), true);
});

t('a FÁJLNÉV egyedül elég — típus és frontmatter nélkül is', () => {
  // Ez a B) szabály lényege: egy útmutató, amiből kimaradt a `_meta.type`
  // (pl. új publikáló út felejtette el, ahogy a CEO-út a slugot), NEM válhat
  // hírré — a Házmester ugyanis 90 nap után TÖRÖLNÉ.
  assert.equal(utmutatoE('ARTICLE_GUIDE_valami.json', { _meta: {} }), true);
});

t('a frontmatter `category: guide` egyedül elég', () => {
  assert.equal(utmutatoE('ARTICLE_2026-01-01_hir.json', { article_markdown: md('guide') }), true);
});

t('🔴 HÍR: egyik jel sem szól — false', () => {
  assert.equal(utmutatoE('ARTICLE_2026-06-07T19-58-14-251Z_openai-blog_Valami.json',
    { _meta: { type: 'news' }, article_markdown: md('news') }), false);
});

t('a csővezeték korábbi állomásainak nevét is felismeri', () => {
  // WRITER_GUIDE_* (vázlat), DRAFT_GUIDE_*, REJECTED_GUIDE_* (elutasított) —
  // hogy ne szülessen negyedik példány, amikor valaki a vázlatokra kérdez rá.
  for (const n of ['WRITER_GUIDE_x.json', 'DRAFT_GUIDE_x.json', 'REJECTED_GUIDE_x.json']) {
    assert.equal(utmutatoE(n, {}), true, n + ' nem ismerődött fel');
  }
});

t('🔴 a `_GUIDE` a név KÖZEPÉN nem számít — csak az ELEJÉN (horgony)', () => {
  // A hír-fájlok neve `ARTICLE_<időbélyeg>_<forrás>_<cím>.json`, és a CÍM
  // bármit tartalmazhat — akár a saját állomás-előtagjaink szövegét is.
  // ⚠️ AZ ALSÓ KÉT ESET A LÉNYEG: a `^` horgony nélkül ezek is „útmutatók"
  // lennének, és a Házmester ÖRÖKZÖLDKÉNT tartana meg egy hírt örökre.
  // (A mutációs próba ezt a két sort kérte: nélkülük a horgony eltávolítása
  // ÉSZREVÉTLEN maradt.)
  assert.equal(utmutatoE('ARTICLE_2026-06-07T19-58-14-251Z_openai-blog_A_GUIDE_to_AI.json', {}), false);
  assert.equal(utmutatoE('ARTICLE_2026-06-07_x_The_Ultimate_Guide.json', {}), false);
  assert.equal(utmutatoE('ARTICLE_2026-06-07_openai_Inside_the_DRAFT_GUIDE_process.json', {}), false);
  assert.equal(utmutatoE('ARTICLE_2026-06-07_x_When_ARTICLE_GUIDE_is_a_headline.json', {}), false);
});

t('🔴 kisbetűs `article_guide_` NEM számít — a valódi nevek nagybetűsek', () => {
  assert.equal(utmutatoE('article_guide_x.json', {}), false);
});

t('hiányzó fájlnév / hiányzó cikk: nem dob, false-t ad', () => {
  assert.equal(utmutatoE('', {}), false);
  assert.equal(utmutatoE(undefined, undefined), false);
  assert.equal(utmutatoE(null, null), false);
  assert.equal(utmutatoE('ARTICLE_x.json', { _meta: null, article_markdown: null }), false);
});

t('🔑 a `type` CSAK a pontos "guide" érték — a "guides"/"Guide" nem', () => {
  assert.equal(utmutatoE('ARTICLE_x.json', { _meta: { type: 'guides' } }), false);
  assert.equal(utmutatoE('ARTICLE_x.json', { _meta: { type: 'Guide' } }), false);
  assert.equal(utmutatoE('ARTICLE_x.json', { _meta: { type: 'howto' } }), false);
});

t('a frontmatter kategóriája CRLF-es cikkben is olvasható', () => {
  // A website/build.js régi olvasója CSAK `\n`-t fogadott el; egy Windowson
  // szerkesztett cikknél némán „hír"-t mondott volna.
  const crlf = '---\r\ntitle: "X"\r\ncategory: guide\r\n---\r\n\r\nSzöveg.';
  assert.equal(utmutatoE('ARTICLE_2026-01-01_hir.json', { article_markdown: crlf }), true);
});

t('idézőjeles frontmatter-érték is jó (`category: "guide"`)', () => {
  assert.equal(utmutatoE('ARTICLE_x.json', { article_markdown: md('"guide"') }), true);
  assert.equal(utmutatoE('ARTICLE_x.json', { article_markdown: md("'guide'") }), true);
});

t('🔴 `category` a TÖRZSBEN, nem a frontmatterben — nem számít', () => {
  const hamis = '# Cím\n\nEz egy bekezdés.\ncategory: guide\n';
  assert.equal(utmutatoE('ARTICLE_2026-01-01_hir.json', { article_markdown: hamis }), false);
});

t('frontmatter nélküli markdown nem dob', () => {
  assert.equal(utmutatoE('ARTICLE_x.json', { article_markdown: 'csak szöveg' }), false);
});

t('a három jel KÜLÖN is lekérdezhető (diagnózishoz)', () => {
  const j = utmutatoJelek('ARTICLE_GUIDE_x.json', { _meta: { type: 'guide' }, article_markdown: md('guide') });
  assert.deepEqual(j, { type: true, fajlnev: true, kategoria: true });
  const h = utmutatoJelek('ARTICLE_2026_hir.json', { _meta: {}, article_markdown: md('news') });
  assert.deepEqual(h, { type: false, fajlnev: false, kategoria: false });
});

// ===================================================================
// 2. VALÓDI ADAT — a mért 0 eltérés újra ellenőrizhető
// ===================================================================

t('📊 a VALÓDI cikkeken a három jel EGYBEHANGZÓ (ha szétcsúszik, itt derül ki)', () => {
  const DIR = join(ROOT, 'content', 'articles');
  if (!existsSync(DIR)) { console.log('     (nincs content/articles — kihagyva)'); return; }
  const fajlok = readdirSync(DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  assert.ok(fajlok.length >= 100, 'csak ' + fajlok.length + ' cikket látok — romlott a mérőeszköz');

  let utmutato = 0;
  const szetcsuszott = [];
  for (const f of fajlok) {
    let d; try { d = JSON.parse(readFileSync(join(DIR, f), 'utf-8')); } catch { continue; }
    const j = utmutatoJelek(f, d);
    if (j.type || j.fajlnev || j.kategoria) utmutato++;
    // Mérve 2026-09-16-án: mind a 986 cikknél a három jel EGYFORMA.
    if (!(j.type === j.fajlnev && j.fajlnev === j.kategoria)) {
      szetcsuszott.push(`${f} → type:${j.type} fájlnév:${j.fajlnev} kategória:${j.kategoria}`);
    }
  }
  assert.ok(utmutato > 0, 'egyetlen útmutatót sem talált — a mérce elromlott');
  assert.deepEqual(szetcsuszott.slice(0, 5), [],
    'A HÁROM JEL SZÉTCSÚSZOTT ' + szetcsuszott.length + ' cikknél. Ez NEM bukás, hanem '
    + 'LELET: a közös függvény (egyesítés) helyesen kezeli, de valamelyik publikáló '
    + 'út elfelejt egy mezőt — azt kell megkeresni:\n     ' + szetcsuszott.slice(0, 5).join('\n     '));
});

// ===================================================================
// 3. BEKÖTÉS-ŐR
// ===================================================================
//
// `hivas`: a szövegrész, aminek a kódban SZEREPELNIE kell.
// `tilos`: a régi, bemásolt feltétel — ennek el kellett tűnnie.
const HIVOK = [
  { f: 'website/build.js', hivas: 'isGuide: utmutatoE(file, data)',
    tilos: /isGuide:\s*\(?data\._meta\?\.type === 'guide'\)?\s*\|\|/,
    miert: 'ez vezérli a SABLONVÁLASZTÁST és a /guides listát' },
  { f: 'core/housekeeping.js', hivas: 'if (utmutatoE(file, data)) return true;',
    tilos: /data\._meta\?\.type === 'guide' \|\| file\.startsWith\('ARTICLE_GUIDE'\)/,
    miert: 'a téves „hír" 90 nap után VÉGLEG TÖRLI a cikket' },
  { f: 'core/social-published.js', hivas: 'const isGuide = utmutatoE(f, d);',
    tilos: /d\._meta\?\.type === 'guide' \|\| f\.startsWith\('ARTICLE_GUIDE'\)/,
    miert: 'a sor hátralék-helye csak útmutatót enged előre' },
  { f: 'core/daily-report.js', hivas: 'utmutatoE(f, d) ? guides++ : news++;',
    tilos: /\(d\._meta\?\.type === 'guide' \|\| f\.startsWith\('ARTICLE_GUIDE'\)\)\s*\?/,
    miert: 'különben a napi riport MÁS számot küld, mint amit a rendszer publikált' },
  { f: 'core/image-guard.js', hivas: 'guide: utmutatoE(f, d),',
    tilos: /guide:\s*d\._meta\.type === 'guide' \|\| f\.startsWith\('ARTICLE_GUIDE'\)/,
    miert: 'a borítókép-őr köre az útmutatókra más' },
  { f: 'core/tool-kinds.js', hivas: 'if (!utmutatoE(f, data)) continue;',
    tilos: /const isGuide = meta\.type === 'guide' \|\| fm\.category === 'guide'/,
    miert: 'ebből jön a /tools oldal cég- és eszköznév-listája' },
  { f: 'core/reel-post.js', hivas: "type: utmutatoE(f, j) ? 'guide' : 'news'",
    tilos: /type:\s*m\.type === 'guide' \? 'guide' : 'news'/,
    miert: 'a Reel CSAK útmutatóból készül' },
  { f: 'core/quality-guard.js', hivas: "if (utmutatoE(f, d) && d._meta?.tool) {",
    tilos: /if \(d\._meta\?\.type === 'guide' && d\._meta\?\.tool\)/,
    miert: 'a csempe-kanonizálás csak útmutatóra értelmes' },
  { f: 'core/ebook-build.js', hivas: 'if (!utmutatoE(f, d) || !m.slug) continue;',
    tilos: /m\.type !== 'guide' \|\| !m\.slug/,
    miert: 'a FIZETŐS $9-es PDF-csomag tartalma — tagadó alakban írta, ezért bújt el' },
  { f: 'core/topic-dedup.js', hivas: 'if (!utmutatoE(f, d)) continue;',
    tilos: /if \(d\._meta\?\.type !== 'guide'\) continue;/,
    miert: 'a kimaradó cím TÉMAISMÉTLÉST okoz — ez a usernek már feltűnt egyszer' }
];

t('⚠️ a bekötés-őr TÉNYLEG lát hívókat (különben a zöld semmit nem ér)', () => {
  assert.ok(HIVOK.length >= 10, 'csak ' + HIVOK.length + ' hívót néz — romlott a lista');
  for (const h of HIVOK) {
    assert.ok(existsSync(join(ROOT, h.f)), '🔴 eltűnt a hívó fájl: ' + h.f);
    assert.ok(h.miert.length >= 20, 'indoklás nélküli bejegyzés: ' + h.f);
  }
});

for (const h of HIVOK) {
  t(`🔌 ${h.f} a közös függvényt használja`, () => {
    const s = kod(h.f);
    const rel = h.f.startsWith('website/') ? '../core/guide-kind.js' : './guide-kind.js';
    assert.ok(s.includes(`import { utmutatoE } from '${rel}'`),
      `🔴 nincs import a közös modulból (${h.miert})`);
    assert.ok(s.includes(h.hivas),
      `🔴 nem hívja a közös függvényt — várt részlet: ${h.hivas}  (${h.miert})`);
    assert.ok(!h.tilos.test(s),
      `🔴 OTTMARADT a régi, bemásolt feltétel — újra két példány van (${h.miert})`);
  });
}

// ===================================================================
// 4. ÚJ MÁSOLAT ELLEN — a lényegi védelem
// ===================================================================
// A bekötés-őr a MAI nyolc hívót nézi. Az eredeti baj viszont az volt, hogy
// bárki írhatott egy KILENCEDIKET. Ez az eset a core/ és a website/ TELJES
// forrását átfésüli, és minden új példányt megbuktat.

/**
 * Az „útmutató-e?" feltétel bármelyik alakja.
 *
 * ⚠️ A TAGADÓ ALAK IS (`!==`). Az első változatom csak az `===`-t kereste, és
 * emiatt ÁTENGEDTE a core/ebook-build.js-t, ami `if (m.type !== 'guide')`-gal
 * szűrt — vagyis a fizetős PDF-csomag KILENCEDIK példányként osztályozott,
 * és a másolat-kereső VAKON hagyta jóvá. Ugyanaz a hiba-alak, ami a repót már
 * kétszer megfogta (08-14 prompt-szivárgás, 08-16 hossz-kapu): **minden mérce
 * IRÁNYA számít.** Ezért `[!=]==`, és ezért laza a bal oldal (`\.type`), hogy
 * a `d._meta?.type`, a `meta.type` és az `m.type` is beleessen.
 */
const MASOLAT_RX = [
  /\.type\s*[!=]==\s*'guide'/,
  /\.category\s*[!=]==\s*'guide'/,
  /ARTICLE_GUIDE/
];

/**
 * KIVÉTELEK — mindegyik mellé INDOKLÁS kell, különben a lista elrohad.
 * A kivétel akkor jogos, ha a fájlnak NINCS hozzáférése mindhárom jelhez,
 * vagy ha SZÁNDÉKOSAN más kérdést tesz fel.
 */
const MASOLAT_KIVETEL = {
  'guide-kind.js':
    'ez MAGA a közös szabály — itt kell állnia a feltételnek',
  'reel-queue.js':
    'nem osztályoz: MÁR NORMALIZÁLT `type` mezőt kap a core/reel-post.js-től '
    + '(ami a közös függvényt hívja). Se fájlnév, se markdown nincs a kezében, '
    + 'tehát a három jelből kettőt meg sem tudna nézni — a bővítés itt nem '
    + 'pontosítana semmit, csak egy negyedik kérdés-alakot szülne.',
  'reel-post.js':
    'nem osztályoz, hanem a SAJÁT, néhány sorral feljebb kiszámolt mezőt olvassa '
    + 'vissza: a cikkekBetolt() ugyanebben a fájlban tölti a `type`-ot az '
    + 'utmutatoE()-vel. A csomag-reklám Reel innen kapja meg, hány útmutató van '
    + '(2026-09-20). Ha ez helyett újra a közös függvényt hívnánk, ugyanazt a '
    + 'kérdést tennénk fel kétszer ugyanarra az adatra — épp azt a párhuzamos '
    + 'alakot, ami ellen ez a teszt íródott.'
};

t('🔑 NINCS ÚJ MÁSOLAT a core/ és a website/ alatt', () => {
  const talalatok = [];
  const fajlok = [
    ...readdirSync(join(ROOT, 'core'))
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js') && !f.endsWith('.smoke.js'))
      .map(f => ({ nev: f, ut: 'core/' + f })),
    { nev: 'build.js', ut: 'website/build.js' }
  ];
  assert.ok(fajlok.length >= 50, 'csak ' + fajlok.length + ' forrást lát — romlott a mérőeszköz');

  for (const { nev, ut } of fajlok) {
    if (MASOLAT_KIVETEL[nev]) continue;
    const s = kod(ut);
    for (const rx of MASOLAT_RX) {
      const m = s.match(rx);
      if (m) talalatok.push(`${ut}: ${m[0]}`);
    }
  }
  assert.deepEqual(talalatok, [],
    'ÚJ „útmutató-e?" PÉLDÁNY született. Hívd helyette a core/guide-kind.js '
    + '`utmutatoE(fajlnev, cikk)` függvényét — vagy ha az eltérés SZÁNDÉKOS, '
    + 'vedd fel a MASOLAT_KIVETEL listára INDOKLÁSSAL:\n     ' + talalatok.join('\n     '));
});

t('⚠️ a másolat-minta a VALÓDI hibás alakot felismeri (a mérce hitelesítése)', () => {
  // Ismert esettel hitelesítünk: mind a négy régi alak illeszkedjen.
  const regiek = [
    "const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');",
    "isGuide: (data._meta?.type === 'guide') || meta.category === 'guide',",
    "const isGuide = meta.type === 'guide' || fm.category === 'guide';",
    "if (data._meta?.type === 'guide' || file.startsWith('ARTICLE_GUIDE')) return true;",
    // 🔑 A TAGADÓ ALAK — ez bújt el az első mintám elől (core/ebook-build.js).
    "if (m.type !== 'guide' || !m.slug) continue;"
  ];
  for (const sor of regiek) {
    assert.ok(MASOLAT_RX.some(rx => rx.test(sor)), 'nem ismerte fel: ' + sor);
  }
  // …és ártatlan sorra NE illeszkedjen (különben hamis riasztást gyártana)
  for (const sor of ["const t = utmutatoE(f, d);", "if (m.type === 'news') return;",
    "const cat = fm.category || 'other';", "const g = a.isGuide ? 1 : 0;"]) {
    assert.ok(!MASOLAT_RX.some(rx => rx.test(sor)), 'hamis riasztás: ' + sor);
  }
});

t('a kivétel-lista nem rohad: minden kivétel mögött LÉTEZŐ fájl és INDOKLÁS áll', () => {
  for (const [nev, ok] of Object.entries(MASOLAT_KIVETEL)) {
    assert.ok(existsSync(join(ROOT, 'core', nev)), '🔴 eltűnt kivétel-fájl: ' + nev);
    assert.ok(String(ok).length >= 40, '🔴 túl rövid indoklás: ' + nev);
    // Ha a fájlból már kikopott a minta, a kivételnek sincs értelme — töröld.
    const s = kod('core/' + nev);
    assert.ok(MASOLAT_RX.some(rx => rx.test(s)),
      '🔴 a(z) ' + nev + ' már nem tartalmazza a mintát — a kivétel FÖLÖSLEGES, töröld');
  }
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} guide-kind.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
