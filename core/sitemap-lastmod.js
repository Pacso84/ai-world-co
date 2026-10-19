// ===================================================================
// ŐSZINTE LASTMOD A SITEMAPBAN (2026-10-19)
// ===================================================================
// A sitemap minden címe mellé egy „utoljára módosítva" dátum kerül. Eddig a
// hub- és állandó oldalak NAPI HÁROMSZOR „ma"-t kaptak (minden CI-futáskor),
// az útmutatók pedig a MEGJELENÉS napját — akkor is, ha a felújító azóta
// átírta őket. A Google az ilyen dátumot figyelmen kívül hagyja, a Bing
// (Fabrice Canel, 2023) szerint pedig elveszti a bizalmát az egész sitemapban.
// (Kutatás: memoria/reports/Látogatószerzés a mostani oldalra.md)
//
// A SZABÁLY:
//   • cikk / útmutató → a valódi utolsó tartalmi változás (modifiedAt)
//   • gyűjtőoldal    → a rajta lévő legfrissebb cikk dátuma
//   • állandó oldal  → NINCS dátum (a szabvány szerint elhagyható; jobb a
//                      hiány, mint egy kitalált dátum)
// ===================================================================

/** ISO-dátumból ÉÉÉÉ-HH-NN; ha nem dátum, null. */
export function napja(iso) {
  const d = typeof iso === 'string' ? iso.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Egy cikk lastmod-ja: a valódi módosítás, annak híján a megjelenés. */
export function cikkLastmod(a) {
  return napja(a && a.modifiedAt) || napja(a && a.publishedAt);
}

/** Egy gyűjtőoldal lastmod-ja: a rajta lévő legfrissebb cikké (üres listán null). */
export function gyujtoLastmod(cikkek) {
  return (Array.isArray(cikkek) ? cikkek : []).map(cikkLastmod).filter(Boolean).sort().pop() || null;
}

/** Egy sitemap-sor; dátum nélkül a <lastmod> elmarad. */
export function sitemapSor(u) {
  return `  <url><loc>${u.loc}</loc>${u.date ? `<lastmod>${u.date}</lastmod>` : ''}</url>`;
}
