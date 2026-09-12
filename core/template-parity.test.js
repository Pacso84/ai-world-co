// ===================================================================
// PARITÁS-ŐR — a két cikk-sablon nem sodródhat el egymástól
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT LÉTEZIK
// A `website/build.js`-ben KÉT cikk-sablon van: `buildArticlePage()` (hír)
// és `buildGuidePage()` (útmutató). NÉGY külön alkalommal került egy javítás
// csak az egyikbe, mindannyiszor NÉMÁN, és mindannyiszor VÉLETLENÜL derült ki:
//   2026-08-25  közép-doboz            → 359 útmutató kapott nullát
//   2026-09-09  támogatás-sor          → a lapok 55%-át érte el
//   2026-09-10  második közép-doboz    → a belépők 61%-a kimaradt
//   2026-09-12  szövegbeli linkelés, „In short"-doboz, 4 törzs-szabály
//
// Az eddigi őrök FUNKCIÓNKÉNT néznek egy-egy hívást. Ez az őr fordítva
// dolgozik: a KIÉPÍTETT KIMENETEN hasonlítja össze a két sablont, és
// megszólal, ha ÚJ, meg nem magyarázott eltérés jelenik meg.
//
// HOGYAN
// Minden osztálynévre kiszámoljuk, a hírek és az útmutatók hány százalékán
// fordul elő a CIKK-RÉGIÓBAN. Ami az egyik oldalon gyakori (≥30%) és a
// másikon gyakorlatilag nincs (≤2%), az ELTÉRÉS. Minden eltérésnek szerepelnie
// kell alább, INDOKKAL — különben a teszt elbukik.
//
// MÉRVE: a fenti négyből HÁROM megszólaltatja ezt az őrt (a kimenet
// másolatán újrajátszva; a 09-10-i kivételével — lásd rögtön alább).
//
// ⚠️ AMIT EZ AZ ŐR NEM LÁT (őszintén):
//   • 🔴 A DARABSZÁMOT. A 2026-09-10-i hibát NEM fogta volna meg: ott a
//     MÁSODIK közép-doboz maradt ki, de az ELSŐ ott volt, és mindkettő
//     ugyanazt a `midread` osztályt viseli. Jelenlét ≠ mennyiség.
//   • a 30%-os küszöb alatti eltérést (pl. egy funkció a hírek 20%-án),
//   • ami nem osztálynévben vagy tagben jelenik meg (szöveg, attribútum, CSS),
//   • a `/hu/` és `/es/` kimenetet — csak az angol gyökeret nézi,
//   • és semmit, amíg nincs friss build.
// Ez tehát HÁLÓ, nem bizonyíték. A funkciónkénti bekötés-őrök megmaradnak.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// A mappa felülírható, hogy az ŐRT MAGÁT is próbára lehessen tenni: a
// mutációs teszt a kimenet MÁSOLATÁN szimulálja a négy korábbi hibát, és
// megnézi, megszólal-e. Élesben mindig az alapértelmezett út érvényes.
const PUB = process.env.PARITY_PUB_DIR || join(ROOT, 'website', 'public', 'article');

const JELEN = 0.30;   // ennyi lapon legyen jelen az egyik oldalon
const HIANY = 0.02;   // és eddig hiányozzon a másikról

// -------------------------------------------------------------------
// SZÁNDÉKOS ELTÉRÉSEK — mindegyik mellett OTT AZ INDOK.
// Ez a lista a lényeg: nem az a kérdés, hogy van-e eltérés, hanem hogy
// TUDUNK-E RÓLA. Új sort csak akkor vegyél fel, ha a különbség tényleg
// szándékos — ha nem az, a javítás a build.js-be való, nem ide.
// -------------------------------------------------------------------
const CSAK_HIR = {
  'article__body': 'A magazin-tipográfia burkolója: iniciálé + 28px h2. Az útmutató '
    + 'SAJÁT g-* készletet kapott, ott ez szándékosan nincs — a hiányzó darabokat '
    + '2026-09-12-én célzottan pótoltuk (lásd core/guide-intro.test.js).',
  'article__tags': 'Címke-cédulák. Az útmutató fejlécében már van cédulasor '
    + '(g-tool + g-official + g-level), és a címkék sehol nem kattinthatók. '
    + '⚠️ BIZONYTALAN: lehet szándékos zsúfoltság-kerülés, de nincs róla döntés.',
  'minitag': 'Az article__tags cédulái — ugyanaz a kérdés, ugyanaz a bizonytalanság.',
  'cat-other': 'Kategória-osztály. Az útmutató mindig cat-guide, a hír a saját '
    + 'kategóriáját kapja — ez a besorolás természetéből következik.',
  'cat-howto': 'Szintén kategória-osztály. A „how-to" itt a HÍR egyik témája '
    + '(pl. egy hír arról, hogy egy eszköz új útmutatót kapott) — nem azonos a '
    + 'guide műfajjal, amely mindig cat-guide osztályt kap.'
};

