// ===================================================================
// PIPELINE-ŐRKUTYA (2026-08-27) — kimaradt-e egy ütemezett futás?
// ===================================================================
// MI TÖRTÉNT: 2026-08-27-én a 00:00 UTC-s futás EL SEM INDULT. 04:07-kor
// még mindig nem volt se futó, se várakozó munka; az utolsó futás óta
// 11,4 óra telt el, holott a ciklus 8 órás.
//
// A MÉRÉS, ami megmutatta, hogy ez rendellenes — a megelőző 12 futás
// indulási késése:
//     37, 29, 37, 23, 29, 36, 22, 34, 37, 12, 16, 39 perc
// Egyik sem érte el a 40 percet. A 4+ óra nem ugyanaz a jelenség.
//
// NÁLUNK NEM VOLT HIBA: a munkafolyamat `active`, a YAML érvényes (az
// aznapi két korábbi futás már ugyanezzel ment), a cron változatlan.
// A GitHub az ütemezett futásokra kifejezetten „legjobb szándék" garanciát
// ad: nagy terhelésnél késhetnek, sőt KI IS MARADHATNAK.
//
// A MEGOLDÁS NEM AZ, HOGY A GITHUB ÜTEMEZŐJÉT JAVÍTJUK — nem a miénk.
// Hanem hogy TESZÜNK MELLÉ EGY FÜGGETLEN ÓRÁT. A Cloudflare Workerünk
// már fut, már van GitHub-kulcsa, és a Cloudflare cron-ja külön rendszer:
// hogy MINDKETTŐ ugyanabban az órában hibázzon, sokkal valószínűtlenebb,
// mint hogy az egyik.
//
// ⚠️ A DÖNTÉS ITT ÉL, NEM A WORKERBEN. A workert nem lehet hálózat nélkül
// tesztelni; ez a modul igen. Ugyanaz az elv, mint a csonka-mentőnél.
// ===================================================================

/** A cron ciklusa (auto.yml: `0 *​/8 * * *` → 00, 08, 16 UTC). */
export const CIKLUS_ORA = 8;

/**
 * Ennyi óra után mondjuk ki, hogy KIMARADT egy futás.
 * 8 órás ciklus + a mért legnagyobb késés (40 perc) + tartalék.
 * Szándékosan BŐKEZŰ: egy fölösleges futás pár tíz cent, egy fölöslegesen
 * riasztó őrszemről viszont leszokik az ember.
 */
export const TURELEM_ORA = 9.5;

/**
 * Ha már böktünk egyet, ennyi ideig nem bökünk újra — akkor sem, ha a
 * futás valamiért nem indult el. Enélkül egy elakadt indítás óránként
 * ismétlődő próbálkozássá fajulna.
 */
export const BOKES_SZUNET_ORA = 4;

const ORA = 3600e3;
const ido = x => {
  if (x === null || x === undefined || x === '') return null;
  const t = typeof x === 'number' ? x : Date.parse(x);
  return Number.isFinite(t) ? t : null;
};

/**
 * Be kell-e avatkozni?
 *
 * @param {object} p
 * @param {string|number|null} p.lastRunAt   az utolsó futás indulása (ISO vagy ms)
 * @param {string|number|null} [p.lastPokeAt] mikor bökött utoljára az őrkutya
 * @param {number} [p.now]
 * @returns {{trigger: boolean, reason: string, gapHours: number|null}}
 */
export function shouldTrigger({ lastRunAt, lastPokeAt = null, now = Date.now() } = {}) {
  const utolso = ido(lastRunAt);

  // ⚠️ A "NEM TUDOM" NEM "IGEN". Ha nem derül ki, mikor futott utoljára
  // (API-hiba, üres válasz, rossz dátum), NEM indítunk el semmit: a vak
  // indítás duplikált futást és dupla költést jelentene. Inkább szólunk.
  if (utolso === null) {
    return { trigger: false, reason: 'ISMERETLEN: nem derült ki az utolsó futás ideje', gapHours: null };
  }

  const oraTelt = (now - utolso) / ORA;

  // Jövőbeli időbélyeg → az óránk vagy az adat hibás. Ne cselekedjünk.
  if (oraTelt < 0) {
    return { trigger: false, reason: 'ISMERETLEN: az utolsó futás a JÖVŐBEN van', gapHours: oraTelt };
  }

  if (oraTelt < TURELEM_ORA) {
    return { trigger: false, reason: 'rendben — ' + oraTelt.toFixed(1) + ' óra telt el', gapHours: oraTelt };
  }

  const bokes = ido(lastPokeAt);
  if (bokes !== null && (now - bokes) / ORA < BOKES_SZUNET_ORA) {
    return {
      trigger: false,
      reason: 'már bökött ' + ((now - bokes) / ORA).toFixed(1) + ' órája — várok',
      gapHours: oraTelt
    };
  }

  return {
    trigger: true,
    reason: 'KIMARADT: ' + oraTelt.toFixed(1) + ' óra telt el az utolsó futás óta (a ciklus ' + CIKLUS_ORA + ' óra)',
    gapHours: oraTelt
  };
}
