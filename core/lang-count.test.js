// ===================================================================
// TESZT — a nyelvek SZÁMA sehol ne legyen kézzel beírva (2026-09-12)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI TÖRTÉNT
// A DE/FR 2026-08-25-én VÉGLEG törlődött, de HAT élő szöveg „5 nyelven"-en
// maradt: a Rólunk oldal MINDHÁROM nyelven, és a chatbot tudásbázisa
// ugyanígy. Élesben ellenőrizve 2026-09-12-én, 18 nappal a törlés után:
//     /about     → „five languages"
//     /hu/about  → „öt nyelven"
//     /es/about  → „cinco idiomas"
// Vagyis a BIZALMI OLDALUNK valótlant állított magáról, három nyelven, és
// a chatbot vissza is mondta. Nem elírás volt: a nyelvlista NYOLC helyen él
// kézzel, és csak EGY helyen van levezetve (core/llms-txt.js).
//
// 🔑 A JAVÍTÁS IRÁNYA: nem a helyes szám beírása, hanem hogy a szám ne
// LEHESSEN kézzel beírva. A `NYELV_SZAM` és a `nyelvSzo()` a SITE_LANGS-ból
// származik, így a következő nyelvi változás magától átvezetődik.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nyers = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
// ⚠️ A kommenteket kivágjuk: a fenti magyarázat MAGA is tartalmazza a régi,
// hamis szövegeket, és e nélkül a teszt saját magára illeszkedne.
const src = nyers.split('\n').filter(s => !/^\s*\/\//.test(s)).join('\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 a nyelvek száma nem lehet kézzel beírva\n');

// A SITE_LANGS a kanonikus lista — innen jön minden.
const LANGS = (/const SITE_LANGS = \[([^\]]+)\]/.exec(src)?.[1] || '')
  .split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);

t('a SITE_LANGS kiolvasható', () => {
  assert.ok(LANGS.length >= 1, 'nem találom a SITE_LANGS-ot');
  console.log('     📏 élő nyelvek: ' + LANGS.join(', ') + ' (' + LANGS.length + ')');
});

t('🔴 NINCS KÉZZEL BEÍRT NYELVSZÁM egyetlen élő szövegben sem', () => {
  // Számjeggyel ÉS betűvel, mindhárom nyelven. Ha egy szám valaha stimmelt is,
  // a következő nyelvi változás után némán hazuggá válik.
  // ⚠️ NINCS `\b` a szám-szavak előtt. Mutáció derítette ki: az `öt nyelven`
  // mutánst NEM a neki szánt állítás kapta el, mert a `\b` az ASCII-t nézi,
  // és az `ö` előtt nincs szóhatár. Helyette: nem-betű előzmény, `u` zászló.
  const ELOTTE = '(?:^|[^\\p{L}\\p{N}])';
  const tiltott = [
    new RegExp(ELOTTE + '\\d+ languages\\b', 'iu'),
    new RegExp(ELOTTE + '\\d+ nyelven', 'iu'),
    new RegExp(ELOTTE + '\\d+ idiomas\\b', 'iu'),
    new RegExp(ELOTTE + '(one|two|three|four|five|six|seven) languages\\b', 'iu'),
    new RegExp(ELOTTE + '(egy|két|kettő|három|négy|öt|hat|hét) nyelven', 'iu'),
    new RegExp(ELOTTE + '(un|dos|tres|cuatro|cinco|seis|siete) idiomas\\b', 'iu')
  ];
  const talalt = [];
  for (const rx of tiltott) {
    const m = rx.exec(src);
    if (m) talalt.push(m[0]);
  }
  assert.deepEqual(talalt, [],
    '🔴 kézzel beírt nyelvszám a build.js-ben: ' + talalt.join(', ')
    + '\n   Használd a NYELV_SZAM / nyelvSzo(lang) származtatott alakot.');
});

