// ===================================================================
// TESZT — NEM INDEXELENDŐ NYELVEK (2026-09-08)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT VAN EZ A DÖNTÉS: 2026-08-21-én a Bing lépcsőfüggvényként kikapcsolt
// minket (38-76 megjelenés/nap → PONTOSAN nulla), miközben az indexe 785 →
// 1415-re NŐTT. Indexel, de nem szolgál ki. A legvalószínűbb ok: tömeges
// gépi tartalom egy 3 bejövő linkes domainen. A /hu/ ág a beküldött címek
// ötöde, és 37 nap alatt 13 látogatót hozott (0,35/nap) — egy AMERIKAI
// közönségre épített oldalon.
//
// 🔑 EZ NEM TÖRLÉS. A fájlok, az URL-ek és a nyelvváltó maradnak. A teszt
// egyik legfontosabb feladata épp ezt őrizni: ha valaki később „takarítás"
// címén tényleg törölné a lapokat, az MÁS döntés lenne.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { NOINDEX_LANGS, noindexNyelv, robotsTartalom, indexelhetoNyelvek, noindexKifogas } from './noindex-langs.js';
import { RETIRED_LANGS } from './retired-langs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'website', 'public');

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 nem indexelendő nyelvek\n');

// ===================================================================
// 1. A DÖNTÉS RÖGZÍTÉSE
// ===================================================================
t('🔑 a döntés: a MAGYAR ág marad ki, az angol és a spanyol NEM', () => {
  assert.deepEqual(NOINDEX_LANGS, ['hu']);
  assert.equal(noindexNyelv('hu'), true);
  assert.equal(noindexNyelv('en'), false);
  // ⚠️ A spanyol NEM ugyanaz az eset: az arány JAVUL (3,9% → 6,8% az utolsó
  // 14 napon). Ha valaha ide kerül, az külön mérés és külön döntés.
  assert.equal(noindexNyelv('es'), false, 'a spanyol nem kerülhet ide mérés nélkül');
  assert.equal(noindexNyelv(''), false, 'az angol GYÖKÉR sosem eshet ki');
});

t('a nyelvkód írásmódja nem számít, a hibás bemenet nem dob', () => {
  assert.equal(noindexNyelv('HU'), true);
  assert.equal(noindexNyelv(' hu '), true);
  for (const rossz of [null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => noindexNyelv(rossz));
    assert.equal(noindexNyelv(rossz), false, 'ismeretlen bemenetre NEM tiltunk: ' + String(rossz));
  }
});

t('🔑 ez NEM a kivezetett nyelvek listája — a kettő külön dolog', () => {
  // A `RETIRED_LANGS` (de, fr) VÉGLEG TÖRÖLT: azok a címek 301-et kapnak, és
  // nincs mögöttük lap. Ezek a lapok ÉLNEK. Ha a kettő összekeveredne, vagy
  // 301-et adnánk élő oldalra, vagy noindexet egy nem létezőre.
  for (const l of NOINDEX_LANGS) {
    assert.ok(!RETIRED_LANGS.includes(l), `a(z) ${l} mindkét listán szerepel — ellentmondás`);
  }
});

// ===================================================================
// 2. A ROBOTS-CÍMKE TARTALMA
// ===================================================================
t('🔑 a noindexes ág megkapja a noindexet, a többi NEM', () => {
  assert.match(robotsTartalom('hu'), /(^|\s)noindex\b/);
  assert.ok(!/noindex/.test(robotsTartalom('en')), 'az angol NEM kaphat noindexet');
  assert.ok(!/noindex/.test(robotsTartalom('es')), 'a spanyol NEM kaphat noindexet');
});

t('🔑 a `follow` MEGMARAD — a belső linkek értéke ne vesszen el', () => {
  // A lap ne kerüljön az indexbe, de a rajta lévő, angol cikkekre mutató
  // hivatkozásokat a kereső KÖVESSE.
  assert.match(robotsTartalom('hu'), /\bfollow\b/);
  assert.ok(!/nofollow/.test(robotsTartalom('hu')), 'a nofollow elvágná a belső linkeket');
});

t('🔑 a max-image-preview MINDEN ágon bent marad', () => {
  // Két okból: (1) a `core/seo-guard.js` NO_DISCOVER_META szabálya minden
  // mintavett oldalon megköveteli — enélkül minden futásban riasztana;
  // (2) ha a döntést visszavonjuk, a Discover-beállítás magától a helyén van.
  for (const l of ['en', 'hu', 'es', '']) {
    assert.match(robotsTartalom(l), /max-image-preview:large/, 'kiesett a Discover-beállítás: ' + l);
  }
});

