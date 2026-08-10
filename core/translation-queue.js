// ===================================================================
// FORDÍTÁSI SORREND — mi forduljon le előbb
// ===================================================================
//
// ELŐZMÉNY (2026-07-01): a fordító fájlnév szerint rendezett, és az
// ARTICLE_GUIDE_* fájlok mindig előre kerültek ('G' > '2026'), ezért a HÍREK
// sosem jutottak sorra. Azóta a published_at dönt, legfrissebb elöl.
//
// A MOSTANI RÉS (2026-08-10): a tisztán kor szerinti sor azt jelenti, hogy egy
// ELBUKOTT fordítás minden nap hátrébb csúszik, ahogy újabb cikkek készülnek.
// A 08-09-i heti összefoglaló magyar fordítása hatszor bukott el, és másnap
// már tíz frissebb cikk állt előtte. A hibás szűrőt megjavítottuk, de ha
// legközelebb BÁRMI miatt elbukik egy fordítás, ugyanígy elsüllyedhet.
//
// User-szabály (2026-08-10): "ne forduljon többet elő, hogy nincs lefordítva
// valami." Ezért a sor nem csak korra néz:
//   1. ami MÁR elbukott — az hibás állapotban van, azt kell először rendezni
//   2. a heti összefoglaló — az ül a főoldal tetején MINDEN nyelven, ott a
//      legdrágább egy angolul maradt cikk
//   3. minden más: legfrissebb elöl (a 07-01-i tanulság érintetlen)
// ===================================================================

/** Egy korábbi bukás ennyivel előz — erősebb jel, mint a kiemeltség. */
export const FAILED_BONUS = 1000;

/** A heti összefoglaló (weekly-digest) előnye. */
export const PINNED_BONUS = 100;

/**
 * @param {Array<{file:string, pub?:string, kiemelt?:boolean}>} items
 * @param {Object<string, number>} fails  a "fájl|nyelv" → bukásszám térkép
 *                                        (memory/translation-failures.json)
 * @param {string[]} [langs]  az ÉLŐ nyelvek. Megadva csak ezek bukásai
 *                            számítanak — a de/fr 2026-07-31-én kivezetve, de
 *                            a számlálójuk ott maradt, és mivel soha nem
 *                            próbáljuk újra, soha nem is törlődik. Enélkül egy
 *                            holt fr-bukás örökre a sor elejére ültetne egy
 *                            különben kész cikket.
 * @returns {Array} ugyanazok az elemek, fordítási sorrendben
 */
export function orderForTranslation(items, fails, langs) {
  if (!Array.isArray(items)) return [];
  const f = fails && typeof fails === 'object' ? fails : {};
  const elo = Array.isArray(langs) && langs.length ? new Set(langs) : null;

  // Fájlonként összegezzük a bukásokat — bármelyik ÉLŐ nyelven történt.
  // A kulcs "fájl|nyelv", és a fájlnévre PONTOSAN illesztünk: egy laza
  // egyezés más cikk bukása miatt sorolna előre valamit.
  const bukas = new Map();
  for (const [kulcs, n] of Object.entries(f)) {
    const i = String(kulcs).lastIndexOf('|');
    if (i < 1) continue;
    if (elo && !elo.has(kulcs.slice(i + 1))) continue;
    const file = kulcs.slice(0, i);
    bukas.set(file, (bukas.get(file) || 0) + (Number(n) || 0));
  }

  const pont = x => {
    const b = bukas.get(x.file) || 0;
    return (b ? FAILED_BONUS + b : 0) + (x.kiemelt ? PINNED_BONUS : 0);
  };

  return [...items].sort((a, b) => {
    const d = pont(b) - pont(a);
    if (d) return d;
    return String(b.pub || '').localeCompare(String(a.pub || ''));
  });
}

export default { orderForTranslation, FAILED_BONUS, PINNED_BONUS };
