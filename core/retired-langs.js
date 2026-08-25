// ===================================================================
// KIVEZETETT NYELVEK — SÍRKŐ (2026-08-25)
// ===================================================================
// A német és a francia változat 2026-07-31-én megszűnt (user-döntés: 0
// látogatót hoztak). 2026-08-25-én a user kérésére MINDENHONNAN kitöröltük
// őket: 6,76 MB fordítás 473 fájlból, 108 felületi szöveg-mező a build.js-ből,
// és 9 helyről a nyelvlisták.
//
// EZ AZ EGYETLEN HELY, AHOL A 'de' ÉS AZ 'fr' MÉG SZEREPEL — és szándékosan.
// Nem maradék, hanem SÍRKŐ: két dolgot tart életben, és semmi mást.
//
//   1. website/build.js → `/de/* /:splat 301` és `/fr/* /:splat 301`
//   2. core/live-guard.js → élesben ellenőrzi, hogy ez a 301 tényleg megy-e
//
// MIÉRT MARAD A 301, HA MINDENT TÖRÖLTÜNK:
// Az átirányítás nem a német oldal maradványa — az a MÓDJA annak, hogy egy
// oldalt véglegesen megszüntessünk. Nélküle minden régi /de/ vagy /fr/ link
// 404-et adna: a keresőnek, a megosztott linkeknek, a könyvjelzőknek.
// A 301 azt mondja: "ez végleg elköltözött ide" — a 404 azt, hogy "eltűnt".
//
// ⚠️ AMIT NEM TUDUNK MEGMÉRNI: hogy jár-e még valaki ezekre a címekre.
// A forgalmi napló 23 napra 0 belépőt mutat a /de/ és /fr/ útvonalakra, DE
// EZ NEM BIZONYÍTÉK: az átirányítás miatt a kérés sosem jelenik meg /de/
// oldalletöltésként — a mérés pont azt rejti el, amit mérni akarnánk.
// Ezért a döntés nem mérésen áll, hanem az árakon: a 301 két sor a 2000-es
// Cloudflare-keretből (0,1%), a 404 ára viszont ismeretlen és nem nulla.
//
// HA EGYSZER EZ IS MEHET: töröld ezt a fájlt, a két importot, és a
// live-guard 3. pontját. A régi címek onnantól 404-et adnak — ez rendben
// van, ha addigra a kereső is elfelejtette őket (évek, nem hetek).
// ===================================================================

export const RETIRED_LANGS = ['de', 'fr'];
