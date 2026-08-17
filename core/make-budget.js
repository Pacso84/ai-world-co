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

export default {
  postsPerRun, remainingDays, sumMonthOps, untrackedOps,
  MONTHLY_CAP, SAFETY_CAP, OPS_PER_POST, RUNS_PER_DAY
};