t('a származtatott alak LÉTEZIK és a SITE_LANGS-ból jön', () => {
  assert.ok(/const NYELV_SZAM = SITE_LANGS\.length;/.test(src),
    '🔴 a NYELV_SZAM nem a SITE_LANGS-ból származik');
  assert.ok(/function nyelvSzo\(lang\)/.test(src), '🔴 eltűnt a nyelvSzo()');
  // és tényleg HASZNÁLJÁK is — a puszta létezés nem bizonyíték
  const hasznalat = (src.match(/\$\{NYELV_SZAM\}|\$\{nyelvSzo\(/g) || []).length;
  assert.ok(hasznalat >= 6,
    '🔴 csak ' + hasznalat + ' helyen használjuk (várt: legalább 6 — 3 chatbot + 3 Rólunk)');
  console.log('     📏 ' + hasznalat + ' helyen behelyettesítve');
});

t('minden élő nyelvhez van szó-alak a jelenlegi nyelvszámra', () => {
  const blokk = /const NYELV_BETUVEL = \{([\s\S]*?)\n\};/.exec(src);
  assert.ok(blokk, '🔴 nem találom a NYELV_BETUVEL táblát');
  for (const l of LANGS) {
    const sor = new RegExp("\\b" + l + ":\\s*\\[([^\\]]+)\\]").exec(blokk[1]);
    assert.ok(sor, '🔴 nincs szó-alak ehhez a nyelvhez: ' + l);
    const szavak = sor[1].split(',').length;
    assert.ok(szavak > LANGS.length,
      '🔴 a(z) ' + l + ' szó-listája túl rövid: ' + szavak + ' elem, de ' + LANGS.length + ' nyelv van');
  }
});

t('a kisszótár adatai csak élő nyelveket tartalmaznak', () => {
  const p = join(ROOT, 'website', 'glossary-data.json');
  if (!existsSync(p)) { console.log('     ⏭️  kihagyva: nincs glossary-data.json'); return; }
  const j = JSON.parse(readFileSync(p, 'utf-8'));
  const mezok = new Set();
  for (const x of j.terms || []) for (const k of Object.keys(x)) mezok.add(k);
  const halott = [...mezok].filter(k => k === 'de' || k === 'fr');
  console.log('     📏 ' + (j.terms || []).length + ' fogalom · mezők: ' + [...mezok].join(', '));
  assert.deepEqual(halott, [], '🔴 halott nyelv-adat a kisszótárban: ' + halott.join(', '));
});

t('a kiépített Rólunk oldal (tájékoztató)', () => {
  // SZÁNDÉKOSAN nem állítás: a public/ a LEGUTÓBBI build, tehát az
  // újraépítésig még a régi, hamis szöveg van benne. A forrás-oldali
  // állítások fentebb már foghatnak.
  const jo = [], rossz = [];
  for (const l of LANGS) {
    const p = join(ROOT, 'website', 'public', l === 'en' ? 'about.html' : join(l, 'about.html'));
    if (!existsSync(p)) continue;
    const h = readFileSync(p, 'utf-8');
    // ⚠️ NINCS `\b` a csoport előtt: az ékezetes kezdőbetűnél (ö, é) a
    // szóhatár nem úgy viselkedik, mint az ASCII-nál, és a magyar találat
    // némán kimaradt. Helyette a nem-betű előzményt írjuk elő.
    const m = /(?:^|[^\p{L}])(one|two|three|four|five|six|egy|két|három|négy|öt|hat|un|dos|tres|cuatro|cinco|seis)\s+(languages|nyelven|idiomas)/iu.exec(h);
    (m ? rossz : jo).push(l + (m ? ': „' + m[0] + '"' : ''));
  }
  if (rossz.length) console.log('     ⏳ a régi buildben még: ' + rossz.join(' · ') + ' — az újraépítés javítja');
  else if (jo.length) console.log('     ✅ a kiépített lapokon nincs kézzel írt nyelvszám');
  else console.log('     ⏭️  kihagyva: nincs kiépített Rólunk oldal');
});

console.log(`\n✅ ${pass} teszt rendben`);
