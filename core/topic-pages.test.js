// ===================================================================
// TESZT — a téma-hub oldalak nyelve és szerkezett adata (2026-09-12)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// KÉT HIBA, EGY FÁJLBAN
//
// 1. BEÉGETETT ANGOL. A `buildTopicPage()` 2026-09-10-én angol címmel,
//    leírással és H1-gyel készült. Élesben mérve 09-12-én:
//        /hu/topic-safe → „Staying safe — AI WORLD HQ"
//        /es/topic-safe → „Staying safe — AI WORLD HQ"
//    8 téma × 2 nem-angol nyelv = 16 élő lap. A többi nyolc gyűjtő-építő
//    mind helyes (/hu/guides → „Hétköznapi AI készségek").
//    🔑 SZÓ SZERINT ugyanaz a hiba, amit 2026-08-04-én már kijavítottak a
//    /guides és /tools oldalon — a figyelmeztetés ott áll a
//    buildGuidesPage kommentjében. Egy javított hiba visszajött egy ÚJ
//    építőben, mert a javítás nem volt kikényszerítve, csak megírva.
//
// 2. ELLENTMONDÓ SZERKEZETT ADAT. A `CollectionPage` az ADOTT LAPOT írja
//    le, tehát az `url`-je a lap saját címe. Élesben mérve:
//        /es/guides  canonical = …/es/guides   JSON-LD url = …/guides
//        /hu/tools   canonical = …/hu/tools    JSON-LD url = …/tools
//    Hat lap adott ellentmondó állítást a keresőnek, egy keresői
//    leminősítés kellős közepén.
//    ⚠️ A `WebSite` és az `Organization` csomópont SZÁNDÉKOSAN marad
//    előtag nélkül — azok nem a lapot írják le. Ezt is őrizzük, hogy
//    később senki ne „javítsa meg".
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TEMAK, TEMA_NYELV, TEMA_LEIRAS, temaSzoveg, temaLeiras } from './topics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ Sorvég-normalizálás — lásd core/guide-autolink.test.js indoklását.
const nyers = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n');
const src = nyers.split('\n').filter(s => !/^\s*\/\//.test(s)).join('\n');

const LANGS = (/const SITE_LANGS = \[([^\]]+)\]/.exec(src)?.[1] || '')
  .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
const NEM_ANGOL = LANGS.filter(l => l !== 'en');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 téma-hub oldalak\n');

t('🔴 MINDEN témának MINDEN élő nyelven van neve', () => {
  const hiany = [];
  for (const tm of TEMAK) for (const l of NEM_ANGOL) {
    const f = TEMA_NYELV[tm.id]?.[l];
    if (!f?.cim) hiany.push(tm.id + '/' + l + ' (cím)');
    if (!f?.rovid) hiany.push(tm.id + '/' + l + ' (rövid)');
  }
  console.log('     📏 ' + TEMAK.length + ' téma × ' + NEM_ANGOL.length + ' nem-angol nyelv');
  assert.deepEqual(hiany, [], '🔴 hiányzó téma-fordítás: ' + hiany.join(', '));
});

t('🔴 a fordítás tényleg MÁS, mint az angol', () => {
  // Egy „fordítás", ami megegyezik az angollal, ugyanaz a hiba máshogy
  // csomagolva. Kivétel csak ott, ahol a szó tényleg azonos alakú.
  const gyanus = [];
  for (const tm of TEMAK) for (const l of NEM_ANGOL) {
    const f = temaSzoveg(tm, l);
    if (f.cim === tm.cim) gyanus.push(tm.id + '/' + l);
  }
  assert.deepEqual(gyanus, [],
    '🔴 a fordítás azonos az angollal (elfelejtett fordítás?): ' + gyanus.join(', '));
});

t('a leírás-mondat is nyelvenként külön', () => {
  for (const l of LANGS) assert.ok(typeof TEMA_LEIRAS[l] === 'function',
    '🔴 nincs leírás-sablon ehhez a nyelvhez: ' + l);
  // és tényleg eltérő szöveget ad
  const ki = new Set(LANGS.map(l => temaLeiras('X', 3, l)));
  assert.equal(ki.size, LANGS.length, '🔴 két nyelv ugyanazt a leírást adja');
  // ismeretlen nyelvnél angol, nem üres
  assert.equal(temaLeiras('X', 3, 'zz'), temaLeiras('X', 3, 'en'));
});

