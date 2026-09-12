// ===================================================================
// SLUG-ÜTKÖZÉS — melyik két cikk kerülne UGYANARRA az URL-re?
// ===================================================================
//
// A `core/quality-guard.js` `checkSlugCollisions()` őre innen kéri a döntést.
// A modul SEMMIT nem olvas és nem ír: a hívó adja be a (fájlnév, adat)
// párokat, így a szabály lemez nélkül, mindkét irányban tesztelhető.
//
// ⚠️ MIÉRT SZÜLETETT (2026-09-12, ügynök-audit lelete). Az őr eddig a CÍMBŐL
// képzett slugot figyelte — de a build.js 2026-07-27 óta NEM abból épít URL-t:
//
//     const slug = data._meta?.slug || slugify(meta.title || data.original_title || file);
//
// Mérve 2026-09-12-én: 961 cikkből **81-nél** (8,4%) tér el a címből képzett
// slug a valódi, rögzített URL-től. Az őr tehát egy olyan értéket nézett, ami
// SOHA nem lesz URL — két azonos `_meta.slug` valódi ütközését (a build az
// egyik oldalt a másikkal írná felül) NEM látta volna, a címek egyezését
// viszont hamisan jelentette volna, pedig azok külön URL-en élnek.
// Élő kár nem volt: ma egyik kulcson sincs ütközés.
//
// 🔑 A KULCS TEHÁT A BUILD KULCSA, szó szerint:
//   1. `_meta.slug`, ha van (a rögzített, megjelent URL),
//   2. különben a FRONTMATTER `title:` sora — a build.js `parseFrontmatter()`
//      szabályaival (csak a `---` blokkban, az utolsó `title:` nyer, egy-egy
//      szélső idézőjel lekerül; CRLF-es markdownban NINCS frontmatter),
//   3. különben az `original_title`, végül a fájlnév.
//
// ⚠️ NEM a `core/publish-meta.js` `slugCimbol()`-ja. Az a publikáláskor
// rögzít slugot, és a képlete MÁS: a markdown bármely `title:` sorát elfogadja
// (nem csak a frontmatterét), az első idézőjelnél megáll, és a `'` jelet nem
// veszi le. Élő adaton 961-ből 1 cikknél ad mást, mint a build fallbackje.
// Egy őrnek azt kell néznie, amit a BUILD csinál — különben ugyanaz a hiba
// születne újra, csak kisebb.
//
// ⚠️ MÁSOLAT: a build.js nem importálható (futtatásnak indulna), ezért a
// `frontmatterCim()` a `parseFrontmatter()` cím-ágának másolata, a `slugify`
// pedig a `core/legacy-urls.js`-é (azt a saját tesztje veti össze a buildével).
// A `core/slug-collisions.test.js` a build.js FORRÁSÁBÓL építi fel a képletet,
// és viselkedésre hasonlít — szintetikus mintákon ÉS minden valódi cikken.
// ===================================================================

import { slugify } from './legacy-urls.js';

/** A build.js fájl-szűrője: csak ezekből a fájlokból lesz oldal. */
export function epulOldal(fajlnev) {
  return typeof fajlnev === 'string' && fajlnev.startsWith('ARTICLE_') && fajlnev.endsWith('.json');
}

/**
 * A cikk címe úgy, ahogy a build.js `parseFrontmatter()`-e látja.
 * Nincs frontmatter (vagy nem szöveg a markdown) → üres szöveg.
 *
 * ⚠️ Egy eltérés a buildtől, SZÁNDÉKOSAN: ha a markdown nem szöveg, a build
 * elszáll és ÁTUGORJA a cikket; itt üres cím lesz belőle, és a cikk a
 * tartalékkal (`original_title`) részt vesz az ütközés-vizsgálatban. Ez a
 * túljelzés iránya — egy őrnél az a kisebb baj. (Élő adaton: 0 ilyen cikk.)
 */
export function frontmatterCim(markdown) {
  if (typeof markdown !== 'string') return '';
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return '';
  let cim = '';
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m || m[1] !== 'title') continue;
    cim = m[2].trim().replace(/^["']|["']$/g, '');   // az UTOLSÓ title: nyer, mint a buildben
  }
  return cim;
}

/** Az URL-slug PONTOSAN a build.js képletével. */
export function effektivSlug(data, fajlnev) {
  return data?._meta?.slug
    || slugify(frontmatterCim(data?.article_markdown) || data?.original_title || fajlnev);
}

/**
 * Ütköző URL-ek. A riport-sor formátuma VÁLTOZATLAN a korábbi őrétől.
 *
 * @param {Array<{file: string, data: object}>} bejegyzesek  beolvasott cikkek
 * @returns {string[]}  üres = nincs ütközés
 */
export function slugUtkozesek(bejegyzesek = []) {
  const seen = new Map();
  const out = [];
  for (const { file, data } of bejegyzesek || []) {
    // Amit a build nem épít meg, az nem ütközhet: rossz fájlnév, nem objektum.
    if (!epulOldal(file) || !data || typeof data !== 'object') continue;
    const slug = String(effektivSlug(data, file));
    const cim = String(frontmatterCim(data.article_markdown) || data.original_title || file);
    if (seen.has(slug)) {
      out.push(`SLUG-ÜTKÖZÉS: "${cim.slice(0, 50)}" — ${file.slice(0, 40)} és ${seen.get(slug).slice(0, 40)} egymásra épül!`);
    } else {
      seen.set(slug, file);
    }
  }
  return out;
}

export default { epulOldal, frontmatterCim, effektivSlug, slugUtkozesek };
