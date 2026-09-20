// ===================================================================
// TESZT — CSOMAG-REKLÁM REEL (2026-09-20)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A user két dolgot kért kifejezetten:
//   1. legyen önálló reklám-videó, aminek NINCS köze hírhez/útmutatóhoz
//   2. „árak ne jelenjenek meg a reel videokban"
//
// A 2. pont az, amit egy későbbi szerkesztés a legkönnyebben elronthat
// („írjuk oda, hogy csak 3 dollár, úgy jobban fog"), ezért az ÁR-TILALOM
// itt kapu, nem jószándék. A tilalom az ÁRRA szól, nem a számjegyre: az
// első tábla az útmutatók DARABSZÁMÁT mondja, annak bent kell maradnia.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promoKell, promoKartyak, promoCaption, PROMO_NAP, PROMO_SZUNET_NAP, PROMO_UT } from './packs-reel.js';
import { maiPromo } from './reel-post.js';
import { SZOVEG_MAX_SZELES, BETU_ARANY, SZOVEG_MIN_MERET, ALCIM_MERET, ALCIM_ARANY } from './short-video.js';

const ROOT_T = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 csomag-reklám Reel\n');

const KARTYAK = promoKartyak({ utmutatoDb: 449 }).cards;
/** Minden látható és kimondott szöveg egy kártyán. */
const kartyaSzoveg = (c) => [c.nagy, c.kicsi, c.mond].join(' ');

// ===================================================================
// 1. ÁR NEM JELENHET MEG — a user kifejezett kérése
// ===================================================================
const ARJEL = /\$|\b\d+\s*(?:usd|eur|dollars?|euros?)\b|\bfor (?:just )?\d+\b|\bonly \d+\b/i;

t('🔑 egyetlen kártyán sincs ár (se $, se „dollar", se „USD")', () => {
  for (const c of KARTYAK) {
    const sz = kartyaSzoveg(c);
    assert.ok(!ARJEL.test(sz), 'ár a kártyán: ' + sz);
  }
});

t('🔑 a felirat sem tartalmaz árat', () => {
  const f = promoCaption({ utmutatoDb: 449 });
  assert.ok(!ARJEL.test(f), 'ár a feliratban: ' + f);
});

t('🔬 [hitelesítés] az ár-kapu MINDKÉT irányba jól dönt', () => {
  // Enélkül egy elrontott minta minden szövegre zöldet adna, és a fenti két
  // lépés díszlet lenne. Házszabály: ismert esettel, mindkét irányból.
  const FOGNIA_KELL = ['Just $3', 'only 3 dollars', 'All nine for 9 USD', 'for just 3'];
  const ÁT_KELL_ENGEDNIE = [
    '449 free AI guides',                 // darabszám, nem ár
    'Plan a week of dinners',
    'Read them offline',
    'aiworldhq .com/packs'
  ];
  for (const s of FOGNIA_KELL) assert.ok(ARJEL.test(s), 'a kapu ÁTENGEDTE: ' + s);
  for (const s of ÁT_KELL_ENGEDNIE) assert.ok(!ARJEL.test(s), 'a kapu HAMISAN fogta meg: ' + s);
});

// ===================================================================
// 2. ŐSZINTESÉG — ár nélkül reklámozni csak így szabad
// ===================================================================
t('🔑 az első tábla kimondja, hogy az útmutatók INGYENESEK', () => {
  // Ez az egyensúly az ár elhagyásáért. Ha a videó nem mondaná ki, hogy az
  // útmutatók ingyen vannak, a néző azt hihetné, a csomag is az.
  assert.match(kartyaSzoveg(KARTYAK[0]), /\bfree\b/i, 'az első tábla nem mondja ki, hogy ingyenes');
});

t('a záró tábla az eladó oldalra visz, nem a boltba közvetlenül', () => {
  // A bolt ára és feltételei az OLDALON vannak elmagyarázva; oda visszük.
  const zaro = KARTYAK[KARTYAK.length - 1];
  assert.ok(kartyaSzoveg(zaro).includes('/packs'), 'a záró tábla nem a /packs-ra mutat');
  assert.ok(promoCaption().includes(PROMO_UT), 'a felirat linkje nem a /packs');
});