t('🔌 a buildTopicPage a NYELVI szöveget használja, nem a nyerset', () => {
  const f = src.slice(src.indexOf('function buildTopicPage'));
  const teste = f.slice(0, f.indexOf('\n}\n') + 3);
  assert.ok(/const sz = temaSzoveg\(t, LANG\)/.test(teste), '🔴 nincs nyelvi feloldás');
  assert.ok(/temaLeiras\(sz\.rovid, cikkek\.length, LANG\)/.test(teste), '🔴 a leírás nem nyelvi');
  // és a NYERS mezők NEM szerepelnek a kimenetben
  const nyersHasznalat = teste.match(/\$\{escapeHtml\(t\.(cim|rovid)\)\}|\$\{t\.(cim|rovid)\}|name: t\.cim/g) || [];
  assert.deepEqual(nyersHasznalat, [],
    '🔴 nyers (angol) téma-mező maradt a kimenetben: ' + nyersHasznalat.join(', '));
});

t('🔌 a /guides tetején lévő téma-sáv is nyelvi', () => {
  const f = src.slice(src.indexOf('function temaSav'));
  const teste = f.slice(0, f.indexOf('\n}\n') + 3);
  assert.ok(/temaSzoveg\(t, LANG\)\.cim/.test(teste),
    '🔴 a téma-sáv angol neveket írna a magyar/spanyol /guides tetejére');
});

t('🔴 minden CollectionPage url-jében ott a nyelvi előtag', () => {
  // A CollectionPage AZ ADOTT LAPOT írja le. Enélkül a /hu/ és /es/ változat
  // a gyökér-lapot állítja magáról — ellentmond a canonicalnak.
  const rossz = [];
  for (const m of src.matchAll(/'@type': 'CollectionPage'[^}]*?url: `([^`]+)`/g)) {
    if (!m[1].includes('${LP}')) rossz.push(m[1]);
  }
  const db = [...src.matchAll(/'@type': 'CollectionPage'/g)].length;
  console.log('     📏 ' + db + ' CollectionPage csomópont');
  assert.ok(db >= 3, 'kevesebb CollectionPage van, mint vártam: ' + db);
  assert.deepEqual(rossz, [], '🔴 nyelvi előtag NÉLKÜLI CollectionPage url: ' + rossz.join(', '));
});

t('⚠️ a WebSite és az Organization SZÁNDÉKOSAN előtag nélküli', () => {
  // Ez a teszt egy TÚLJAVÍTÁST zár ki. Ezek nem a lapot írják le, hanem az
  // oldalt / a szervezetet — nyelvtől független entitásokat.
  for (const tipus of ['WebSite', 'Organization']) {
    const m = new RegExp("'@type': '" + tipus + "'[^}]*?url: ([^,]+)").exec(src);
    if (!m) continue;
    assert.ok(!m[1].includes('${LP}'),
      '🔴 a(z) ' + tipus + ' csomópont nyelvi előtagot kapott — az nem a lapot írja le');
  }
});

t('a kiépített téma-lapok (tájékoztató)', () => {
  // A public/ a LEGUTÓBBI build — az újraépítésig még az angol címek vannak.
  const rossz = [];
  for (const l of NEM_ANGOL) for (const tm of TEMAK) {
    const p = join(ROOT, 'website', 'public', l, 'topic-' + tm.id + '.html');
    if (!existsSync(p)) continue;
    const cim = /<title>([^<]*)<\/title>/.exec(readFileSync(p, 'utf-8'))?.[1] || '';
    if (cim.includes(tm.cim)) rossz.push(l + '/' + tm.id);
  }
  if (rossz.length) console.log('     ⏳ a régi buildben még angol: ' + rossz.length + ' lap — az újraépítés javítja');
  else console.log('     ✅ a kiépített téma-lapokon nincs angol cím');
});

console.log(`\n✅ ${pass} teszt rendben`);
