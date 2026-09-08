// ===================================================================
// ÁTIRÁNYÍTÁS-LÁNC (2026-09-08) — egy ugrásban érjen célba
// ===================================================================
// MI TÖRTÉNT: a user Search Console-képén szereplő „Átirányítási hiba: 2"
// mögött ez állt, élesben mérve:
//
//     /article/summarise-any-text-with-chatgpt-for-everyday-use
//       301 → /article/how-to-get-ai-insights-anywhere-with-genie-one-…
//       301 → /article/databricks-puts-genie-one-on-your-phone-ai-insights-…
//       200
//
// Két ugrás egyetlen cím eléréséhez. Három nyelven és `.html`-lel együtt ez
// hat fölösleges sor a `_redirects`-ben — abban a fájlban, aminek a
// Cloudflare-plafonja 2100 sor, és amiről 2026-08-15-én már megtanultuk,
// hogy észrevétlenül a 83%-áig hízik.
//
// 🔑 A LÁNC NEM HIBA, HANEM KÖVETKEZMÉNY: minden KÉTSZER átnevezett cikk
// gyárt egyet, magától. Ezért nem elég egyszer kitakarítani — a KIADÁSNAK
// kell mindig egyenesre húznia.
//
// ⚠️ A `content/slug-history.json`-t NEM ÍRJUK ÁT. Az szándékosan TÖRTÉNET:
// a git-történetből gyűjtött, bizonyítottan élt címek listája. Ha ott
// „egyszerűsítenénk", elveszne a tudás, hogy melyik cím mikor mire mutatott.
// A történet marad hiteles; a KISZOLGÁLT átirányítás lesz egyenes.
// ===================================================================

/**
 * Ennyi ugrás után feladjuk.
 *
 * Egy valódi láncot 2-3 átnevezés hoz létre; 20 fölött már nem lánc, hanem
 * adathiba. Olyankor inkább NE adjunk ki szabályt, mint hogy a Cloudflare-en
 * pörögjön egy 20 lépéses átirányítás-sor.
 */
// ⚠️ MUTÁCIÓS PRÓBA (2026-09-08): a kör-védelem kikapcsolása NEM buktatja el a
// teszteket — és ez így helyes. A `MAX_LEPES` úgyis leállítja a ciklust, a
// `laposit()` `to !== from` feltétele pedig külön is kiszűri az önmagára
// mutatót. Vagyis a mutáns EGYENÉRTÉKŰ: ugyanazt adja vissza, csak lassabban.
// A rétegzett védelem ára, hogy egy réteg kiesése nem látszik a kimeneten;
// ezt megvizsgáltam, nem tesztrés. A kör-ellenőrzés a SZÁNDÉKOT rögzíti.
export const MAX_LEPES = 20;

/**
 * Hova jut el végül ez a cím?
 *
 * @param {Record<string,string>} tortenet  régi slug → új slug
 * @param {string} kezdet
 * @returns {string|null} a végcél, vagy `null` (nincs átirányítás / kör / túl hosszú)
 */
export function vegcel(tortenet, kezdet, { maxLepes = MAX_LEPES } = {}) {
  if (!tortenet || typeof tortenet !== 'object' || Array.isArray(tortenet)) return null;

  let hol = kezdet;
  // ⚠️ A KEZDETET IS BE KELL TENNI: enélkül az önmagára mutató bejegyzés
  // (x → x) nem kör gyanánt bukna el, hanem érvényes szabálynak látszana.
  const jart = new Set([hol]);

  for (let i = 0; i < maxLepes; i++) {
    const kov = tortenet[hol];
    // Nincs tovább: itt a vég. Ha el sem indultunk, nincs mit átirányítani.
    if (kov === undefined || kov === null || kov === '') {
      return hol === kezdet ? null : hol;
    }
    // KÖR. Két átnevezés visszavihet egy korábbi címre — ez nem elméleti.
    // Inkább NE legyen szabály, mint hogy a böngésző hurokba fusson.
    if (jart.has(kov)) return null;
    jart.add(kov);
    hol = kov;
  }
  return null;   // gyanúsan hosszú — nem szolgálunk ki ilyet
}

/**
 * A teljes történet kilapítva: minden régi cím KÖZVETLENÜL a végcélra.
 *
 * A körös és az önmagára mutató bejegyzések KIMARADNAK — egy hiányzó
 * átirányítás 404-et ad (látható, javítható), egy hurok viszont a böngészőt
 * akasztja meg (láthatatlan, és a keresőnél is rontja a bizalmat).
 *
 * @returns {Map<string,string>}
 */
export function laposit(tortenet) {
  const ki = new Map();
  if (!tortenet || typeof tortenet !== 'object' || Array.isArray(tortenet)) return ki;
  for (const from of Object.keys(tortenet)) {
    const to = vegcel(tortenet, from);
    if (to && to !== from) ki.set(from, to);
  }
  return ki;
}

export default { vegcel, laposit, MAX_LEPES };
