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
export function selectSocialBatch(items, limit, { csakFriss = false, now = null } = {}) {
  if (!Array.isArray(items) || limit <= 0) return [];

  const ujElol = (a, b) => String(b.pubAt || '').localeCompare(String(a.pubAt || ''));
  const regiElol = (a, b) => String(a.pubAt || '').localeCompare(String(b.pubAt || ''));

  // FRISS: 7 napon belül publikált — hír ÉS útmutató egyaránt, legújabb elöl.
  const fresh = items.filter(x => x.isFresh).sort(ujElol);

  // CSAK FRISS (2026-09-27, user: „állítsuk le a régi posztok kiküldését, csak a
  // napinál maradjunk"). A Facebookon a régi útmutatók helyét a REEL veszi át
  // (az hoz idegeneket, és olcsóbb a Make-kereten); a Threads (Buffer, ingyenes)
  // továbbra is üríti a hátralékot — ezért kapcsoló, nem törlés.
  // + AZNAP ELŐL (2026-11-10, `now` megadásával): a mai és tegnapi cikkek a legrégebbitől — lásd lent.
  if (csakFriss) return (Number.isFinite(now) ? aznapElol(fresh, now) : fresh).slice(0, limit);

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

// ===================================================================
// AMI AZNAP KÉSZÜLT, AZ AZNAP KI IS MENJEN — MINDEN CSATORNÁRA (2026-11-10)
// ===================================================================
// USER: „azt szeretném, hogy amit megírunk aznap, az jöjjön le a közösségi
// hálózatokon, de mind, ami aznap készült!"
//
// MÉRVE (11-02 → 11-10, content/social + cikk _meta): a Facebook szinte mind
// aznap kint volt, DE a Threadsre napi 3–4 cikk nem jutott el (11-09: 7-ből 4,
// 11-10: 8-ból 4), a TikTokra pedig 11-09-én 7-ből 3, 11-10-én 8-ból 2.
// A három ok:
//   1) FIX FUTÁSONKÉNTI DARAB: a CI `--limit 3` (FB) és `--limit 2` (Buffer) —
//      a CI viszont sokszor csak KÉTSZER fut egy nap (a cron késik/kimarad),
//      így a Threadsre napi 4 fért, miközben 7–10 cikk készült.
//   2) LEGÚJABB ELŐL: a szűk helyen a hajnali cikk (11-09 Google Meet, 03:36Z)
//      mindig hátrébb csúszott a frissebbek mögé — és SOHA nem ment ki.
//   3) TIKTOK: futásonként 1, naponta 3 fotó (core/tiktok-foto.js).
//
// A JAVÍTÁS:
//   • `aznapiKeret()`: a futás darabszáma legalább annyi, ahány mai/tegnapi
//     cikk még vár (felülről AZNAP_FUTAS_MAX), a `--limit` csak az alsó határ.
//     A Facebookon a Make-őr (core/make-budget.js postsPerRun) ezután is fékez.
//   • `aznapElol()`: a mai + tegnapi (UTC) cikkek kerülnek előre, a LEGRÉGEBBI
//     elöl — így a hajnali cikk nem tud kiéhezni; utánuk a többi friss a
//     szokásos sorrendben (legújabb elöl).
// A „tegnapi" azért kell, mert az este 19 UTC után megírt cikket aznap már
// nincs futás, ami kivigye — annak a másnap reggeli az első dolga.
// ===================================================================

/** Egy futásban legfeljebb ennyi poszt csatornánként (ne egy tömbben menjen ki a nap). */
export const AZNAP_FUTAS_MAX = 8;

const utcNap = ms => new Date(ms).toISOString().slice(0, 10);

/** Ma vagy tegnap (UTC) jelent-e meg az elem (`pubAt` ISO időbélyeg)? */
export function aznapiE(x, now) {
  const p = String(x?.pubAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p) || !Number.isFinite(now)) return false;
  return p === utcNap(now) || p === utcNap(now - 864e5);
}

/**
 * Sorrend: előbb a mai + tegnapi elemek a LEGRÉGEBBITŐL, utána a többi a LEGÚJABBTÓL.
 * Nem módosítja a bemenetet.
 */
export function aznapElol(items, now) {
  if (!Array.isArray(items)) return [];
  const regiElol = (a, b) => String(a.pubAt || '').localeCompare(String(b.pubAt || ''));
  const ujElol = (a, b) => String(b.pubAt || '').localeCompare(String(a.pubAt || ''));
  const aznap = items.filter(x => aznapiE(x, now)).sort(regiElol);
  const tobbi = items.filter(x => !aznapiE(x, now)).sort(ujElol);
  return [...aznap, ...tobbi];
}

/**
 * Hány poszt menjen ki ebben a futásban: legalább `alap` (a `--limit`), de ha
 * ennél több mai/tegnapi friss elem vár, akkor annyi — legfeljebb `max`.
 * Rossz bemenetre az `alap` (a régi viselkedés).
 */
export function aznapiKeret({ items, alap, now, max = AZNAP_FUTAS_MAX } = {}) {
  const a = Number.isFinite(alap) && alap > 0 ? Math.floor(alap) : 0;
  if (!Array.isArray(items) || !Number.isFinite(now)) return a;
  const var_ = items.filter(x => x?.isFresh && aznapiE(x, now)).length;
  return Math.max(a, Math.min(Number.isFinite(max) ? max : AZNAP_FUTAS_MAX, var_));
}

export default { selectSocialBatch, DRAIN_SLOT_FROM, AZNAP_FUTAS_MAX, aznapiE, aznapElol, aznapiKeret };
