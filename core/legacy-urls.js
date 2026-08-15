// ===================================================================
// RÉGI CÍMEK — melyik fájlnév LEHETETT valaha nyilvános URL?
// ===================================================================
//
// ELŐZMÉNY (2026-08-15, hibakeresés közben mérve): a _redirects 1755 sornál
// járt a Cloudflare 2100-as plafonjából, és NAPI 22 SORRAL NŐTT. A build saját
// biztonsági vágásáig (2000) 11 nap volt hátra — a vágás figyelmeztetése pedig
// csak a CI naplójába ment volna, ahová senki nem néz.
//
// A NÖVEKEDÉS FORRÁSA nem átnevezés volt. A build minden cikkre 301-et gyártott
// a FÁJLNEVÉRŐL a slugjára, ha a kettő eltért. Az útmutatóknál viszont a fájlnév
// egy TÉMA-AZONOSÍTÓ (`ai-cover-letter`), nem egy régi cím — és mivel az
// útmutató ÖRÖKZÖLD (sosem törlődik), minden új útmutató véglegesen hozzáadott
// 6 sort. A híreknél az eltérés 0%, és azok 90 nap után amúgy is kiürülnek.
// Így a lista egyirányú volt: csak nőtt.
//
// A DÖNTŐ ÉRV szerkezeti, nem statisztikai: az URL 2026-07-27-ig a CÍMBŐL
// készült (`slugify(title)`), SOHA nem a fájlnévből. Tehát egy fájlnév csak
// akkor lehetett valaha nyilvános cím, ha PONTOSAN egyezik a cím slugjával.
// A `slugify` 70 karakternél vág és leszedi a záró kötőjelet; a fájlnevek ~60-nál
// vannak elharapva, lógó kötőjellel (`...using-alibaba-`). Ilyen alakot a
// `slugify` nem tud előállítani — ez KIZÁRÁS, nem valószínűsítés.
//
// MEGERŐSÍTVE (Search Console, 2026-06-01 … 08-15, 405 ismert cím; a mérés
// ismert esettel hitelesítve — a főoldal 40 megjelenítéssel megjelent):
// a 247 kizárt cím közül EGY SEM kapott valaha megjelenítést.
// ⚠️ A GSC csak a keresésben MEGJELENT címeket látja, tehát ez megerősítés,
// nem bizonyíték — a szerkezeti kizárás a fő érv.
//
// A BIZONYÍTOTT átnevezések külön élnek: content/slug-history.json (git-történet).
// Azokat ez a modul nem érinti, azok mindig kimennek.
// ===================================================================

/** A build.js slugify-ja. Itt SZÓ SZERINT ugyanaz — ha ott változik, itt is kell. */
export function slugify(text) {
  return String(text == null ? '' : text).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/**
 * Lehetett-e ez a fájlnév valaha NYILVÁNOS cím?
 *
 * ⚠️ A CÍM FORRÁSA DÖNTŐ, és könnyű elvéteni (én elvétettem, 2026-08-15):
 * az EREDETI cím (`original_title`) kell, NEM a cikk mostani címe. A mostani
 * cím a frontmatterben van, és a minőségi körök átírják — 265 párból 163-nál
 * eltér a kettő. A régi URL az EREDETI címből készült, tehát csak azzal
 * összevetve van értelme. A mostani címmel mérve 0 találat jön ki, és így
 * kidobnánk 18 VALÓDI átirányítást — köztük egy Search Console-ból ismertet.
 *
 * Mérve (2026-08-15, 265 eltérő pár):
 *   18 = slugify(original_title)  → VOLT nyilvános cím
 *  221 = guide_topic_id           → téma-azonosító, sosem volt cím
 *   26 = egyik sem (csonkolt)     → sosem volt cím
 *
 * @param {string} bornSlug       a fájlnévbe fagyott azonosító
 * @param {string} originalTitle  a cikk EREDETI címe (data.original_title)
 * @returns {boolean}
 */
export function couldHaveBeenPublicUrl(bornSlug, originalTitle) {
  const b = String(bornSlug || '');
  if (!b || !/^[a-z0-9-]+$/.test(b)) return false;
  const t = String(originalTitle || '');
  if (!t) return false;                       // cím nélkül nem tudjuk — nem állítunk igent
  return slugify(t) === b;
}

/**
 * Kell-e 301 erre a cikkre, és melyik címről melyikre?
 *
 * @param {object} p
 * @param {string} p.bornSlug       fájlnévből
 * @param {string} p.slug           a mostani, kanonikus slug (_meta.slug)
 * @param {string} p.originalTitle  a cikk EREDETI címe — NEM a mostani!
 * @returns {{from:string,to:string}|null}
 */
export function legacyRedirect({ bornSlug, slug, originalTitle } = {}) {
  const from = String(bornSlug || ''), to = String(slug || '');
  if (!from || !to || from === to) return null;
  if (!couldHaveBeenPublicUrl(from, originalTitle)) return null;
  return { from, to };
}

export default { slugify, couldHaveBeenPublicUrl, legacyRedirect };