t('🔑 az útmutató-szám NEM beégetett — más bemenet, más kimenet', () => {
  // Egy beégetett „449" fél év múlva hazugság lenne.
  const a = promoKartyak({ utmutatoDb: 449 }).cards[0].nagy;
  const b = promoKartyak({ utmutatoDb: 512 }).cards[0].nagy;
  assert.notEqual(a, b, 'a szám nem követi a bemenetet — beégetve maradt');
  assert.ok(b.includes('512'), 'a kártya nem a kapott számot mutatja');
});

t('szám nélkül NINCS videó (a hallgatás a biztonságos irány)', () => {
  for (const rossz of [0, -1, NaN, null, undefined, 'sok']) {
    assert.equal(promoKartyak({ utmutatoDb: rossz }).cards, null, 'videót gyártott ebből: ' + String(rossz));
  }
});

// ===================================================================
// 3. A KÁRTYÁK BELEFÉRNEK — ugyanaz a mérce, ami a napi Reelt védi
// ===================================================================
t('🔑 egyetlen nagy szöveg sem lóg ki a vászonból', () => {
  for (const c of KARTYAK) {
    const sorok = String(c.nagy).split('\n');
    assert.ok(sorok.length <= 3, 'több mint 3 sor: ' + JSON.stringify(c.nagy));
    const alap = sorok.length <= 2 ? 138 : 116;
    const leghosszabb = Math.max(1, ...sorok.map(s => s.length));
    const meret = Math.max(SZOVEG_MIN_MERET, Math.min(alap, Math.floor(SZOVEG_MAX_SZELES / (leghosszabb * BETU_ARANY))));
    const szeles = leghosszabb * meret * BETU_ARANY;
    assert.ok(szeles <= SZOVEG_MAX_SZELES + 1,
      'túl széles: ' + JSON.stringify(c.nagy) + ' → ' + Math.round(szeles) + 'px');
  }
});

t('az alcímek is beleférnek', () => {
  for (const c of KARTYAK) {
    const fer = Math.floor(SZOVEG_MAX_SZELES / (String(c.kicsi).length * ALCIM_ARANY));
    assert.ok(Math.min(ALCIM_MERET, fer) >= 40,
      'az alcím olyan hosszú, hogy eltűnne: ' + c.kicsi);
  }
});

t('🔑 a tördelő nem nyelt le szót', () => {
  // A `tordel()` a 3. sor után VÁG. Ha egy kártya szövege hosszabb lenne,
  // a videó néma csonkot mutatna — és a `mond` mező kimondaná a teljeset,
  // vagyis a kép és a hang elválna.
  const nyersek = ['449 free AI guides', 'Reply to a hard email', 'Spot a scam text',
    'Plan a week of dinners', 'Now in PDF packs', 'Read them offline'];
  KARTYAK.slice(0, nyersek.length).forEach((c, i) => {
    const kepen = String(c.nagy).replace(/\n/g, ' ');
    assert.equal(kepen, nyersek[i], 'a tördelő megcsonkította: ' + nyersek[i] + ' → ' + kepen);
  });
});

t('a videó hossza a Reels-sávban marad (7 tábla)', () => {
  assert.equal(KARTYAK.length, 7, 'a táblák száma megváltozott: ' + KARTYAK.length);
});

// ===================================================================
// 4. AZ ÜTEMEZÉS — mikor megy, és mikor NEM
// ===================================================================
/** Egy adott hétköznaphoz tartozó UTC időbélyeg. 2026-09-20 vasárnap volt. */
const VASARNAP = Date.parse('2026-09-20T12:00:00Z');
const HETFO = Date.parse('2026-09-21T12:00:00Z');

t('a promó napja tényleg vasárnap', () => {
  assert.equal(new Date(VASARNAP).getUTCDay(), PROMO_NAP);
});

t('🔑 KIKAPCSOLT bolt esetén SOHA nem megy — akkor sem, ha minden más stimmel', () => {
  // Üres boltot reklámozni rosszabb, mint nem reklámozni semmit.
  const r = promoKell({ live: false, now: VASARNAP, utolso: '' });
  assert.equal(r.kell, false);
  assert.match(r.ok, /live/);
});

t('vasárnap, élő bolttal, előzmény nélkül: MEGY', () => {
  assert.equal(promoKell({ live: true, now: VASARNAP, utolso: '' }).kell, true);
});

