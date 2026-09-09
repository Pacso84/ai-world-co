// ===================================================================
// TESZT — TÁMOGATÁS-SOR: ott van-e, ahol a látogató NÉZ? (2026-09-09)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI VOLT A BAJ. A Ko-fi támogatás-gomb 2026-07-30 óta „be volt kötve" —
// KIZÁRÓLAG a `/support` oldalon. Megmérve a forgalmi naplóból, 37 nap:
//
//     a /support oldalon járt látogatók száma: 0
//
// 🔑 Az egyetlen bevételi csatornánk nem PIACI okból hozott nullát, hanem
// SZERKEZETILEG: olyan lapon állt, ahova senki nem megy. Ugyanaz az
// alakzat, mint az i18n-őrszemé, ami csak a CI-naplóba írt.
// A forgalom 92%-a CIKKRE érkezik — oda került.
//
// ⚠️ ÉS EZ A TESZT EGY VALÓDI, FRISS HIBÁBÓL SZÜLETETT. Az első
// beépítésem CSAK a hír-oldalakra tette ki a sort: a `website/build.js`
// KÉT külön cikk-építőt tartalmaz (`buildArticlePage` a híreknek,
// `buildGuidePage` az útmutatóknak). Kimérve a kimeneten: 1539/2805 = 55%.
// A kimaradt 422 angol útmutató (+ fordításaik) épp az ÖRÖKZÖLD tartalom,
// ami a forgalom 61%-át hozza. Csak a MÉRÉS mutatta meg — a kód olvasása
// nem. Ezért néz ez a teszt MINDKÉT irányból: forrás ÉS kimenet.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'website', 'public');

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 támogatás-sor — ott van-e, ahol a látogató néz\n');

// ⚠️ A KOMMENTEKET LEVÁGJUK. A `build.js` fejlécei is leírják a függvények
// nevét — egy kivágott hívást a puszta névkeresés zölden átengedne.
// (Ez élesben megtörtént velem 2026-09-08-án, a felújítás-kapunál.)
const nyersBuild = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
const build = nyersBuild.split('\n').filter(s => !s.trim().startsWith('//')).join('\n');

// ===================================================================
// 1. FORRÁS — MINDEN cikk-lábléc kapja meg
// ===================================================================
t('🔑 MINDEN cikk-lábléc hívja a támogatás-sort (nem csak az egyik építő)', () => {
  // EZ A LÉNYEG. A build.js két külön cikk-oldalt épít, és az első
  // változatom az egyiket kihagyta. A `article__foot` az a jelölő, ami
  // MINDEN cikk-oldalon ott van — ha egy HARMADIK építő születne, ez a
  // lépés arra is szólna.
  // ⚠️ A LEZÁRÓ `</div>`-ig illeszteni HIBÁS, és ezt élesben megtanultam:
  // a láblécen BELÜL van egy `<div class="fb">…</div>`, amin a nem-mohó
  // minta megáll — így a keresett hívás kimarad a befogott szövegből, és a
  // teszt HAMISAN bukott, miközben a kimenet 2805/2805-ön állt. A `back-link`
  // a lábléc UTOLSÓ eleme, az a megbízható zárójel.
  const lablecek = [...build.matchAll(/<div class="article__foot">([\s\S]{0,900}?)back-link/g)];
  assert.ok(lablecek.length >= 2,
    'csak ' + lablecek.length + ' cikk-láblécet találok — a teszt elavult, nézd meg a build.js-t');
  const kimaradt = lablecek.filter(m => !/supportLine\(\)/.test(m[1])).length;
  assert.equal(kimaradt, 0,
    '⚠️ ' + kimaradt + ' cikk-lábléc NEM kapja meg a támogatás-sort (' + lablecek.length + '-ből) — '
    + 'pontosan ez a hiba fordult elő 2026-09-09-én: az útmutatók kimaradtak');
});

t('🔑 a sor NÉMA, ha nincs beállítva támogatás-cím', () => {
  // Enélkül egy üres `support_url` csonka linket írna ki minden oldalra.
  const fv = build.match(/function supportLine\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fv, 'nincs supportLine() függvény');
  assert.ok(/if\s*\(!SUPPORT\.enabled\s*\|\|\s*!SUPPORT\.url\)\s*return\s*''/.test(fv[1]),
    'a supportLine() nem lép ki üres/kikapcsolt beállításnál: ' + fv[1].slice(0, 120));
});

t('🔑 a link ÚJ ABLAKBAN nyílik, biztonságosan', () => {
  const fv = build.match(/function supportLine\(\)[\s\S]*?\n\}/)[0];
  assert.ok(/rel="noopener noreferrer"/.test(fv), 'hiányzik a rel="noopener noreferrer"');
  assert.ok(/target="_blank"/.test(fv), 'a támogatás-link elviszi az olvasót a cikkről');
});

// ===================================================================
// 2. AZ ÁLLÍTÁS IGAZSÁGA — „nincs hirdetés, nincs fizetőfal"
// ===================================================================
t('🚨 az „nincs hirdetés" állítás IGAZ marad (hirdetés-kód sehol)', () => {
  // A sor szó szerint azt állítja: „no ads, no paywall". Ha valaha
  // hirdetés kerül az oldalra, ez a mondat HAZUDNI fog — és a hazug
  // mondat rosszabb, mint a hiányzó. A projekt szabálya: minden állítás
  // csak annyit mondjon, amennyit mér.
  const gyanus = /adsbygoogle|googlesyndication|pagead2|doubleclick|carbonads|ezoic|mediavine/i;
  const helyek = [join(ROOT, 'website', 'build.js'), join(ROOT, 'website', 'assets', 'style.css')];
  for (const h of helyek) {
    if (!existsSync(h)) continue;
    assert.ok(!gyanus.test(readFileSync(h, 'utf-8')),
      '⚠️ HIRDETÉS-KÓD került a projektbe (' + h.replace(ROOT, '') + '), de a cikkek alja azt állítja, hogy nincs. '
      + 'Vagy a kód menjen, vagy a mondat változzon.');
  }
});

