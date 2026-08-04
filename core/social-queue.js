// ===================================================================
// SOCIAL SOR — kit küldünk ki a következő körben (2026-08-04)
//
// MIÉRT KELLETT: a Facebook-poszter kor szerint rangsorolt (friss előre),
// és futásonként 2 posztot küld — napi 6-ot. Közben napi 12 megosztható
// tartalom készül (8 hír + 4 útmutató). A friss sor tehát gyorsabban
// töltődik, mint ürül, és ami 7 napnál öregebb, az SOHA nem jut előre.
//
// MÉRT KÖVETKEZMÉNY (2026-08-04, 526 social-fájl):
//   HÍR      346 → 230 "skipped-stale" (SOSEM ment ki, lejárt) · 103 kiment
//   ÚTMUTATÓ 180 → 156 sorban ragadt (mind 7 napnál régebbi) · 23 kiment
//
// A 156 útmutató azért fáj, mert a forgalom ~82%-a Facebookról jön, és a
// mérés szerint az ÚTMUTATÓ hozza a látogatót, nem a hír.
//
// A MEGOLDÁS NEM a limit emelése: a "kulturált oldal-tempó" tudatos döntés
// volt. Helyette FENNTARTOTT HELY — a körönkénti helyek fele az örökzöld
// útmutatóé, ha van ilyen a sorban. A posztolás MENNYISÉGE nem változik,
// csak az összetétele.
//
// Az örökzöldek közül a LEGRÉGEBBI megy előbb (FIFO): így a hátralék
// kiszámíthatóan leürül, és minden útmutató sorra kerül egyszer.
// ===================================================================

/**
 * @param {Array<{pubAt:string, isGuide:boolean, isFresh:boolean}>} items
 * @param {number} limit  hány poszt mehet ki ebben a körben
 * @returns {Array} a kiválasztott elemek, kiküldési sorrendben
 */
export function selectSocialBatch(items, limit) {
  if (!Array.isArray(items) || limit <= 0) return [];

  // FRISS: 7 napon belül publikált — hír ÉS útmutató egyaránt. Ezek
  // egymással kor szerint versenyeznek (legújabb elöl), ahogy eddig is.
  const fresh = items.filter(x => x.isFresh)
    .sort((a, b) => String(b.pubAt || '').localeCompare(String(a.pubAt || '')));

  // ÖRÖKZÖLD: 7 napnál régebbi ÚTMUTATÓ. (A régi HÍR ide nem juthat — azt a
  // hívó már 'skipped-stale'-lel lezárta.) Legrégebbi elöl = a hátralék ürül.
  const evergreen = items.filter(x => !x.isFresh && x.isGuide)
    .sort((a, b) => String(a.pubAt || '').localeCompare(String(b.pubAt || '')));

  // FENNTARTOTT HELY: a helyek fele az örökzöldé. 1-es limitnél nincs mit
  // felezni — ott a friss viszi (a CI 2-vel fut, tehát 1 hely marad fenn).
  const reserved = limit >= 2 ? Math.floor(limit / 2) : 0;

  const picked = [];
  const takeEvergreen = Math.min(reserved, evergreen.length);
  // Előbb a frisset töltjük a maradék helyre, hogy a hírfolyam ne öregedjen.
  picked.push(...fresh.slice(0, limit - takeEvergreen));
  picked.push(...evergreen.slice(0, takeEvergreen));

  // MARADÉK HELY NEM VESZHET EL: ha az egyik forrás kifogyott, a másik tölti
  // fel — így a fenntartás sosem csökkenti a kiküldött posztok számát.
  if (picked.length < limit) {
    const usedFresh = picked.filter(x => x.isFresh).length;
    const usedEver = picked.length - usedFresh;
    picked.push(...fresh.slice(usedFresh, usedFresh + (limit - picked.length)));
  }
  if (picked.length < limit) {
    const usedEver = picked.filter(x => !x.isFresh).length;
    picked.push(...evergreen.slice(usedEver, usedEver + (limit - picked.length)));
  }
  return picked.slice(0, limit);
}

export default { selectSocialBatch };
