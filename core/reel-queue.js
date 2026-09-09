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
//
// ── VÁLTOZATOSSÁG (2026-09-09, a user vette észre: „sok az ismétlés") ──
//
// A tiszta FIFO helyes volt, de hiányzott belőle egy szempont, és ez élesben
// kiült a nézőnek. Az utolsó 8 Reelből 6 szó szerint „Getting started with
// <asszisztens>" volt — ChatGPT, Claude, Gemini, Copilot, DeepSeek, Le Chat.
//
// 🔑 AZ OK NEM HIBA, HANEM KÖVETKEZMÉNY: a tartalmunk KÖTEGEKBEN készült. A
// legrégebbi útmutatók mind a 2026-06-22–24-i „alapító" kezdő-sorozatból
// valók. FIFO + kötegelt tartalom = TÉMA-CSOMÓSODÁS. A sor pontosan azt
// csinálta, amit kértek tőle — csak senki nem mondta neki, hogy ne
// ugyanarról szóljon egy héten át. (Mérve: a következő 30 jelöltből 15
// osztozik valakivel a cím első három szaván.)
//
// A JAVÍTÁS SZŰK: a FIFO marad a gerinc, csak ÁTUGORJUK azt a jelöltet,
// amelyik az elmúlt hét Reeljeivel azonos ESZKÖZRŐL vagy azonos cím-kezdettel
// szól. Ha minden jelölt ilyen, a legrégebbi megy — a sor SOHA nem áll meg.
// Így a hátralék ugyanúgy fogy, csak nem egy témát darál le egyszerre.
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

  // VÁLTOZATOSSÁG: az elmúlt hét Reeljének „formája" (eszköz + cím-kezdet).
  const utobbi = cikkek
    .filter(c => napja(c?.reel_at))
    .sort((a, b) => String(b.reel_at).localeCompare(String(a.reel_at)))
    .slice(0, VALTOZATOSSAG_ABLAK)
    .map(reelForma);
  const voltEszkoz = new Set(utobbi.map(x => x.eszkoz).filter(Boolean));
  const voltKezdet = new Set(utobbi.map(x => x.kezdet).filter(Boolean));

  const valtozatos = jeloltek.find(c => {
    const f = reelForma(c);
    if (f.eszkoz && voltEszkoz.has(f.eszkoz)) return false;
    if (f.kezdet && voltKezdet.has(f.kezdet)) return false;
    return true;
  });
  // ⚠️ A VISSZAESÉS KÖTELEZŐ. Ha minden jelölt hasonlít valamire, akkor is
  // MEGY Reel — a változatosság kényelem, a napi videó a feladat. Enélkül a
  // sor némán megállna, és az „elromlott" pontosan úgy nézne ki, mint a
  // „ma nem volt jelölt".
  return valtozatos || jeloltek[0];
}

// ── VÁLTOZATOSSÁG ───────────────────────────────────────────────────

/** Hány legutóbbi Reelhez viszonyítunk. Egy hét: ennyit lát egy néző egyben. */
export const VALTOZATOSSAG_ABLAK = 7;

/**
 * Mi teszi két Reelt felismerhetően EGYFORMÁVÁ a nézőnek?
 *
 * Két dolog, és mindkettő kellett a valódi eseten:
 *   • AZ ESZKÖZ — hat egymást követő Reel hat különböző asszisztensről szólt,
 *     tehát az eszköz önmagában nem fogta volna meg őket…
 *   • …a CÍM-KEZDET viszont igen: mind a hat „Getting started with…" volt.
 *
 * Három szó, mert a „getting started with" és a „how to use" is három.
 * A címet a markdownból olvassuk ki: a sor-döntés amúgy is azt kapja meg.
 */
export function reelForma(cikk) {
  const cim = (String(cikk?.md || '').match(/^title:\s*"?([^"\n]+)/m) || [])[1] || '';
  const szavak = String(cim).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  return {
    eszkoz: String(cikk?.tool || '').trim().toLowerCase(),
    kezdet: szavak.slice(0, 3).join(' ')
  };
}

export default { reelMaMar, kovetkezoReel, reelForma, VALTOZATOSSAG_ABLAK };

/**
 * A MAI Reel cikke — az, amelyiknek a `reel_at`-ja a mai nap.
 * Azért kell külön a `reelMaMar`-tól, mert a videót NEM elég egyszer
 * legyártani: lásd a core/reel-post.js `videoEletbenTart()` fejlécét.
 * @returns {object|null}
 */
export function maiReelCikk(cikkek, now = Date.now()) {
  if (!Array.isArray(cikkek)) return null;
  const ma = new Date(now).toISOString().slice(0, 10);
  return cikkek.find(c => napja(c?.reel_at) === ma) || null;
}
