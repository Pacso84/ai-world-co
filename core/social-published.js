// ===================================================================
// KÖZÖSSÉGI SOR — melyik poszt melyik élő cikkhez tartozik, és friss-e
// ===================================================================
//
// EGY HELYEN, mert KÉT élő poszter dönt ugyanarról:
//   • `agents/social/poster.js`        — Facebook (Make)
//   • `agents/social/buffer-poster.js` — Threads · Instagram (Buffer)
//
// ⚠️ MIÉRT SZÜLETETT (2026-09-12, ügynök-audit): a két poszterben a
// `slugify` + `publishedMap` + `realSlug` blokk KARAKTERRE UGYANAZ volt (csak
// egy komment tért el), a frissesség-vágás pedig két KÜLÖNBÖZŐ ALAKBAN, de
// ugyanazzal az eredménnyel. Semmi nem tartotta őket szinkronban.
//
// 🔑 Hogy ez nem elméleti veszély: a slug-egyeztetés egyszer már elrontott
// egy csatornát. A régi kód a CÍMBŐL képezte újra a slugot, a cikkek viszont
// rögzített `_meta.slug`-ot kaptak (2026-07-27) → a keresés nem talált, a kor
// „végtelen" lett, és 18 FRISS poszt némán elavultnak jelölődött (2026-08-02).
// Ha a javítás csak az egyik poszterbe kerül be, a másik csatorna csendben
// veszít — pontosan ez a minta ismétlődött a két cikk-sablonnál NÉGYSZER.
//
// A modul SEMMIT nem olvas és nem ír: a hívó olvassa be a cikkeket, és a
// visszakapott döntés alapján jelöl. Így tesztelhető anélkül, hogy az
// `agents/` alól bármit futtatni kellene (a puszta import posztot küldene).
//
// Teszt: core/social-published.test.js (egységteszt + valódi adat + bekötés-őr).
// ===================================================================

/** Hír ennyi napig megy ki; utána lezárjuk. Az útmutató örökzöld. */
export const FRESH_DAYS = 7;
export const FRESH_MS = FRESH_DAYS * 24 * 3600e3;

/** A cikk-mappa mely fájljai cikkek. */
export function isArticleFile(name) {
  return name.startsWith('ARTICLE_') && name.endsWith('.json');
}

/**
 * Címből képzett TARTALÉK-kulcs a régi social-fájlokhoz.
 * ⚠️ SZÁNDÉKOSAN a poszterek eredeti képlete, betűre — NEM a
 * core/legacy-urls.js `slugify`-ja (az nem-string címre nem dob, ez igen, és
 * a dobás itt azt jelenti, hogy a cikk tartalék-kulcsot nem kap).
 */
export function matchSlug(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

/**
 * slug → { at, guide } térkép a MÁR BEOLVASOTT cikkekből.
 *
 * A KULCS A RÖGZÍTETT `_meta.slug` (2026-08-02). Tartaléknak a címből képzett
 * kulcsot is felvesszük (régi, csonka slugú social-fájlokhoz), de az SOHA nem
 * írja felül a rögzítettet.
 *
 * @param {Array<{file:string, data:object}>} entries  readdir-sorrendben;
 *        a hívó a nem olvasható / nem parse-olható fájlt KIHAGYJA.
 *        A sorrend számít: `_meta.slug` — az utolsó nyer; tartalék — az első.
 * @returns {Object<string, {at:string, guide:boolean}>}
 */
export function buildPublishedMap(entries) {
  const map = {};
  for (const e of entries || []) {
    try {
      const f = e.file;
      const d = e.data;
      const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');
      const rec = { at: d._meta?.published_at || '', guide: isGuide };
      if (d._meta?.slug) map[d._meta.slug] = rec;
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const legacy = matchSlug((m && m[1]) || d.original_title || f);
      if (legacy && !map[legacy]) map[legacy] = rec;
    } catch { /* kihagyjuk — ahogy a poszterekben mindig is */ }
  }
  return map;
}

/**
 * A social-fájl VALÓDI slugja: elsődlegesen az url-ből, mert az a publikált
 * cím — a `slug` mező lehet régi/csonka maradvány.
 */
export function realSlug(post) {
  const fromUrl = String(post.url || '').split('/article/')[1];
  return (fromUrl || post.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

/** A poszthoz tartozó cikk-rekord, vagy undefined. */
export function findPublished(map, post) {
  return map[realSlug(post)] || map[post.slug];
}

/**
 * Egy poszt sorsa ebben a körben.
 *
 * @returns {null | {pubAt:string, isGuide:boolean, stale:boolean, isFresh:boolean}}
 *   null   → nincs élő cikk hozzá: VÁRUNK, nem dobjuk el (a néma eldobás
 *            visszafordíthatatlan, a várakozás nem).
 *   stale  → 7 napnál régebbi HÍR: a hívó lezárja ('skipped-stale').
 *   isFresh→ 7 napon belül publikált (hír ÉS útmutató) — a core/social-queue.js
 *            rangsorának bemenete.
 * ⚠️ Olvashatatlan dátumnál sem stale, sem isFresh (ez a korábbi viselkedés
 * mindkét poszterben).
 */
export function queueStatus(map, post, now) {
  const rec = findPublished(map, post);
  if (!rec) return null;
  const pubAt = rec.at || '';
  const isGuide = !!rec.guide;
  const age = pubAt ? (now - new Date(pubAt).getTime()) : Infinity;
  return { pubAt, isGuide, stale: !isGuide && age > FRESH_MS, isFresh: age <= FRESH_MS };
}

export default { FRESH_DAYS, FRESH_MS, isArticleFile, matchSlug, buildPublishedMap, realSlug, findPublished, queueStatus };