t('hétfőn NEM megy', () => {
  assert.equal(promoKell({ live: true, now: HETFO, utolso: '' }).kell, false);
});

t('🔑 ugyanazon a napon nem megy kétszer', () => {
  const r = promoKell({ live: true, now: VASARNAP, utolso: '2026-09-20T02:31:00Z' });
  assert.equal(r.kell, false, 'kétszer ment volna ki egy nap');
});

t('a szünet betartatva: a következő vasárnap már mehet', () => {
  const kovetkezo = VASARNAP + 7 * 86400000;
  assert.equal(promoKell({ live: true, now: kovetkezo, utolso: '2026-09-20T12:00:00Z' }).kell, true);
  // …de a szünetnél frissebb előzmény blokkol (ha valaki a napot átállítaná)
  const korai = VASARNAP + (PROMO_SZUNET_NAP - 1) * 86400000;
  if (new Date(korai).getUTCDay() === PROMO_NAP) {
    assert.equal(promoKell({ live: true, now: korai, utolso: '2026-09-20T12:00:00Z' }).kell, false);
  }
});

t('olvashatatlan időbélyeg NEM némítja el örökre a csatornát', () => {
  // A hibás mező miatt inkább menjen ki egy videó, mint hogy hónapokig
  // csend legyen úgy, hogy senki nem veszi észre.
  assert.equal(promoKell({ live: true, now: VASARNAP, utolso: 'ez nem dátum' }).kell, true);
});

// ===================================================================
// 5. A BEKÖTÉS — vasárnap NE menjen ki KÉT videó
// ===================================================================
// Ez a legdrágább elrontható dolog ebben a munkában: a `prepare` naponta
// háromszor fut, a promó viszont NEM jelöl meg cikket. Ha a promó-ág nem
// `return`-öl, a délutáni futás vidáman gyárt mellé egy útmutató-Reelt is.
const reelPostForras = readFileSync(join(ROOT_T, 'core', 'reel-post.js'), 'utf-8')
  .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');

t('🔑 a promó-ág a cikk-kiválasztás ELŐTT áll és return-öl', () => {
  const promoHely = reelPostForras.indexOf('kellPromo.kell || maMarPromo');
  const valasztasHely = reelPostForras.indexOf('const valasztott = kovetkezoReel(');
  assert.ok(promoHely > 0, 'nincs promó-ág a prepare-ben');
  assert.ok(valasztasHely > promoHely,
    'a cikk-kiválasztás a promó-ág ELŐTT fut — vasárnap két videó menne ki');
  const ag = reelPostForras.slice(promoHely, valasztasHely);
  assert.ok(/return \{ betu: rp\.betu \};/.test(ag), 'a promó-ág nem return-öl a gyártás után');
  assert.ok(/return;/.test(ag), 'a promó-ág nem return-öl a „ma már ment" esetben');
});

t('🔑 a „ma már ment" a SAJÁT nyilvántartásból jön, nem a cikk-jelölésből', () => {
  // A `maiReelCikk` a cikkek reel_at mezőjét nézi. A promó egyetlen cikket
  // sem jelöl meg, tehát arra VAK — saját jelölés kell.
  assert.ok(/maiPromo\(promoA\.utolso\)/.test(reelPostForras), 'a prepare nem kérdezi meg a maiPromo-t');
  assert.ok(/packs-reel\.json/.test(reelPostForras), 'nincs saját nyilvántartás a promónak');
});

t('🔑 a küldő a kind alapján ágazik el, MIELŐTT a cikk-ág eldobná', () => {
  const kindHely = reelPostForras.indexOf("pending?.kind === 'packs'");
  const eldobHely = reelPostForras.indexOf('if (!pending?.file)');
  assert.ok(kindHely > 0, 'a send() nem ismeri a csomag-reklámot');
  assert.ok(eldobHely > kindHely,
    'a „hibás előkészítés" ág a kind-vizsgálat ELŐTT fut — a promót eldobná, mert nincs file mezője');
});

t('maiPromo: ma igen, tegnap nem', () => {
  assert.equal(maiPromo('2026-09-20T02:31:00Z', VASARNAP), true);
  assert.equal(maiPromo('2026-09-19T02:31:00Z', VASARNAP), false);
  assert.equal(maiPromo('', VASARNAP), false);
  assert.equal(maiPromo(null, VASARNAP), false);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
