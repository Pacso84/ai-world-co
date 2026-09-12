// ===================================================================
// PUBLIKÁLÁSI META — dátum, rögzített slug, fordítás-elavulás
// ===================================================================
// EGY HELYEN, mert KÉT út publikál élő cikket:
//   • `agents/ellenorzo/agent.js` → moveToArticles()  — a rendes út
//   • `agents/ceo/escalate-guides.js` → publishGuide() — a FŐNÖK felülbírálása
//     4 sikertelen javítási kör után (élő út: az agents/ceo/agent.js hívja,
//     valahányszor `countGuideEscalatable() > 0`)
//
// ⚠️ MIÉRT SZÜLETETT (2026-09-12, ügynök-audit): a két út SZÉTCSÚSZOTT. A
// CEO-út a három alábbi lépés közül EGYIKET SEM csinálta:
//   1. slug rögzítése,
//   2. az eredeti megjelenési dátum megőrzése,
//   3. a fordítás-gyorsítótár törlése, ha a szöveg változott.
//
// ÉS EZ MEGTÖRTÉNT. Egyetlen cikk ment ki valaha ezen az úton
// (`ARTICLE_GUIDE_adding-clear-comments-…`), és a publikálás pillanatában
// (89f99fa3) a `_meta.slug` **undefined** volt — pontosan az UNPINNED_SLUG
// hiba, amit 2026-07-28-án már megoldottak a másik ágon. Öt nappal később
// egy visszamenőleges rögzítés pótolta. **A javítás az Ellenőrző-útba
// került, a CEO-útba nem.**
//
// 🔑 Ezért NEM a helyes logika lemásolása a megoldás — az egy HARMADIK
// példány lenne. A döntés ide költözik, és mindkét hívó innen kéri.
//
// A modul SEMMIT nem ír lemezre és semmit nem olvas: a hívó adja be az
// előző cikket (vagy null-t), és a visszakapott értékek alapján cselekszik.
// Így tesztelhető anélkül, hogy az `agents/` alól bármit futtatni kellene
// (azt a projekt szabálya tiltja: a puszta import pénzt költ és publikál).
// ===================================================================

/** A slug hossz-plafonja. A build.js UGYANEZT a képletet használja. */
export const SLUG_MAX = 70;

/**
 * Slug a címből — a build.js képletével azonos.
 * ⚠️ NE a fájlnévből képezz slugot: mérve 958 cikkből 81-nél (8,5%) eltér a
 * címből képzett alak a rögzített `_meta.slug`-tól.
 */
export function slugCimbol(markdown, originalTitle, tartalek) {
  // ⚠️ 2026-09-12: a régi minta (`"?([^"\n]+)`) az ELSŐ BELSŐ idézőjelnél megállt.
  // Élő kár: „What \"AI for Everyone\" Really Means in 2026" → a rögzített slug
  // ÖRÖKRE `what` lett (/article/what). Most a TELJES sor-értéket vesszük.
  // A szélső idézőjel levétele azért kell, hogy az ÜRES idézőjeles cím (`""`)
  // a tartalékra essen vissza. Escape-feloldás itt SZÁNDÉKOSAN nincs: a
  // slug-képlet a perjelet és az idézőjelet úgyis eldobja — mutációval
  // igazolva, hogy a feloldás a slugon semmit nem változtatna (a build.js-ben
  // viszont kell, ott a CÍM jelenik meg).
  // A már rögzített slugokat ez NEM érinti (a kint lévő slug sérthetetlen).
  const sor = String(markdown || '').match(/^title:\s*(.*)$/m);
  let cim = sor ? sor[1].trim() : '';
  cim = cim.replace(/^["']|["']$/g, '');
  return String(cim || originalTitle || tartalek || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX);
}

/**
 * Mit írjunk a `_meta`-ba publikáláskor?
 *
 * @param {object}  p
 * @param {object?} p.elozo        a MÁR kint lévő cikk (parse-olt JSON) vagy null
 * @param {object}  p.uj           az új adat ({ _meta, article_markdown, original_title })
 * @param {string}  p.fajlnev      az ARTICLE_… fájlnév (utolsó tartalék a slughoz)
 * @param {string?} p.most         ISO időbélyeg (injektálható a teszthez)
 * @returns {{ publishedAt: string, slug: string, forditasElavult: boolean }}
 */
export function publikalasMeta({ elozo = null, uj = {}, fajlnev = '', most = null } = {}) {
  const mostIso = most || new Date().toISOString();

  // 1. DÁTUM: ha a cikk MÁR megjelent, az EREDETI dátum marad. Enélkül egy
  //    átdolgozás „mára" ugratná, és az archívumban minden egy napnak tűnne.
  const publishedAt = elozo?._meta?.published_at || mostIso;

  // 2. SLUG: a megjelent URL ÖRÖKRE ugyanaz. Sorrend: a már kint lévő cikké →
  //    az újban esetleg meglévő → végül a címből képzett.
  //    ⚠️ A kint lévő az ELSŐ: egy cím-átírás SOHA nem költöztethet oldalt.
  const slug = elozo?._meta?.slug
    || uj?._meta?.slug
    || slugCimbol(uj?.article_markdown, uj?.original_title, fajlnev);

  // 3. FORDÍTÁS: ha a SZÖVEG változott, a gyorsítótár elavult — a nem-angol
  //    oldalak különben a RÉGI szöveget mutatnák tovább.
  const forditasElavult = Boolean(
    elozo?.article_markdown && elozo.article_markdown !== uj?.article_markdown
  );

  return { publishedAt, slug, forditasElavult };
}
