// ===================================================================
// PARITÁS — a két cikk-sablon (hír ↔ útmutató) összevetése a KIMENETEN
// ===================================================================
// A `website/build.js`-ben KÉT cikk-sablon van, és NÉGY alkalommal került egy
// javítás csak az egyikbe, mindannyiszor NÉMÁN (08-25 közép-doboz, 09-09
// támogatás-sor, 09-10 második doboz, 09-12 linkelés + „In short" + 4 CSS).
//
// Ez a modul a DÖNTÉST tartalmazza, lemez nélkül. Két hívója van:
//   • `core/template-parity.test.js` — kitalált lapokon (mindig) és friss
//     helyi kimeneten (ha van),
//   • `core/output-guard.js` — a CI-ban, a build UTÁN, FRISS kimeneten.
// (2026-09-12-ig csak a teszt létezett, és kiderült, hogy friss kimenetet
// sehol nem látott — lásd core/built-output.js.)
//
// HOGYAN: minden osztálynévre kiszámoljuk, a hírek és az útmutatók hány
// százalékán fordul elő a CIKK-RÉGIÓBAN. Ami az egyik oldalon gyakori (≥30%)
// és a másikon gyakorlatilag nincs (≤2%), az ELTÉRÉS. Minden eltérésnek
// szerepelnie kell alább, INDOKKAL.
//
// ⚠️ AMIT NEM LÁT: a DARABSZÁMOT (a 09-10-i második-doboz hibát nem fogta volna
// meg — mindkét doboz ugyanazt az osztályt viseli; ezt a kimenet-őr külön
// MIDREAD-ellenőrzése fedi); a 30% alatti eltérést; ami nem osztályban/tagben
// jelenik meg; a /hu/ és /es/ kimenetet.
// ===================================================================

export const JELEN = 0.30;   // ennyi lapon legyen jelen az egyik oldalon
export const HIANY = 0.02;   // és eddig hiányozzon a másikról

// SZÁNDÉKOS ELTÉRÉSEK — mindegyik mellett OTT AZ INDOK. Nem az a kérdés, van-e
// eltérés, hanem hogy TUDUNK-E RÓLA. Ha egy különbség nem szándékos, a javítás
// a build.js-be való, nem ide.
export const CSAK_HIR = {
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

// FOLYAMATBAN — a kódban MÁR javítva, a kimeneten még a régi build látszik.
// Ha egy bejegyzés „megjavul", a kimenet-őr jelzi, és a sort törölni kell.
//
// ✅ 2026-09-12: a két korábbi bejegyzés (`guide-link`, `lede`) egy FRISS élő
// mintán (70 hír + 70 útmutató, cache-busterrel letöltve) igazoltan megjavult:
// mindkettő megjelent az útmutatókban, és a mintán nem maradt ismeretlen
// eltérés. Ezért törölve. Az ÜRES lista a helyes állapot; a mechanizmus marad
// a következő átmenethez.
export const FOLYAMATBAN = {};

// Az útmutató MŰFAJI jelölése: lépéssor, folyamat-térkép, GYIK, borító.
export const UTMUTATO_ELOTAG = [/^g-/, /^guide-/, /^guide$/, /^cat-guide$/];

export const TAG_SZANDEKOS = {
  nav: 'A folyamat-térkép (g-map) lépés-navigációja — a hírnek nincs lépéssora.',
  details: 'A GYIK nyitható elemei — a hírben nincs GYIK.',
  summary: 'A GYIK-elemek fejléce, a <details> párja.'
};

/** Útmutató-e a lap? (A lépéssor jelenléte a műfaj biztos jele.) */
export const isUtmutatoLap = (h) => String(h).includes('class="g-steps"');

/** CSAK a cikk-régió: a fejléc és a lábléc közös, ott nincs mit összevetni. */
export function cikkRegio(h) {
  const s = String(h);
  const a = s.indexOf('<article');
  const r = s.indexOf('<footer class="site-footer"');
  return a < 0 ? '' : s.slice(a, r > 0 ? r : s.length);
}

function gyujt(lapok, rx) {
  const m = new Map();
  for (const h of lapok) {
    const it = new Set();
    for (const c of cikkRegio(h).matchAll(rx))
      for (const k of String(c[1]).split(/\s+/)) if (k) it.add(k);
    for (const k of it) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function egyoldalu(lapokHir, lapokUtm, rx) {
  const H = gyujt(lapokHir, rx), U = gyujt(lapokUtm, rx);
  const csakHir = [], csakUtm = [];
  for (const k of new Set([...H.keys(), ...U.keys()])) {
    const h = (H.get(k) || 0) / lapokHir.length, u = (U.get(k) || 0) / lapokUtm.length;
    if (h >= JELEN && u <= HIANY) csakHir.push(k);
    else if (u >= JELEN && h <= HIANY) csakUtm.push(k);
  }
  return { csakHir: csakHir.sort(), csakUtm: csakUtm.sort() };
}

/**
 * A teljes paritás-elemzés.
 * @param {string[]} lapok  kiépített cikk-lapok HTML-je (hír és útmutató vegyesen)
 * @param {object} [o]      a listák injektálhatók, hogy a mechanizmus üres
 *                          listával is tesztelhető legyen
 */
export function paritasElemzes(lapok, {
  minLap = 50, csakHir: szandekosHir = CSAK_HIR, folyamatban = FOLYAMATBAN, tagSzandekos = TAG_SZANDEKOS
} = {}) {
  const hir = lapok.filter(h => !isUtmutatoLap(h));
  const utm = lapok.filter(isUtmutatoLap);
  const alap = { hir: hir.length, utmutato: utm.length, elegendo: hir.length >= minLap && utm.length >= minLap };
  if (!hir.length || !utm.length) {
    return { ...alap, csakHir: [], csakUtm: [], tagElteres: [], ismeretlenHir: [], ismeretlenUtm: [], ismeretlenTag: [], megjavult: [] };
  }
  const osztaly = egyoldalu(hir, utm, /class="([^"]+)"/g);
  const tag = egyoldalu(hir, utm, /<([a-z][a-z0-9]*)\b/g);
  const tagElteres = [...tag.csakHir, ...tag.csakUtm].sort();
  return {
    ...alap,
    csakHir: osztaly.csakHir,
    csakUtm: osztaly.csakUtm,
    tagElteres,
    ismeretlenHir: osztaly.csakHir.filter(k => !(k in szandekosHir) && !(k in folyamatban)),
    ismeretlenUtm: osztaly.csakUtm.filter(k => !UTMUTATO_ELOTAG.some(rx => rx.test(k))),
    ismeretlenTag: tagElteres.filter(k => !(k in tagSzandekos)),
    // a FOLYAMATBAN-sor, ami már NEM eltérés → törölhető
    megjavult: Object.keys(folyamatban).filter(k => !osztaly.csakHir.includes(k))
  };
}
