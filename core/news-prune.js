// ===================================================================
// LEJÁRT HÍREK — a DÖNTÉS (2026-10-20, user: „nem is az volt a szabály! ha 60 napig nem
// olvassa senki, akkor van törlés — a cikkeknél 90 nap!")
// ===================================================================
// Eddig a hír a KORA miatt törlődött (90 nap után akkor is, ha olvasták): a
// „How to spot AI-generated content creators…" 09-29-én eltűnt, és utána is napi
// ~2 olvasó futott 404-re. Mostantól a hír akkor törlődik, ha 90 napnál régebbi
// ÉS az utolsó 90 napban senki nem olvasta — az útmutató-törlés (core/guide-prune.js,
// 60 nap) mintájára, ugyanazokkal a hibakapukkal.
//
// 🔑 FAIL-CLOSED: ha a forgalmi napló nem fedi le hiánytalanul a 90 napot (pl. 10-31-ig,
// mert a napló 08-02-án indult), NEM törlünk — egy kimaradt törlés semmibe nem kerül,
// egy olvasott cikk eltüntetése igen. Ez a modul csak SZÁMOL (hálózat és lemez nélkül);
// a törlést a Házmester végzi (core/housekeeping.js pruneOldNews).
// ===================================================================
import { latogatasok, lefedettseg } from './guide-prune.js';

const NAP = 864e5;

/**
 * Mely hírek törölhetők? A `hirek` CSAK nem-örökzöld cikk legyen (a hívó szűr).
 * @param {{hirek: {f?: string, slug: string, published_at: string}[], days: object, now?: number, keepDays?: number}} p
 * @returns {{ok: boolean, ok_ok: string, regiek: number, torlendo: object[], olvasott: object[]}}
 */
export function hirTorlendok({ hirek, days, now = Date.now(), keepDays = 90 }) {
  const cutoff = now - keepDays * NAP;
  const regiek = (hirek || []).filter(h => {
    const t = Date.parse(h?.published_at || '');
    return Number.isFinite(t) && t < cutoff;          // dátum nélkülit nem bántunk
  });
  const ures = { regiek: regiek.length, torlendo: [], olvasott: [] };
  if (!regiek.length) return { ok: true, ok_ok: '', ...ures };
  const lf = lefedettseg(days, now, keepDays);
  if (!lf.ok) return { ok: false, ok_ok: lf.ok_ok, ...ures };
  const v = latogatasok(days, lf.ig, keepDays);
  if (!v.size) return { ok: false, ok_ok: 'a forgalmi naplóban egyetlen cikk-látogatás sincs az ablakban (útvonal-formátum változott?)', ...ures };
  const olvasottE = h => !!h.slug && v.get(h.slug) > 0;
  return { ok: true, ok_ok: '', regiek: regiek.length, torlendo: regiek.filter(h => !olvasottE(h)), olvasott: regiek.filter(olvasottE) };
}