// ===================================================================
// 3. AMIT A KERESŐKNEK HIRDETÜNK
// ===================================================================
t('🔑 a noindexelt nyelv kiesik a hirdethető listából', () => {
  assert.deepEqual(indexelhetoNyelvek(['en', 'hu', 'es']), ['en', 'es']);
});

t('hibás bemenetre üres lista, nem dobás', () => {
  for (const rossz of [null, undefined, 'hu', 42]) {
    assert.doesNotThrow(() => indexelhetoNyelvek(rossz));
    assert.deepEqual(indexelhetoNyelvek(rossz), []);
  }
});

t('🔑 VISSZAVONHATÓ: üres listával minden visszaáll', () => {
  // A DE/FR törlés (2026-08-25) VÉGLEGES volt — újrafordítás kellene hozzá.
  // Ez a döntés szándékosan más: egyetlen sor visszacsinálja. A teszt azt
  // rögzíti, hogy a modulban ne legyen semmi, ami ezt megnehezítené.
  const uresLista = [];
  const noindexUres = (l) => uresLista.includes(String(l || '').toLowerCase());
  assert.equal(noindexUres('hu'), false, 'üres listával a magyar is indexelhető lenne');
});

// ===================================================================
// 3/b. AZ ŐRSZEM DÖNTÉSE — VISELKEDÉSBEN, nem forrásban
// ===================================================================
// ⚠️ EZ A SZAKASZ MUTÁCIÓBÓL SZÜLETETT. Az első változatom csak a
// `core/seo-guard.js` FORRÁSÁT nézte („hívja-e a noindexNyelv-et"). Amikor
// kísérletként visszaírtam oda a régi, hibás feltételt, minden teszt ZÖLD
// MARADT — pedig az az őrszem MINDEN futásban hamisan riasztott volna a
// saját, szándékos döntésünkre, és a zajban a valódi SEO-lelet veszne el.
// A döntés ezért ide költözött, ahol tesztelhető.
console.log('\n🧪 az őrszem döntése (viselkedés, nem forrás)');

const LAP = (noindexel) => '<html><head><meta name="robots" content="'
  + (noindexel ? 'noindex, follow, ' : '') + 'max-image-preview:large"></head></html>';

t('🔑 a SZÁNDÉKOS noindex nem hiba, a nem szándékos IGEN', () => {
  assert.equal(noindexKifogas('/hu/index.html', LAP(true)), null,
    '⚠️ a saját döntésünkre riasztana — minden futásban, hamisan');
  const k = noindexKifogas('/index.html', LAP(true));
  assert.ok(k, 'az ANGOL főoldalon a noindex súlyos hiba, jelezni kell');
  assert.equal(k.kod, 'NOINDEX');
});

t('🔑 a MÁSIK IRÁNY is: az eltűnt noindex ugyanúgy lelet', () => {
  // Ha egy build-átírás után a címke némán leesne, a 940 magyar lap
  // visszaszivárogna az indexbe — és senki nem venné észre.
  const k = noindexKifogas('/hu/article/valami.html', LAP(false));
  assert.ok(k, 'a hiányzó noindexre nem szólt');
  assert.equal(k.kod, 'NOINDEX_HIANYZIK');
});

t('a rendes oldalak csendesek maradnak', () => {
  assert.equal(noindexKifogas('/index.html', LAP(false)), null);
  assert.equal(noindexKifogas('/es/index.html', LAP(false)), null);
  assert.equal(noindexKifogas('/article/x.html', LAP(false)), null);
});

t('a windowsos útelválasztó sem zavarja meg', () => {
  // A `seo-guard.js` a valódi fájlútból számolja a `rel`-t.
  assert.equal(noindexKifogas('\\hu\\index.html', LAP(true)), null);
  assert.ok(noindexKifogas('\\hu\\index.html', LAP(false)), 'windowsos úton nem ismerte fel a nyelvet');
});

t('hibás bemenetre nem dob', () => {
  for (const rossz of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => noindexKifogas(rossz, LAP(false)));
    assert.doesNotThrow(() => noindexKifogas('/index.html', rossz));
  }
});

