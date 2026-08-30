// ===================================================================
// MAKE MŰVELET-ŐR  —  hogy a Facebook-posztolás ne álljon meg a hónap végén
// ===================================================================
//
// A forgalmunk ~82%-a Facebookról jön, a posztolás pedig a Make ingyenes
// csomagján fut: havi 1000 művelet. Egy poszt HÁROM műveletbe kerül
// (webhook → a kép letöltése → fénykép feltöltése az oldalra).
//
// 2026-08-10: napi 6-ról 9 posztra emeltünk (27 művelet/nap = 837/hó), ami
// önmagában belefér. DE augusztus 1-9. között a Pinterest is ugyanebből a
// keretből evett, mielőtt kivezettük — és a naplói a forgatókönyv törlésével
// eltűntek, tehát utólag nem kérdezhetők le. A hónap ezért szorosabb, mint
// amit a Facebook naplója önmagában mutat.
//
// AMI ELROMLANA NÉLKÜLE: a keret betelte után a Make egyszerűen nem futtatja
// a forgatókönyvet. A webhook ettől még 200-at ad, mi "kiküldve"-nek jelöljük
// a posztot, és SOHA nem próbáljuk újra. Nem lassulás lenne, hanem néma
// veszteség — pont az a hibafajta, ami ellen a scenario-guard is készült.
//
// AMIT NEM CSINÁL: nem kérdezi le a fiók valódi kvótáját. Az API-tokenünkből
// hiányzik az `organizations:read` jog (HTTP 401, 2026-08-10-én mérve), a
// scenario-listán látszó `operations` mező pedig nem hitelesíthető: nem tudni,
// melyik időszakra vonatkozik. Amit hitelesíteni tudunk, az a FUTÁSI NAPLÓ,
// tehát abból számolunk.
// ===================================================================

/** Az ingyenes Make-csomag havi művelet-kerete. */
export const MONTHLY_CAP = 1000;

/** Efölé nem tervezünk. A 10% tartalék a becslés hibáját fedezi. */
export const SAFETY_CAP = 900;

/** Egy Facebook-poszt ára: webhook + kép letöltése + fénykép feltöltése. */
export const OPS_PER_POST = 3;

/** A CI 8 óránként fut, tehát naponta három posztoló kör van. */
export const RUNS_PER_DAY = 3;

/**
 * Hány nap van hátra a hónapból, a mai napot IS beleértve — ma is futunk még.
 * @param {string} day 'YYYY-MM-DD'
 * @returns {number} 0, ha a dátum értelmezhetetlen
 */
export function remainingDays(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return 0;
  const [, y, ho, nap] = m.map(Number);
  const hosszu = new Date(Date.UTC(y, ho, 0)).getUTCDate();   // a hónap napjai
  if (!hosszu || nap > hosszu) return 0;
  return hosszu - nap + 1;
}

/**
 * A Make futási naplójából az adott hónap műveletei.
 * A "warning" sorokban nincs `operations` mező — azokat 0-nak vesszük.
 * @param {Array<{timestamp:string, operations:number}>} logs
 * @param {string} month 'YYYY-MM'
 */
export function sumMonthOps(logs, month) {
  if (!Array.isArray(logs)) return 0;
  return logs.reduce((s, l) => {
    const d = String(l?.timestamp || '');
    return d.startsWith(month) ? s + (Number(l?.operations) || 0) : s;
  }, 0);
}

// A naplóból NEM látszó felhasználás, hónapra bontva.
//
// A Pinterest 2026-08-01…08-09 között ugyanebből a keretből evett, de a
// forgatókönyv törlésével (user-döntés, 08-09) a naplói is eltűntek —
// a törölt forgatókönyv végpontja 403-at ad, nem adatot.
//
// A becslés a 08-09-i mérésből: a Pinterest vitte a keret ~62%-át. A Facebook
// ugyanezen kilenc napon 159 műveletet használt (napló), tehát az össz-
// felhasználás ~418, ebből a Pinterest ~259. Felfelé kerekítve: az alulbecslés
// leállást okoz, a túlbecslés csak lassít — és mérve a döntés nem is ezen
// múlik (240-tel és 300-zal is ugyanaz a fokozat jön ki).
const UNTRACKED_OPS = { '2026-08': 280 };

/**
 * @param {string} month 'YYYY-MM'
 * @returns {number} a naplóban nem szereplő, de elhasznált műveletek
 */
export function untrackedOps(month) {
  return UNTRACKED_OPS[String(month || '')] || 0;
}

/**
 * Hány posztot küldjön ez a futás?
 *
 * @param {object} p
 * @param {number} p.used          a hónapban eddig elhasznált műveletek
 * @param {string} p.day           'YYYY-MM-DD' — a mai nap
 * @param {number} p.defaultLimit  amennyit alapból küldenénk
 * @returns {number} 0 … defaultLimit
 */
