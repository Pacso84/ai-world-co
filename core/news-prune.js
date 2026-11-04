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
/** Hány egymást követő, nem üres nap van a naplóban az utolsó naptól visszafelé? */
export function folyamatosNapok(days) {
  const van = new Set(Object.keys(days || {}).filter(k => Array.isArray(days[k]) && days[k].length));
  const utolso = [...van].sort().pop();
  if (!utolso) return 0;
  let n = 0;
  while (van.has(new Date(Date.parse(utolso) - n * NAP).toISOString().slice(0, 10))) n++;
  return n;
}

// 2026-10-21 (user: „folytassuk a hírek törlését is!”): a napló 08-02-án indult, a 90 napot csak
// ~10-31-re fedi le. A júliusi napokat a Cloudflare-ből NEM lehet pótolni (a 7 napnál régebbit tízesre
// kerekíti — a kevés olvasót nullának mutatná). Ezért `minAblak`: ha a hiánytalan napló ennél hosszabb,
// a TELJES mért időszak az olvasottsági ablak (most ~80 nap), és amint eléri a `keepDays`-t, magától az.
// A KOR-határ (90 nap) nem változik. Alapértelmezésben `minAblak = keepDays` (a régi, szigorú viselkedés).
export function hirTorlendok({ hirek, days, now = Date.now(), keepDays = 90, minAblak = keepDays }) {
  const cutoff = now - keepDays * NAP;
  const regiek = (hirek || []).filter(h => {
    const t = Date.parse(h?.published_at || '');
    return Number.isFinite(t) && t < cutoff;          // dátum nélkülit nem bántunk
  });
  const ures = { regiek: regiek.length, torlendo: [], olvasott: [] };
  if (!regiek.length) return { ok: true, ok_ok: '', ...ures };
  const ablak = Math.min(keepDays, folyamatosNapok(days));
  if (ablak < minAblak) {
    const utolso = Object.keys(days || {}).sort().pop();
    const hianyzo = utolso ? new Date(Date.parse(utolso) - ablak * NAP).toISOString().slice(0, 10) : '?';
    return { ok: false, ok_ok: `hiányzó nap a forgalmi naplóban: ${hianyzo} (hiánytalan: ${ablak} nap, kell legalább ${minAblak})`, ...ures, ablak };
  }
  const lf = lefedettseg(days, now, ablak);
  if (!lf.ok) return { ok: false, ok_ok: lf.ok_ok, ...ures, ablak };
  const v = latogatasok(days, lf.ig, ablak);
  if (!v.size) return { ok: false, ok_ok: 'a forgalmi naplóban egyetlen cikk-látogatás sincs az ablakban (útvonal-formátum változott?)', ...ures, ablak };
  const olvasottE = h => !!h.slug && v.get(h.slug) > 0;
  return { ok: true, ok_ok: '', regiek: regiek.length, torlendo: regiek.filter(h => !olvasottE(h)), olvasott: regiek.filter(olvasottE), ablak };
}
