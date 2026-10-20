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

// ===================================================================
// LÁTHATÓ „FRISSÍTVE" + KÖZÖS MÓDOSÍTÁS-DÁTUM (2026-10-19)
// ===================================================================
// User: „de ne felejtsük el lehessen látni a módosítás dátumát!" A build
// (sitemap, JSON-LD dateModified, a cikkfejléc „Frissítve" sora) és az IndexNow
// UGYANEBBŐL a függvényből számol — két külön képlet előbb-utóbb szétcsúszna.
// A tény-ellenőrző MEGJELÖLÉSE (fact_check_flag) nem módosítás: olyankor a
// szöveg nem változott, csak a fact_checked_at íródott (agents/fact-check).
// ===================================================================

/** A cikk utolsó TARTALMI változása (ISO), annak híján a megjelenés; semmi esetén ''. */
export function valodiModositas(meta) {
  const m = meta || {};
  return [m.published_at, m.howto_upgraded_at, m.fresh_updated_at, m.fact_check_flag ? null : m.fact_checked_at]
    .filter(x => napja(x)).sort().pop() || '';
}

/** A „Frissítve" dátuma: csak ha a módosítás KÉSŐBBI NAPON volt, mint a megjelenés; különben null. */
export function frissitveNap(publishedAt, modifiedAt) {
  const p = napja(publishedAt), m = napja(modifiedAt);
  return p && m && m > p ? modifiedAt : null;
}