export function postsPerRun({ used, day, defaultLimit = 3 }) {
  const hatra = remainingDays(day);
  // ISMERETLEN ÁLLAPOT → teljes tempó. Egy API-hiba miatti fékezés biztos és
  // azonnali kár; a keret kifutása bizonytalan és a hónap legvégén jelentkezik.
  if (!Number.isFinite(used) || used < 0 || !hatra) return defaultLimit;

  // A keret tényleg elfogyott: küldeni innentől néma veszteség.
  if (used >= MONTHLY_CAP) return 0;

  // ===================================================================
  // A MARADÉK IS MENJEN KI (2026-08-17, user: „szerintem sok várakozik")
  // ===================================================================
  // Az első változat EGYENLETES EGÉSZ tempót keresett: a legnagyobb n, ami
  // minden hátralévő körre belefér. Ez elpazarolja a törtrészt. Élesben mérve
  // 08-17-én: 592 elhasználva, 45 kör hátra, 102 poszt férne bele — de a
  // 2/kör-ös fokozat csak 90-et küld ki, és 46 posztnyi keret HASZNÁLATLANUL
  // vész el a hónap végén. Közben 267 poszt várt sorára.
  //
  // Most a MARADÉK KERETBŐL számolunk, nem tempót keresünk: ennyi poszt fér
  // még bele összesen, ezt osztjuk el a hátralévő körökre, és a törtrészt az
  // ELSŐ körök kapják meg. Mivel az őr MINDEN futásnál a VALÓDI fogyásból
  // számol újra, ez önkorrigáló: ahogy a maradék elfogy, a tempó magától
  // visszaáll az egyenletesre.
  //
  // ⚠️ A BIZTONSÁG NEM CSÖKKENT: a SAFETY_CAP változatlanul 900, és egy kör
  // SOSEM küld többet, mint amennyi a fékig még belefér (`fer`). A legrosszabb
  // eset túllépése így legfeljebb OPS_PER_POST-1 művelet — a 100 műveletes
  // tartalékon belül.
  // ⚠️ KEMÉNY PLAFON — a user szabálya: „véletlenül se fogyjon el" (08-17).
  // Ez a sor egy VALÓDI hibát javít, amit a hónap-szimuláció talált meg: a
  // „fék fölött lassan megyünk tovább" ág addig küldött, amíg a `used` el nem
  // érte az 1000-et — csakhogy az UTOLSÓ poszt átvitte rajta (950-ből indulva
  // 1001 lett a vége). A `used >= MONTHLY_CAP` feltétel későn kapcsol: a
  // poszt ÁRÁT is bele kell számolni, nem csak az induló állást.
  const ferPlafonig = Math.floor((MONTHLY_CAP - used) / OPS_PER_POST);
  if (ferPlafonig <= 0) return 0;

  const korokHatra = hatra * RUNS_PER_DAY;
  const keret = SAFETY_CAP - used;

  // A fék fölött, de a valódi plafon alatt: lassan megyünk tovább, nem állunk
  // meg. A fék tartalék, nem plafon — ez a döntés 2026-08-10 óta áll.
  if (keret <= 0) return Math.min(1, ferPlafonig);

  const fer = Math.floor(keret / OPS_PER_POST);        // ennyi poszt fér még bele ÖSSZESEN
  if (fer <= 0) return Math.min(1, ferPlafonig);

  const alap = Math.floor(fer / korokHatra);
  const maradek = fer - alap * korokHatra;             // a törtrész, körökben
  const n = alap + (maradek > 0 ? 1 : 0);

  // Soha többet, mint amennyi ÖSSZESEN belefér — sem a fékig, sem a plafonig.
  return Math.min(defaultLimit, Math.max(1, n), fer, ferPlafonig);
}

// ===================================================================
// KI ESZIK A KÖZÖS KERETBŐL (2026-08-30)
// ===================================================================
//
// A keret a FIÓKÉ, nem a forgatókönyvé: minden Make-forgatókönyv ugyanabból
// az 1000-ből fogyaszt. Az őr mégis 2026-08-10 óta CSAK a Facebook-fotó
// forgatókönyvét összegezte — a Facebook Reel 08-25-én éles lett a
// 7066389-esen, és azóta láthatatlanul evett a keretből. A core/reel-post.js
// fejléce ezt előre leírta; a bekötéskor maradt el.
//
// AMI ELROMLIK EGY ALULBECSÜLT SZÁMTÓL: az őr későn fékez, a keret elfogy, a
// Make nem futtatja a forgatókönyvet — a webhook viszont továbbra is 200-at ad,
// mi „kiküldve"-nek jelöljük a posztot, és SOHA nem próbáljuk újra.
//
// ⚠️ ÚJ CSATORNA FELVÉTELE: egy sor ide, ÉS egy sor a core/daily-report.js
// WATCH-listájába (az figyeli, hogy a forgatókönyv áll-e / hiányos-e / bukik-e).
// A kettő külön kérdés: ez a MENNYIT FOGYASZT, az a MŰKÖDIK-E.

