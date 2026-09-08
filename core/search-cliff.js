// ===================================================================
// KERESŐ-SZAKADÉK (2026-09-08) — lépcsőben esett-e le a megjelenésünk?
// ===================================================================
// MI TÖRTÉNT: a Bing 2026-08-21-én napi 38-76 megjelenésről PONTOSAN nullára
// esett, és 18 napig senki nem vette észre — pedig a heti kereső-riport végig
// ment, és a napi adat végig elérhető volt az API-ban.
//
// 🔑 AZÉRT NEM LÁTSZOTT, MERT A RIPORT ÖSSZEGET ÍRT KI, NEM VÁLTOZÁST.
// A memóriánkban ez állt: „Bing 832 megj / 11 katt (mérve 08-26)" — csakhogy
// az a 832 szinte teljes egészében a szakadék ELŐTTI napokból jött. Egy 30
// napos összeg matematikailag képtelen megmutatni egy lépcsőt: hetekig magas
// marad azután is, hogy a napi érték nullára esett. Az összeg nem rossz szám,
// csak olyan alak, amiben ez a baj nem látszik.
//
// EZÉRT EZ A MODUL NEM ÖSSZEGET NÉZ, HANEM SZINTVÁLTÁST — és megmondja a
// NAPOT is, amikor elkezdődött. A dátum azért fontos, mert az teszi
// visszakereshetővé, mi történt aznap.
//
// ⚠️ AMIT NEM CSINÁL: nem mondja meg, MIÉRT esett le. Arra nincs adatunk —
// az a keresők doboza. Csak azt állítja, ami mérhető: leesett, és mikortól.
// ===================================================================

/**
 * Ez alatt a napi szint alatt NEM riasztunk.
 *
 * 🔑 Napi 1-2 megjelenésnél a nullára esés statisztikailag semmit nem jelent —
 * ott a zaj nagyobb, mint a jel. Egy őr, ami ilyenre is szól, néhány hét alatt
 * megtanítja a usert, hogy lapozzon át rajta; onnantól a VALÓDI riasztás is
 * elveszik. A hamis riasztás nem kisebb baj, mint a hallgatás.
 */
export const MIN_ALAP_NAPI = 5;

/** Ennyed részre esés számít szakadéknak (a korábbi szint 20%-a alá). */
export const ESES_ARANY = 0.2;

/** Ennyi napig kell TARTANIA — egy-két gyenge nap még nem szakadék. */
export const MIN_SZAKADEK_NAP = 5;

/** Ennyi napnyi adat alatt nem ítélkezünk. */
export const MIN_ADAT_NAP = 21;

const szam = x => (Number.isFinite(Number(x)) ? Number(x) : null);

/**
 * A „normál" szint becslése.
 *
 * ⚠️ A MEDIÁN ÖNMAGÁBAN NEM JÓ IDE: ha a sorozat fele már a szakadék utáni
 * nullákból áll, a medián is ~0 lesz, és a szakadék eltűnik a saját
 * mérőszámában. Ezért a FELSŐ FÉL mediánját vesszük — az a szint, amit a
 * rendszer a jó napjain hozott.
 */
function normalSzint(ertekek) {
  const rendezett = [...ertekek].sort((a, b) => b - a);
  const felsoFel = rendezett.slice(0, Math.max(1, Math.ceil(rendezett.length / 2)));
  const k = Math.floor(felsoFel.length / 2);
  return felsoFel.length % 2 ? felsoFel[k] : (felsoFel[k - 1] + felsoFel[k]) / 2;
}

/**
 * Van-e szintváltás, és mikortól?
 *
 * @param {Array<{date:string, impressions:number}>} sorozat napi adatsor
 * @param {object} [opts]
 * @returns {{szakadek:boolean, ismeretlen:boolean, mikortol:string|null,
 *            elotte:number|null, utana:number|null, napok:number}}
 */
export function szakadekVizsgalat(sorozat, opts = {}) {
  const ures = {
    szakadek: false, ismeretlen: true, mikortol: null,
    elotte: null, utana: null, napok: 0
  };
  if (!Array.isArray(sorozat)) return ures;

  const sor = sorozat
    .map(x => ({ nap: String(x?.date || ''), ertek: szam(x?.impressions) }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.nap) && x.ertek !== null && x.ertek >= 0)
    .sort((a, b) => a.nap.localeCompare(b.nap));

  if (sor.length < MIN_ADAT_NAP) return ures;

  const szint = normalSzint(sor.map(x => x.ertek));

  // Zajküszöb: kis számoknál nincs mit mérni. Ez NEM „ismeretlen" — tudjuk,
  // hogy nincs riasztható jel; egyszerűen nincs mit mondani.
  if (!(szint >= MIN_ALAP_NAPI)) {
    return { szakadek: false, ismeretlen: false, mikortol: null, elotte: szint, utana: null, napok: 0 };
  }

  const kuszob = szint * ESES_ARANY;

  // A VÉGÉRŐL visszafelé keressük a folyamatosan alacsony szakaszt. Azért a
  // végéről, mert minket a MOSTANI állapot érdekel: egy hónapja lezajlott és
  // helyreállt esésről nincs mit jelenteni.
  let i = sor.length - 1;
  while (i >= 0 && sor[i].ertek <= kuszob) i--;
  const eleje = i + 1;
  const hossz = sor.length - eleje;

  if (hossz < MIN_SZAKADEK_NAP) {
    return { szakadek: false, ismeretlen: false, mikortol: null, elotte: szint, utana: null, napok: hossz };
  }

  // Ha az EGÉSZ sorozat alacsony, nincs mihez képest esni — nem tudjuk, hogy
  // valaha is működött-e. A „nem tudom" itt sem „rendben".
  if (eleje === 0) return ures;

  const atlag = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const elotte = atlag(sor.slice(Math.max(0, eleje - 14), eleje).map(x => x.ertek));
  const utana = atlag(sor.slice(eleje).map(x => x.ertek));

  return {
    szakadek: true, ismeretlen: false,
    mikortol: sor[eleje].nap,
    elotte, utana, napok: hossz
  };
}

/**
 * A riport sora — `null`, ha nincs mondanivaló.
 *
 * A projekt bevett alakja: az őr HALLGAT, amíg minden rendben, és adathiányból
 * sem csinál zajt. Ami kimegy, az a TÜNET és a DÁTUM — utóbbi teszi
 * visszakereshetővé, mi történt aznap.
 */
export function szakadekSor(motor, eredmeny) {
  const e = eredmeny || {};
  if (!e.szakadek || !e.mikortol) return null;
  const ker = x => (x === null || x === undefined ? '?' : (x < 10 ? x.toFixed(1) : Math.round(x)));
  return `🚫 ${motor}: a megjelenés ${e.mikortol} óta ${ker(e.utana)}/nap `
    + `(előtte ${ker(e.elotte)}/nap) — ${e.napok} napja tart. `
    + `Nem lassú romlás, hanem szintváltás: nézd meg, mi történt aznap.`;
}