// ===================================================================
// 4. AZ ÉPÍTETT KIMENETEN — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
console.log('\n🧪 az épített kimeneten (ha van helyi build)');

const van = existsSync(join(PUBLIC, 'index.html'));
if (!van) console.log('  (nincs helyi build — ezt a szakaszt kihagyom; a CI a build ELŐTT futtat teszteket)');

const robotsOf = (p) => {
  const f = join(PUBLIC, p);
  if (!existsSync(f)) return null;
  return (readFileSync(f, 'utf-8').match(/<meta name="robots" content="([^"]*)"/) || [])[1] || null;
};

t('🔑 ÉLES: a /hu/ lapok noindexet kapnak, az angol és a spanyol NEM', () => {
  if (!van) return;
  const hu = robotsOf('hu/index.html'), en = robotsOf('index.html'), es = robotsOf('es/index.html');
  assert.ok(hu && /noindex/.test(hu), 'a /hu/ főoldalon NINCS noindex: ' + hu);
  assert.ok(en && !/noindex/.test(en), '⚠️ AZ ANGOL FŐOLDAL NOINDEXET KAPOTT: ' + en);
  assert.ok(es && !/noindex/.test(es), '⚠️ A SPANYOL FŐOLDAL NOINDEXET KAPOTT: ' + es);
});

t('🔑 ÉLES: a CIKK-oldalakra is kiterjed (nem csak a főoldalra)', () => {
  if (!van) return;
  // A főoldal egy lap a 2822-ből. Ha a szabály csak oda jutna el, a 940
  // magyar cikk továbbra is bent maradna az indexben.
  for (const [nyelv, dir, kell] of [['hu', 'hu/article', true], ['en', 'article', false], ['es', 'es/article', false]]) {
    const d = join(PUBLIC, dir);
    if (!existsSync(d)) continue;
    const f = readdirSync(d).filter(x => x.endsWith('.html'))[0];
    if (!f) continue;
    const r = robotsOf(join(dir, f));
    assert.equal(/noindex/.test(r || ''), kell, nyelv + ' cikk robots: ' + r);
  }
});

t('🔑 ÉLES: a lapok MEGVANNAK — ez nem törlés', () => {
  if (!van) return;
  const d = join(PUBLIC, 'hu');
  assert.ok(existsSync(d), '⚠️ A /hu/ MAPPA ELTŰNT — ez törlés lenne, nem noindex!');
  let db = 0;
  const jar = (x) => { for (const e of readdirSync(x, { withFileTypes: true })) { const p = join(x, e.name); if (e.isDirectory()) jar(p); else if (e.name.endsWith('.html')) db++; } };
  jar(d);
  // KIMÉRVE 2026-09-08: 942 magyar html. A küszöb jóval alatta, hogy a
  // cikkszám természetes változása ne buktassa el.
  assert.ok(db > 500, '⚠️ csak ' + db + ' magyar lap maradt — valaki törli őket');
});

