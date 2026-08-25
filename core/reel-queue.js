// ===================================================================
// REEL-SOR — melyik útmutatóból legyen ma videó?
// ===================================================================
//
// ⚠️ EZ AZ EGYETLEN OK, AMIÉRT A REEL EDDIG NEM VOLT AUTOMATIKUS. Minden
// más 2026-08-24 óta kész és élesben bizonyított (videó-gyártás, Make-
// forgatókönyv, kiküldés) — de a CI NAPONTA HÁROMSZOR FUT, és jelölés
// nélkül ugyanaz a Reel naponta háromszor menne ki.
//
// A jelölés a cikk `_meta.reel_at` mezője. Ugyanaz a minta, mint a
// Facebook-poszté (`posted_fb` / `posted_at`), és ugyanabban a fájlban él,
// amit a CI amúgy is visszacommitol — nem kell külön állapotfájl, ami
// elszakadhatna a valóságtól.
//
// ── MIÉRT A LEGRÉGEBBI ───────────────────────────────────────────────
// Az útmutató ÖRÖKZÖLD, nincs romlandósága. A Facebook-sornál a friss megy
// előre (a hír romlik), itt viszont az csak azt érné el, hogy a 358 régi
// soha ne kerüljön sorra. FIFO: a hátralék kiszámíthatóan fogy.
// (Ugyanez a felismerés vezetett a core/social-queue.js hátralék-helyéhez.)
// ===================================================================

const napja = (x) => {
  const t = Date.parse(String(x || ''));
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

/**
 * Ment-e MA már Reel?
 *
 * ⚠️ A HIBÁS `reel_at` NEM számít „ma már ment"-nek. Ha a mező szemét,
 * abból nem következik, hogy ma kiment egy Reel — a rossz irány itt az
 * lenne, hogy egy elrontott mező ÖRÖKRE elnémítja a Reelt.
 */
export function reelMaMar(cikkek, now = Date.now()) {
  if (!Array.isArray(cikkek)) return false;
  const ma = new Date(now).toISOString().slice(0, 10);
  return cikkek.some(c => napja(c?.reel_at) === ma);
}

/**
 * A következő útmutató, amiből Reel készülhet.
 *
 * @param {Array} cikkek  {slug, type, published_at, reel_at}
 * @param {number} now
 * @param {object} [opts]
 * @param {(c)=>boolean} [opts.alkalmas]  extra szűrő — pl. „elég lépés van-e
 *        a cikkben". Azt, hogy egy cikkből TELIK-E videó, csak a markdown
 *        ismeretében lehet eldönteni, ezért a hívó adja be; itt nem
 *        találgatunk.
 * @returns {object|null}
 */
export function kovetkezoReel(cikkek, now = Date.now(), opts = {}) {
  if (!Array.isArray(cikkek) || !cikkek.length) return null;
  if (reelMaMar(cikkek, now)) return null;             // napi egy, és kész

  const alkalmas = typeof opts.alkalmas === 'function' ? opts.alkalmas : () => true;
  const jeloltek = cikkek.filter(c =>
    c && c.type === 'guide'
    && !napja(c.reel_at)                                // még nem volt Reel
    && napja(c.published_at)                            // dátum nélkül nem sorolható
    && alkalmas(c)
  );
  if (!jeloltek.length) return null;

  jeloltek.sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  return jeloltek[0];
}

export default { reelMaMar, kovetkezoReel };