/** A Facebook-fotó forgatókönyv (a napi posztok). Nem titok — a token az. */
export const FB_SCENARIO_ID = '6452490';

/** A Facebook Reel forgatókönyv (napi egy álló videó, 2026-08-25 óta éles). */
export const REEL_SCENARIO_ID = '7066389';

/**
 * Egy Reel ára: webhook + a Reel-feltöltő modul. (URL-módban a Facebook maga
 * tölti le a videót, ezért nincs külön letöltő lépés, mint a fotós posztnál.)
 * Napi EGY Reel megy ki → ~60 művelet/hó.
 */
export const REEL_OPS_PER_DAY = 2;

/** A KÖZÖS keretből evő forgatókönyvek. `napiOps` = becslés, ha a napló néma. */
export const SHARED_SCENARIOS = [
  { id: FB_SCENARIO_ID, nev: 'FB-poszt', napiOps: 0 },
  { id: REEL_SCENARIO_ID, nev: 'FB Reel', napiOps: REEL_OPS_PER_DAY }
];

/**
 * Mennyit fogyaszthatott a hónap elejétől MÁIG egy ismert napi tempójú
 * forgatókönyv? Csak akkor számol, ha a naplója nem kérdezhető le.
 *
 * A becslés SZÁNDÉKOSAN felfelé kerekít (a hónap minden napjára számol, akkor
 * is, ha a csatorna a hónap közben indult): ugyanaz az elv, mint az
 * UNTRACKED_OPS-nál — az alulbecslés leállást okoz, a túlbecslés csak lassít.
 *
 * @returns {number|null} null, ha nincs mihez viszonyítani
 */
export function estimateOps(napiOps, day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m || !Number.isFinite(Number(napiOps)) || Number(napiOps) <= 0) return null;
  return Number(napiOps) * Number(m[3]);
}

/**
 * EGY forgatókönyv havi művelet-fogyása a Make futási naplójából.
 *
 * @returns {number|null} null = NEM TUDJUK (hiba, hiányzó jog, törölt
 *   forgatókönyv). A nulla és az ismeretlen KÉT KÜLÖN dolog: a nulla azt
 *   állítaná, hogy a csatorna nem fogyaszt.
 */
export async function scenarioMonthOps(id, { token, fetchFn = fetch, month, timeoutMs = 15000 } = {}) {
  if (!id || !token || !month) return null;
  let osszes = 0, offset = 0;
  try {
    // Lapozva: a végpont legfeljebb 50 sort ad (100-ra HTTP 400). Egy hónap
    // ~90 futás, tehát 4 oldal bőven elég — a régebbi sorok már más hónapé.
    for (let oldal = 0; oldal < 4; oldal++) {
      const r = await fetchFn(
        `https://eu1.make.com/api/v2/scenarios/${id}/logs?pg[limit]=50&pg[offset]=${offset}&pg[sortDir]=desc`,
        { headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(timeoutMs) });
      if (!r || !r.ok) return null;
      const sorok = (await r.json().catch(() => ({}))).scenarioLogs || [];
      if (!sorok.length) break;
      osszes += sumMonthOps(sorok, month);
      offset += sorok.length;
      // Ha az oldal legrégebbi sora már az előző hónapé, nincs mit tovább lapozni.
      if (String(sorok[sorok.length - 1]?.timestamp || '') < month) break;
      if (sorok.length < 50) break;
    }
  } catch { return null; }
  return osszes;
}

/**
 * A KÖZÖS keret állása: minden figyelt forgatókönyv + a naplóból nem látszó
 * felhasználás. Ez megy a `postsPerRun` `used` mezőjébe.
 *
 * @param {object} p
 * @param {string} p.token      MAKE_API_TOKEN
 * @param {string} p.day        'YYYY-MM-DD' — a mai nap
 * @param {Function} [p.fetchFn]
 * @param {Array} [p.scenarios] alapból SHARED_SCENARIOS
 * @returns {Promise<number|null>} null = ISMERETLEN → NEM fékezünk
 *
 * ⚠️ A NULL NEM NULLA. Ha a fő forgatókönyv naplója nem jön (API-hiba), az
 * egész szám hamis lenne — ilyenkor inkább teljes tempón megyünk: egy API-hiba
 * miatti visszavétel biztos és azonnali kár, a keret kifutása bizonytalan és
 * hó végi. Amelyik csatornának viszont ismert a napi tempója (Reel), ott a
 * becslés jobb, mint a nulla — különben egy törölt/átnevezett forgatókönyv
 * NÉMÁN ingyenessé válna a számításban.
 */
