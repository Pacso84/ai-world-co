// ===================================================================
// EGY KÖZÖSSÉGI BEJEGYZÉS ÁLLAPOTA A CÉLJÁHOZ KÉPEST
// ===================================================================
//
// MIÉRT KÜLÖN MODUL: a döntést a seo-guard.js hozta, az viszont futtatható
// script (semmit nem exportál, importálni tilos), tehát tesztelhetetlen volt.
// Ugyanaz a szétválasztás, mint az auto-check-codes.js-nél: a DÖNTÉS tiszta
// függvény, a lekérdezés marad a scriptben.
//
// AMIT JAVÍT (2026-08-18): az őr korábban MINDEN nem-létező slugot úgy
// jelentett, hogy "az olvasó 404-et kap". Élesben négy ilyen akadt — és
// mind a négyre volt 301, mind élő oldalon kötött ki, tehát NULLA olvasó
// kapott hibát. Két külön dolgot mosott össze:
//
//   • TÖRÖTT  — nincs cikk és nincs átirányítás → az olvasó tényleg hibát kap.
//   • ELAVULT — a cikket átneveztük, a link 301-en át él. A bejegyzés
//               rossz, mert a poszterek a RÖGZÍTETT slugra illesztenek
//               (`if (!rec) continue`), tehát SOHA nem küldik ki — a cikk
//               némán kiesik minden csatornáról. Kár, de nem olvasói hiba.
//
// A kettő súlya nagyságrenddel eltér, a teendő viszont ugyanaz marad
// (a bejegyzést a friss slugra kell állítani), ezért mindkettő JELENT —
// csak külön néven. A néma elhallgatás itt rosszabb lenne: az elavult
// bejegyzés magától soha nem oldódik meg, csak halkan visz el terjesztést.
//
// ÉS AMIT MÉG JAVÍT: a LEZÁRT bejegyzést eddig beleszámolta. Mindkét poszter
// `if (post[field]) continue` alapon szűr, tehát amit minden csatornán
// lezártunk, azt már senki nem küldi ki — olvasóhoz nem juthat. Ha ezek
// riasztanak, az őr ÖRÖKRE panaszkodik valamire, amit nem lehet megjavítani.
// Pont ez szoktatja le az embert az őrszemről.
// ===================================================================

/** A csatornák, amelyeken egy bejegyzés lezárható. */
export const CHANNELS = Object.freeze(['posted_fb', 'posted_threads', 'posted_instagram']);

export const OK       = 'ok';        // él a cikk, a link pontos
export const CLOSED   = 'closed';    // minden csatornán lezárva — olvasóhoz nem jut
export const REDIRECT = 'redirect';  // átnevezett cikk: 301-en át él, de a bejegyzés elavult
export const DEAD     = 'dead';      // nincs cikk, nincs átirányítás → valódi 404

/** Az url-ből a csupasz slug (.html és ?#... nélkül). */
export function slugOf(post) {
  const u = String(post?.url || '');
  if (!u) return '';
  return u.replace(/^.*\/article\//, '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

/**
 * Hová jut el a slug az átirányítás-láncon? Láncot is követ (A→B→C), mert a
 * slug-history halmozódik: egy cikket többször is átnevezhettünk.
 * @returns {string} a lánc vége (ha nincs átirányítás, maga a slug)
 */
export function followRedirects(slug, redirects, maxHops = 5) {
  let s = String(slug || '');
  const latott = new Set([s]);
  for (let i = 0; i < maxHops; i++) {
    const kov = redirects?.[s];
    if (!kov || latott.has(kov)) break;   // a körre is figyelünk
    s = kov; latott.add(s);
  }
  return s;
}

/**
 * @param {object} post              a content/social/*.json tartalma
 * @param {Set<string>} live         a MOST publikált cikkek _meta.slug-jai
 * @param {Record<string,string>} redirects  slug-history: régi → új
 * @returns {'ok'|'closed'|'redirect'|'dead'}
 */
export function linkState(post, live, redirects = {}) {
  const slug = slugOf(post);
  if (!slug) return CLOSED;                                  // nincs link — nincs mit elrontani
  if (CHANNELS.every(c => post?.[c])) return CLOSED;          // sehol nem mehet ki többé
  if (live?.has?.(slug)) return OK;
  const veg = followRedirects(slug, redirects);
  return (veg !== slug && live?.has?.(veg)) ? REDIRECT : DEAD;
}

export default { CHANNELS, OK, CLOSED, REDIRECT, DEAD, slugOf, followRedirects, linkState };