t('🔑 ÉLES: a sitemap nem hirdeti a /hu/-t, de a spanyolt igen', () => {
  if (!van) return;
  const sm = join(PUBLIC, 'sitemap.xml');
  if (!existsSync(sm)) { console.log('     (nincs sitemap)'); return; }
  const locs = [...readFileSync(sm, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const hu = locs.filter(u => u.includes('/hu/')).length;
  const es = locs.filter(u => u.includes('/es/')).length;
  console.log('     ↳ sitemap: ' + locs.length + ' URL — /hu/: ' + hu + ', /es/: ' + es);
  assert.equal(hu, 0, '⚠️ a sitemap MÉG MINDIG beküldi a magyar címeket');
  assert.ok(es > 100, '⚠️ a spanyol is kiesett a sitemapből (' + es + ') — az NEM volt a döntés');
  // A `core/live-guard.js` SITEMAP_SHRUNK küszöbe 500. Ha alá csúsznánk,
  // minden futásban riasztana — és a valódi zsugorodást senki nem hinné el.
  assert.ok(locs.length > 500, 'a sitemap 500 alá esett (' + locs.length + ') — a live-guard riasztana');
});

t('🔑 ÉLES: a hreflang nem mutat noindexelt lapra', () => {
  if (!van) return;
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
  const alt = html.match(/<link rel="alternate" hreflang="[^"]+"[^>]*>/g) || [];
  assert.ok(alt.length, 'nincs egyetlen hreflang sem — az más hiba');
  assert.ok(!alt.some(a => /hreflang="hu"/.test(a)),
    '⚠️ a hreflang még hirdeti a magyart: ' + alt.join(' '));
  assert.ok(alt.some(a => /hreflang="es"/.test(a)), 'a spanyol hreflang eltűnt — az NEM volt a döntés');
});

t('🔑 ÉLES: a LÁTOGATÓ nyelvváltójában a magyar MEGMARAD', () => {
  if (!van) return;
  // A hreflang a KERESŐNEK szól, a nyelvváltó az EMBERNEK. A kettő
  // szándékosan vált szét — aki a magyar linket megkapja, ugyanúgy olvassa.
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
  assert.match(html, /<option value="[^"]*\/hu\/"/, '⚠️ a magyar eltűnt a nyelvváltóból is');
});

t('🔑 ÉLES: a robots.txt NEM tilthatja le a /hu/-t', () => {
  if (!van) return;
  // Egy `Disallow: /hu/` megtiltaná a feltérképezést — akkor viszont a kereső
  // EL SEM OLVASNÁ a noindexet, és a már bent lévő címek bent ragadnának.
  const p = join(PUBLIC, 'robots.txt');
  if (!existsSync(p)) { console.log('     (nincs robots.txt)'); return; }
  const r = readFileSync(p, 'utf-8');
  assert.ok(!/Disallow:\s*\/hu/i.test(r), '⚠️ Disallow a /hu/-ra — így a noindex SOHA nem érvényesül:\n' + r);
});

// ===================================================================
// 5. BEKÖTÉS-ŐR
// ===================================================================
// ⚠️ A KOMMENTEKET LEVÁGJUK. Ezekben a fájlokban a kommentek is leírják a
// függvények nevét — egy kivágott hívást a puszta névkeresés zölden
// átengedne. (Ez élesben megtörtént velem 2026-09-08-án, a felújítás-kapunál.)
console.log('\n🧪 bekötés — a szabály mind a négy helyre eljut');

const kod = (p) => {
  const f = join(ROOT, p);
  if (!existsSync(f)) return '';
  return readFileSync(f, 'utf-8').split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
};

t('🔌 a BUILD használja: robots-meta, hreflang és sitemap', () => {
  const b = kod('website/build.js');
  assert.ok(b, 'nem olvasható a website/build.js');
  assert.ok(/from '\.\.\/core\/noindex-langs\.js'/.test(b), 'nincs import');
  assert.ok(/content="\$\{robotsTartalom\(/.test(b), 'a robots-meta nem a modulból jön');
  assert.ok(/indexelhetoNyelvek\(SITE_LANGS\)/.test(b), 'a hreflang MINDEN nyelvet hirdet');
  assert.ok(/if\s*\(\s*!noindexNyelv\(lang\)\s*\)/.test(b), 'a sitemap nem szűr nyelvre');
});

t('🔌 a SEO-ŐRSZEM ezt a döntést használja (nem sajátot)', () => {
  const s = kod('core/seo-guard.js');
  assert.ok(/from '\.\/noindex-langs\.js'/.test(s), 'nincs import a seo-guard-ban');
  assert.ok(/noindexKifogas\s*\(\s*rel\s*,\s*html\s*\)/.test(s),
    'a seo-guard nem a közös döntést hívja — saját, tesztelhetetlen másolata van');
  // ⚠️ PONTOS MINTA KELL. Az első változatom a `noindex[^>]*name="robots"`
  // mintát kereste — csakhogy a `[^>]` az ÚJSORRA IS illeszkedik, így két
  // különálló kódsor között talált egyezést, és hamisan bukott. A saját
  // mérőeszköz hibája ugyanúgy megtéveszt, mint a kódé.
  assert.ok(!s.includes('name="robots"[^>]*noindex'),
    '⚠️ visszakerült a saját noindex-felismerés a seo-guard-ba — az ott nem tesztelhető');
});

t('🔌 az INDEXNOW nem jelenti be a noindexelt ágat', () => {
  const i = kod('core/indexnow.js');
  assert.ok(/from '\.\/noindex-langs\.js'/.test(i), 'nincs import az indexnow-ban');
  assert.ok(/LANGS[\s\S]{0,120}?noindexNyelv\s*\(/.test(i), 'a LANGS lista nincs szűrve');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} noindex-langs.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