export async function usedThisMonth({ token, day, fetchFn = fetch, scenarios = SHARED_SCENARIOS, timeoutMs } = {}) {
  const t = String(token || '').trim();
  const honap = String(day || '').slice(0, 7);
  if (!t || !/^\d{4}-\d{2}$/.test(honap)) return null;

  let osszes = 0;
  for (const sc of scenarios) {
    const ops = await scenarioMonthOps(sc.id, { token: t, fetchFn, month: honap, timeoutMs });
    if (Number.isFinite(ops)) { osszes += ops; continue; }
    const becsles = estimateOps(sc.napiOps, day);
    if (becsles === null) return null;
    osszes += becsles;
  }
  // A naplóból nem látszó felhasználás (törölt Pinterest) — EGYSZER.
  return osszes + untrackedOps(honap);
}

export default {
  postsPerRun, remainingDays, sumMonthOps, untrackedOps,
  scenarioMonthOps, usedThisMonth, estimateOps,
  MONTHLY_CAP, SAFETY_CAP, OPS_PER_POST, RUNS_PER_DAY,
  SHARED_SCENARIOS, FB_SCENARIO_ID, REEL_SCENARIO_ID, REEL_OPS_PER_DAY
};

/**
 * A művelet-keret SORA a napi riportba (2026-08-30).
 *
 * MIÉRT KELL: a keret-logika 2026-08-09 óta létezik, de a szám EDDIG CSAK A
 * CI-NAPLÓBA került — vagyis senkihez. A projekt saját szabálya szerint az
 * őrszem csak akkor őr, ha odaszól, ahol a user néz.
 *
 * 🔑 ÉS MOST MÁR SZOROS. Mérve (2026-08-30, hátralék-elemzés): teljes tempón
 * napi 9 FB-poszt (3 művelet) + 1 Reel (2 művelet) = 29 művelet/nap.
 *     31 napos hónapban: 899 művelet — a 900-as biztonsági plafonnál.
 *     ⇒ EGYETLEN művelet tartalék.
 * A Reel 2026-08-25-i bekötése ette be a korábbi tartalékot. Ez nem egyszeri
 * hiba, hanem VISSZATÉRŐ, SZERKEZETI szorítás minden 31 napos hónap végén:
 * ilyenkor a garantált hátralék-hely (limit ≥ 3 kell hozzá) magától lekapcsol.
 *
 * A sor CSENDES, amíg van tartalék — csak a szorosnál szólal meg, és a
 * riasztó változat ⚠️-vel kezdődik, hogy a zajszűrő sose némíthassa el.
 *
 * @param {number|null} used  a hónapban eddig elhasznált művelet (null = nem tudjuk)
 * @param {string} day        YYYY-MM-DD
 */
export function keretSor(used, day) {
  if (used === null || used === undefined || !Number.isFinite(Number(used))) {
    // ⚠️ A „nem tudom" NEM „rendben van". A Make kvótája nem lekérdezhető
    // közvetlenül; ha a naplóból sem jön szám, azt látni kell.
    return '⚠️ Make-keret: NEM TUDTAM lekérdezni — a fékezés vakon megy.';
  }
  const n = Number(used);
  const marad = SAFETY_CAP - n;
  const hatra = remainingDays(day);
  if (!Number.isFinite(hatra)) return '';
  // ⚠️ A VETÍTÉS A MÉRT TEMPÓBÓL, NEM az elméleti maximumból (2026-08-30).
  // Az első változatom a teljes tempót (29 művelet/nap) vetítette előre, és
  // ezzel a hónap ELEJÉN is riasztott — pont az a napi zaj lett volna belőle,
  // amit ma egész nap irtottunk. A tényleges fogyás önmagát korrigálja.
  const honapNapja = Number(String(day).slice(8, 10));
  if (!Number.isFinite(honapNapja) || honapNapja < 3) return '';   // pár napból nincs tempó
  const napiTeny = n / honapNapja;
  const varhato = Math.round(n + napiTeny * hatra);

  if (varhato > SAFETY_CAP) {
    return `⚠️ MAKE-KERET SZŰK: ${n}/${SAFETY_CAP} elhasználva, `
      + `a hónap végéig várhatóan ${varhato} lenne — a poszter magától visszavesz. `
      + `(Új csatorna MOST nem fér bele.)`;
  }
  if (marad < 100) return `🚦 Make-keret: ${n}/${SAFETY_CAP} · ${marad} művelet a tartalék`;
  return '';                                              // bőven van hely — csendes
}
