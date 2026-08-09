// ===================================================================
// SOCIAL SOR — kit küldünk ki a következő körben
// ===================================================================
//
// ── ELŐZMÉNY (2026-08-04) ──
// A poszter kor szerint rangsorolt (friss előre), és futásonként 2 posztot
// küldött. Közben napi ~8,5 megosztható tartalom készült, tehát a friss sor
// gyorsabban töltődött, mint ürült, és ami 7 napnál öregebb lett, az SOHA
// nem jutott előre. Mérve: 156 útmutató ragadt a sorban, 230 hír elévült.
// Megoldás volt: a helyek FELE fenntartva az örökzöld útmutatónak, FIFO-ban.
//
// ── MOSTANI VÁLTOZÁS (2026-08-09, USER-DÖNTÉS) ──
// „Mindig a friss kerüljön előre" + „mivel nincs Pinterest, azt forgasd bele,
// hogy minél előbb kimenjen."
//
// ⚠️ A KÉT KÉRÉS ÖNMAGÁBAN KIOLTJA EGYMÁST — ezt méréssel mutattuk ki:
//     napi termés 8,5 · napi hely 9 · hátralék 191 útmutató
//     ha a friss MINDIG nyer, a hátraléknak 0,5 hely/nap marad → 382 nap
// Ezért a megoldás: a friss viszi a helyek nagy részét, DE egy hely fixen a
// hátraléké (a LEGRÉGEBBI megy oda). Így a friss gyorsan kimegy, a régiek
// pedig kiszámíthatóan fogynak ahelyett, hogy örökre beragadnának.
//
// A napi 9 poszt (3/futás × 3 futás) a Pinteresttől felszabadult Make-
// keretből telik ki: 9 × 3 művelet × 31 nap = 837/hó, az ingyenes 1000 alatt.
// ===================================================================

// A hátralék-hely csak ettől a limittől él. 1-2 posztos körben nincs mit
// felezni — ott a friss viszi, különben a hírfolyam megöregedne.
export const DRAIN_SLOT_FROM = 3;

/**
 * @param {Array<{pubAt:string, isGuide:boolean, isFresh:boolean}>} items
 * @param {number} limit  hány poszt mehet ki ebben a körben
 * @returns {Array} a kiválasztott elemek, kiküldési sorrendben
 */
export function selectSocialBatch(items, limit) {
  if (!Array.isArray(items) || limit <= 0) return [];

  const ujElol = (a, b) => String(b.pubAt || '').localeCompare(String(a.pubAt || ''));
  const regiElol = (a, b) => String(a.pubAt || '').localeCompare(String(b.pubAt || ''));

  // FRISS: 7 napon belül publikált — hír ÉS útmutató egyaránt, legújabb elöl.
  const fresh = items.filter(x => x.isFresh).sort(ujElol);

  // HÁTRALÉK: 7 napnál régebbi ÚTMUTATÓ. (Régi HÍR ide nem juthat — azt a
  // hívó már lezárta.) A garantált helyre a LEGRÉGEBBI megy, hogy a sor
  // vége is elfogyjon; a további helyekre viszont a frissebb.
  const backlog = items.filter(x => !x.isFresh && x.isGuide);
  const legregebbi = backlog.slice().sort(regiElol);
  const legujabb = backlog.slice().sort(ujElol);

  const picked = [];
  const add = x => { if (x && !picked.includes(x)) picked.push(x); };

  // 1) A GARANTÁLT HÁTRALÉK-HELY. Ez megy be először, hogy a friss bősége
  //    soha ne tudja kiszorítani — ez a különbség a 382 nap és a ~60 között.
  if (limit >= DRAIN_SLOT_FROM) add(legregebbi[0]);

  // 2) A TÖBBI HELYRE A FRISS, legújabb elöl (user-szabály).
  for (const x of fresh) { if (picked.length >= limit) break; add(x); }

  // 3) MARADÉK HELY NEM VESZHET EL: ha kevés a friss, a hátralék tölti fel —
  //    ide már a FRISSEBB régi megy, mert a friss elsőbbsége itt is él.
  for (const x of legujabb) { if (picked.length >= limit) break; add(x); }

  // 4) Ha még mindig maradt hely (pl. a drain-hely üres volt), a legrégebbi
  //    oldalról töltünk — így egyetlen kör sem megy ki félig üresen.
  for (const x of legregebbi) { if (picked.length >= limit) break; add(x); }

  // KIVÁLASZTÁS ≠ SORREND. Fent azért került be a hátralék-elem ELSŐNEK, hogy
  // a friss bősége ne szoríthassa ki. A KIKÜLDÉS sorrendje viszont a user
  // szabálya szerint megy: elöl a friss, azon belül a legújabb.
  return picked.slice(0, limit).sort((a, b) => {
    if (!!a.isFresh !== !!b.isFresh) return a.isFresh ? -1 : 1;
    return ujElol(a, b);
  });
}

export default { selectSocialBatch, DRAIN_SLOT_FROM };
