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

  for (let n = defaultLimit; n >= 1; n--) {
    if (used + hatra * RUNS_PER_DAY * n * OPS_PER_POST <= SAFETY_CAP) return n;
  }
  // A legszűkebb tempó sem fér bele a fékig — de a keret még nem fogyott el.
  // Jobb lassan posztolni, mint megállni: a fék tartalék, nem plafon.
  return 1;
}

export default {
  postsPerRun, remainingDays, sumMonthOps, untrackedOps,
  MONTHLY_CAP, SAFETY_CAP, OPS_PER_POST, RUNS_PER_DAY
};