// FOLYAMATBAN — a kódban MÁR javítva, de a kimeneten még a régi build látszik.
// Ha egy sor itt „megjavul", a teszt SZÁNDÉKOSAN elbukik: az a jelzés, hogy
// a sort törölni kell. (Ez a minta 2026-09-11-én már bevált egyszer.)
const FOLYAMATBAN = {
  'guide-link': 'Szövegbeli belső linkelés — a2dbea68 (2026-09-12) bekötötte az '
    + 'útmutatóba is; az újraépítés után 175 útmutatón meg kell jelennie.',
  'lede': '„In short"-doboz — 0165a602 (2026-09-12) bekötötte az útmutatóba is; '
    + 'az újraépítés után 204 útmutatón meg kell jelennie.'
};

// Az útmutató MŰFAJI jelölése. Ezek nem „eltérések", hanem maga a műfaj:
// lépéssor, folyamat-térkép, GYIK, borító. Előtag-szabállyal engedjük.
const UTMUTATO_ELOTAG = [/^g-/, /^guide-/, /^guide$/, /^cat-guide$/];

const TAG_SZANDEKOS = {
  nav: 'A folyamat-térkép (g-map) lépés-navigációja — a hírnek nincs lépéssora.',
  details: 'A GYIK nyitható elemei — a hírben nincs GYIK.',
  summary: 'A GYIK-elemek fejléce, a <details> párja.'
};

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 paritás-őr: hír ↔ útmutató\n');

// -------------------------------------------------------------------
function torzs(h) {
  // CSAK a cikk-régió: a fejléc és a lábléc közös, ott nincs mit összevetni.
  const a = h.indexOf('<article');
  const r = h.indexOf('<footer class="site-footer"');
  return a < 0 ? '' : h.slice(a, r > 0 ? r : h.length);
}
function gyujt(lapok, rx, hanyadik) {
  const m = new Map();
  for (const h of lapok) {
    const it = new Set();
    for (const c of torzs(h).matchAll(rx))
      for (const k of String(c[hanyadik]).split(/\s+/)) if (k) it.add(k);
    for (const k of it) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

const van = existsSync(PUB);
const lapok = van ? readdirSync(PUB).filter(f => f.endsWith('.html'))
  .map(f => readFileSync(join(PUB, f), 'utf-8')) : [];
const utm = lapok.filter(h => h.includes('class="g-steps"'));
const hir = lapok.filter(h => !h.includes('class="g-steps"'));

t('van mit összehasonlítani', () => {
  if (!van) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  assert.ok(utm.length >= 50 && hir.length >= 50,
    'túl kevés lap az összevetéshez: ' + utm.length + ' útmutató, ' + hir.length + ' hír');
  console.log(`     📏 ${hir.length} hír · ${utm.length} útmutató`);
});

function elteresek() {
  const RX = /class="([^"]+)"/g;
  const U = gyujt(utm, RX, 1), H = gyujt(hir, RX, 1);
  const csakHir = [], csakUtm = [];
  for (const k of new Set([...U.keys(), ...H.keys()])) {
    const u = (U.get(k) || 0) / utm.length, h = (H.get(k) || 0) / hir.length;
    if (h >= JELEN && u <= HIANY) csakHir.push(k);
    else if (u >= JELEN && h <= HIANY) csakUtm.push(k);
  }
  return { csakHir, csakUtm };
}

