// ===================================================================
// RIPORT-SOROK  —  a napi jelentés két félrevezető sorának javítása
// ===================================================================
//
// User-jelzés (2026-08-06): "ne küldjön valótlan adatokat".
//
// 1. "📘 Facebook-poszt: 6"
//    A szám a MI jelölésünkből jött (posted_fb), ami a webhook HTTP 200-as
//    válaszára kerül rá — az viszont csak annyit jelent, hogy a Make ÁTVETTE
//    a kérést. Élesben mérve: a Pinterest 3 pinje elbukott a kimeneti
//    modulban, miközben nálunk mind "kiküldve" volt. A riport tehát
//    magabiztosan írt ki olyan számot, ami felfelé torzít.
//    JAVÍTÁS: a Make futási naplójából vett TÉNYLEGES szám is odakerül.
//    Ha nincs Make-adat, a sor őszintén csak annyit mond: "kiküldve".
//
// 2. "♻️ ISMÉTLŐDŐ hiba … (legmakacsabb 4×) — kemény szabály kellhet"
//    A 4 nem MAI szám volt, hanem a lecke TELJES élettartamára (2026-07-03
//    óta, 34 nap) vonatkozó összeg. Így a sor havi 4 előfordulást úgy
//    mutatott, mintha ma történt volna négyszer — és sürgetett is.
//    JAVÍTÁS: az időtáv kiírva, a sürgetés pedig HETI ÜTEMHEZ kötve.
// ===================================================================

// Efölött szólunk kemény szabályért. 4 előfordulás / 34 nap ≈ heti 0,8 —
// az nem makacs hiba, hanem a minőségkapu normál működése.
export const REPEAT_URGENT_PER_WEEK = 3;

/**
 * A közösségi posztok sora: mennyit KÜLDTÜNK és mennyi MENT KI valóban.
 *
 * @param {number} sent       amit mi kiküldtünk (posted_fb, 24 óra)
 * @param {number|null} delivered  a Make sikeres futásai (null = nincs adat)
 */
export function describePosts(sent, delivered) {
  if (delivered == null) return `📘 Facebook-poszt: ${sent} kiküldve`;
  // A Make-napló ablaka nem pont ugyanaz, mint a mienk; ha többet mutat,
  // attól még nem jelenhetett meg több, mint amennyit küldtünk.
  const shown = Math.min(delivered, sent);
  if (shown < sent) {
    return `📘 Facebook-poszt: ${sent} kiküldve, de csak ${shown} jelent meg ⚠️`;
  }
  return `📘 Facebook-poszt: ${sent} kiküldve, mind megjelent`;
}

// NAP ELEJÉTŐL NAP ELEJÉIG mérünk. (Az első változat a záró naphoz
// 23:59:59-et adott, ami egy egész napot kerekített felfelé — a teszt
// kapta el: 34 nap helyett 35-öt írt volna a riportba.)
const dayDiff = (fromIso, toIso) => {
  const a = Date.parse(String(fromIso).slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(String(toIso).slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(1, Math.round((b - a) / 86400000));
};

/**
 * Az ismétlődő hibák sora — vagy null, ha ma nem ismétlődött semmi.
 *
 * @param {Array}  repeated  a ma ismétlődött leckék
 * @param {number} types     hány TÍPUS ismétlődött ma
 * @param {string} today     'YYYY-MM-DD'
 */
export function describeRepeat(repeated, types, today) {
  if (!repeated || !repeated.length) return null;
  const worst = [...repeated].sort((a, b) => (b.repeats || 0) - (a.repeats || 0))[0];
  const n = worst.repeats || 0;
  const days = dayDiff(worst.created, today);
  const span = days ? ` ${days} nap alatt` : '';
  const perWeek = days ? (n / days) * 7 : 0;

  const head = `♻️ Ismétlődő hiba: ${types} típus ma`
    + ` (legmakacsabb: [${worst.scope || '?'}] ${String(worst.text || '').slice(0, 60)}…`
    + ` — ${n}×${span})`;

  // Sürgetni csak akkor, ha tényleg sűrű. Enélkül minden nap riasztana
  // olyasmiért, ami a minőségkapu normál munkája.
  return perWeek >= REPEAT_URGENT_PER_WEEK
    ? head + ' — ez sűrű, kemény szabály kellhet!'
    : head;
}
