// ===================================================================
// FRONTMATTER — egy mező kiolvasása a cikk markdownjából
// ===================================================================
//
// MIÉRT KÜLÖN MODUL (2026-08-24). A cikk-JSON-jainkban a cím és az alcím
// NEM a JSON gyökerében van, hanem a `article_markdown` frontmatterében.
// Mérve mind a 358 útmutatón: 358/358-ban van `title:` ÉS `subtitle:` a
// frontmatterben, és 0/358-ban van gyökér-szintű `title` vagy `subtitle`.
// A slug viszont a JSON-ban él, `_meta.slug` alatt.
//
// Ezt a kiolvasást a core/short-video.js már megírta magának. A második
// felhasználó (core/reel-post.js) érkezésekor a választás az volt, hogy
// lemásoljuk vagy megosztjuk — és ugyanaznap láttuk, mi lesz a másolásból:
// a trimToWords két példánya azonnal eltért egymástól. Ezért közös.
// ===================================================================

import { readFileSync, readdirSync } from 'fs';

/**
 * A frontmatter egy mezője. Idézőjelet (" és ') lehánt, ha van.
 * Nem talált mező → üres string, sosem undefined.
 */
export function fm(md, kulcs) {
  const m = String(md == null ? '' : md)
    .match(new RegExp('^' + String(kulcs) + ':\\s*["\']?(.*?)["\']?\\s*$', 'm'));
  return m ? m[1].trim() : '';
}

/**
 * A videóhoz/Reelhez kellő három adat EGY valódi cikk-JSON-ból.
 *
 * ⚠️ A SLUG A `_meta.slug`-BÓL JÖN, nem a fájlnévből és nem a címből.
 * A `_meta.slug` a kanonikus URL: cím-átírás sosem költöztet oldalt.
 * A fájlnévből képzett slug a cikkek 11%-ánál eltérne — ez a repóban
 * többször megfogott csapda (lásd core/legacy-urls.js, core/image-targets.js).
 *
 * @returns {{slug:string, title:string, subtitle:string}}
 */
export function guideMeta(article) {
  const a = article || {};
  const md = a.article_markdown || '';
  return {
    slug: String((a._meta && a._meta.slug) || ''),
    title: fm(md, 'title') || String(a.original_title || ''),
    subtitle: fm(md, 'subtitle')
  };
}

/**
 * Cikk keresése SLUG szerint, a lemezről.
 *
 * ⚠️ MIÉRT NEM FÁJLNÉV SZERINT (2026-08-24, élesben megfogva). A
 * core/short-video.js eredetileg `fajlnev.includes(kulcs)`-szal keresett, és
 * a saját videója slugjára NEM TALÁLT RÁ: a fájl neve
 * `..._how-to-spot-a-deepfake-...-before-you-share.json`, a slug viszont
 * `...-before-you-share-it`. A kettő a cikkek ~11%-ánál eltér, mert a fájlnév
 * a guide_topic_id-ból jön, a slug meg a kanonikus URL. Ugyanez a csapda
 * másutt is megfogott már (core/legacy-urls.js, core/image-targets.js).
 *
 * A fájlnév-egyezés MEGMARADT tartaléknak, hogy a régi, kényelmes rövid
 * kulcsok is működjenek — de a slug az ELSŐ.
 *
 * @returns {{file:string, article:object}|null}
 */
export function findArticleBySlug(dir, kulcs) {
  const k = String(kulcs || '');
  if (!k) return null;
  const fajlok = readdirSync(dir).filter(f => f.endsWith('.json'));
  const olvas = (f) => {
    try { return JSON.parse(readFileSync(dir + '/' + f, 'utf-8')); } catch { return null; }
  };
  for (const f of fajlok) {
    const j = olvas(f);
    if (j && j._meta && j._meta.slug === k) return { file: f, article: j };
  }
  const nev = fajlok.find(f => f.includes(k));
  if (nev) { const j = olvas(nev); if (j) return { file: nev, article: j }; }
  return null;
}