// ===================================================================
// 3. AZ ÉPÍTETT KIMENETEN — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
console.log('\n🧪 az épített kimeneten (ha van helyi build)');

const cikkOldalak = () => {
  const ki = [];
  const jar = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) jar(p); else if (e.name.endsWith('.html')) ki.push(p);
    }
  };
  if (existsSync(PUBLIC)) jar(PUBLIC);
  return ki.filter(p => /[\\/]article[\\/]/.test(p));
};

t('🔑 ÉLES: MINDEN cikk-oldal megkapja (ez fogta meg az 55%-os hibát)', () => {
  const cikkek = cikkOldalak();
  if (!cikkek.length) { console.log('     (nincs helyi build — kihagyva; a CI a build ELŐTT tesztel)'); return; }
  const nelkul = cikkek.filter(p => !readFileSync(p, 'utf-8').includes('support-foot'));
  console.log('     ↳ ' + (cikkek.length - nelkul.length) + '/' + cikkek.length + ' cikk-oldalon ott van');
  assert.equal(nelkul.length, 0,
    nelkul.length + ' cikk-oldalról hiányzik, pl. ' + (nelkul[0] || '').replace(PUBLIC, ''));
});

t('🔑 ÉLES: mind a három nyelven a SAJÁT nyelvén szól', () => {
  const cikkek = cikkOldalak();
  if (!cikkek.length) return;
  const vart = { '': /Free to read/, 'hu': /Ingyenes, hirdetés/, 'es': /Gratis, sin anuncios/ };
  // 2026-09-10, user-döntés: ÖNKÉNTES HAVI támogatás — fizetőfal NÉLKÜL.
  // Az előzmény: felmerült, hogy az örökzöld útmutatók legyenek fizetősek.
  // Kimérve elvetettük: 1,17 oldal/látogató (a tipikus olvasó EGY cikket
  // olvas), a forgalom 62%-a útmutatóra érkezik, és a fizetőfal leállítaná a
  // Facebook-motort, ami a forgalom 82%-át hozza. A havi támogatás tehát
  // KÉRÉS, nem kapu. A szövegnek ezt kell tükröznie: a link mondja ki, hogy
  // egyszeri VAGY havi lehet.
  const havi = { '': /one-off or monthly/i, 'hu': /egyszeri vagy havi/i, 'es': /puntual o mensual/i };
  for (const [nyelv, rx] of Object.entries(vart)) {
    const d = join(PUBLIC, nyelv, 'article');
    if (!existsSync(d)) continue;
    const f = readdirSync(d).filter(x => x.endsWith('.html'))[0];
    if (!f) continue;
    const sor = (readFileSync(join(d, f), 'utf-8').match(/<p class="support-foot">[\s\S]*?<\/p>/) || [''])[0];
    assert.match(sor, rx, '/' + nyelv + ' nem a saját nyelvén kapta a sort: ' + sor.slice(0, 90));
    assert.match(sor, havi[nyelv],
      '⚠️ /' + nyelv + ': eltűnt a HAVI lehetőség a támogatás-sorból (user-döntés 2026-09-10): ' + sor.slice(0, 110));
  }
});

t('🚨 NINCS fizetőfal-szöveg sehol (a támogatás KÉRÉS, nem KAPU)', () => {
  // ⚠️ USER-DÖNTÉS 2026-09-10, mérésre alapozva: az örökzöld útmutatók NEM
  // lesznek fizetősek. 1,17 oldal/látogató — a tipikus olvasó EGY cikket
  // olvas, tehát egy „olvasd mindet" előfizetésnek nincs közönsége; közben a
  // fizetőfal a forgalom 62%-át érintené, és leállítaná a Facebook-motort
  // (a forgalom 82%-a), amit a Meta ajánlómotorja hajt.
  const tiltott = /paywall.{0,20}(active|enabled)|subscribers only|members only|unlock this (guide|article)|sign in to read/i;
  const cikkek = cikkOldalak();
  if (!cikkek.length) return;
  for (const p of cikkek.slice(0, 60)) {
    const html = readFileSync(p, 'utf-8');
    assert.ok(!tiltott.test(html),
      '⚠️ FIZETŐFAL-SZÖVEG került egy cikkre: ' + p.replace(PUBLIC, ''));
  }
});

t('🔑 ÉLES: a meglévő lábléc-elemek ÉPEK maradtak', () => {
  // A beszúrás nem törhet el mást. Ha bármelyik szám elmarad a cikkszámtól,
  // a lábléc sérült.
  const cikkek = cikkOldalak();
  if (!cikkek.length) return;
  for (const jel of ['ai-disclosure', 'back-link', 'class="fb"']) {
    const n = cikkek.filter(p => readFileSync(p, 'utf-8').includes(jel)).length;
    assert.equal(n, cikkek.length, jel + ' csak ' + n + '/' + cikkek.length + ' oldalon van meg');
  }
});

t('a listaoldalakra NEM kerül (csak a cikkek alján van értelme)', () => {
  const idx = join(PUBLIC, 'index.html');
  if (!existsSync(idx)) return;
  assert.ok(!readFileSync(idx, 'utf-8').includes('support-foot'),
    'a főoldalra is kikerült a támogatás-sor — oda nem szántuk');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} support-line.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