t('🔴 NINCS MEGMAGYARÁZATLAN, CSAK A HÍRBEN LÉVŐ ELEM', () => {
  // EZ AZ ŐR LÉNYEGE. A négy eddigi hiba MIND ilyen alakú volt: egy funkció
  // megjelent a hírben, és néma maradt az útmutatóban.
  if (!van || !utm.length || !hir.length) { console.log('     ⏭️  kihagyva'); return; }
  const { csakHir } = elteresek();
  const ismeretlen = csakHir.filter(k => !(k in CSAK_HIR) && !(k in FOLYAMATBAN));
  console.log(`     📏 ${csakHir.length} csak-hír osztály · ${Object.keys(CSAK_HIR).length} szándékos `
    + `· ${Object.keys(FOLYAMATBAN).length} folyamatban`);
  assert.deepEqual(ismeretlen, [],
    '🔴 ÚJ, MEG NEM MAGYARÁZOTT eltérés — a hírben van, az útmutatóban nincs: ' + ismeretlen.join(', ')
    + '\n   Ha ez szándékos, vedd fel a CSAK_HIR listába INDOKKAL.'
    + '\n   Ha nem az, a javítás a website/build.js útmutató-ágába való.');
});

t('az útmutató csak MŰFAJI többletet hoz', () => {
  if (!van || !utm.length || !hir.length) { console.log('     ⏭️  kihagyva'); return; }
  const { csakUtm } = elteresek();
  const ismeretlen = csakUtm.filter(k => !UTMUTATO_ELOTAG.some(rx => rx.test(k)));
  console.log(`     📏 ${csakUtm.length} csak-útmutató osztály (lépéssor, térkép, GYIK, borító)`);
  assert.deepEqual(ismeretlen, [],
    '🔴 az útmutatóban olyan elem van, ami nem a műfaji készletből való, és a hírből hiányzik: '
    + ismeretlen.join(', ') + '\n   Lehet, hogy ez a HÍRBŐL maradt ki.');
});

t('🔔 a FOLYAMATBAN lista nem avulhat el', () => {
  // Ha egy bejegyzés már NEM eltérés (mert az újraépítés megtörtént), akkor
  // a sor FÖLÖSLEGES — és a lista csendben elrothadna. Ez a bukás JÓ HÍR.
  if (!van || !utm.length || !hir.length) { console.log('     ⏭️  kihagyva'); return; }
  const { csakHir } = elteresek();
  const elavult = Object.keys(FOLYAMATBAN).filter(k => !csakHir.includes(k));
  assert.deepEqual(elavult, [],
    '✅ MEGJAVULT (ez jó hír!): ' + elavult.join(', ') + ' — már az útmutatóban is ott van.'
    + '\n   TÖRÖLD ezeket a sorokat a FOLYAMATBAN listából.');
});

t('tag-szintű eltérés is csak indokkal', () => {
  if (!van || !utm.length || !hir.length) { console.log('     ⏭️  kihagyva'); return; }
  const RX = /<([a-z][a-z0-9]*)\b/g;
  const U = gyujt(utm, RX, 1), H = gyujt(hir, RX, 1);
  const ismeretlen = [];
  for (const k of new Set([...U.keys(), ...H.keys()])) {
    const u = (U.get(k) || 0) / utm.length, h = (H.get(k) || 0) / hir.length;
    const elter = (h >= JELEN && u <= HIANY) || (u >= JELEN && h <= HIANY);
    if (elter && !(k in TAG_SZANDEKOS)) ismeretlen.push(k);
  }
  assert.deepEqual(ismeretlen, [],
    '🔴 meg nem magyarázott TAG-eltérés a két sablon között: <' + ismeretlen.join('>, <') + '>');
});

t('minden felsorolt eltérés mellett VAN indok', () => {
  // A lista csak akkor ér valamit, ha olvasható. Egy üres vagy odavetett
  // indok ugyanolyan rossz, mint a hiányzó.
  for (const [n, lista] of [['CSAK_HIR', CSAK_HIR], ['FOLYAMATBAN', FOLYAMATBAN], ['TAG', TAG_SZANDEKOS]])
    for (const [k, indok] of Object.entries(lista))
      assert.ok(typeof indok === 'string' && indok.length >= 40,
        '🔴 ' + n + '.' + k + ' indoka túl rövid vagy hiányzik — mondd meg, MIÉRT szándékos');
});

console.log(`\n✅ ${pass} teszt rendben`);
