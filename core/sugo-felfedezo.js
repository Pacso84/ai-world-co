// ===================================================================
// SÚGÓ-FELFEDEZŐ — ENGEDÉLY-RÉSZ (súgókereső 1. lépés, 2026-11-18)
// ===================================================================
//
// MIÉRT: user 11-16: „csináljunk egy súgókeresőt”. Ha a rögzített hivatalos súgólistában (core/sugo-index.js ENGEDELY)
// nincs a témához illő cikk, a kód később az ESZKÖZ SAJÁT hivatalos hosztján keres súgóoldalt. Ez a modul csak a
// TILTÁS-ÉS-ENGEDÉLY réteg: tiszta függvények, nincs hálózat, nincs MI — a keresés és a letöltés a következő lépésekben jön.
//
// DÖNTÉSEK (a súgókereső terve szerint):
//   - PONTOS HOST: csak az az eszköz hivatalos címének (website/tool-links.json) pontos hosztja; nincs visszaesés
//     a regisztrált domainre vagy a www-ra (az aldomain nem öröklődik: lumo.proton.me ≠ proton.me).
//   - Ha az eszköz hosztja (www-vel vagy anélkül) egy ENGEDELY-előtag hosztja → NINCS felfedezés (null): ott a
//     jóváhagyott lista dönt, a felfedező nem tágíthatja.
//   - Csak https; port, felhasználónév, jelszó, „..” és „%2e%2e” nem lehet.
//   - Súgó-jellegű útvonal: súgó/GYIK/útmutató/docs szakasz igen; API, fejlesztői, referencia, blog, hír, jogi, ár, karrier nem;
//     nem angol nyelvi előtag (zh, en-cn…) nem.
//
// KIKAPCSOLÁS: `FELFEDEZO_BE = false` → CSAK a felfedező kéréseit állítja le (core/sugo-felfedezo felfedez-lépése, 2. feladat);
// a már eltárolt felfedezett forrásokat NEM érvényteleníti, ezért az engedély-függvények nem nézik a kapcsolót (controller döntés 11-18).
// EGY KÖZÖS ELLENŐRZÉS: a felfedezettEngedelyezett() minden használatkor újra lefuttatja a host-őrt ÉS az útvonal-szűrőt (sugoJellegu).
// Körkörös import ellen csak a core/sugo-index.js-t és a core/forras-szint.js-t importáljuk.
// ===================================================================

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ENGEDELY, engedelyezett } from './sugo-index.js';
import { forrasSzint } from './forras-szint.js';

export const FELFEDEZO_BE = true;

// A tool-links.json egyszer, lustán; hibánál üres tábla (a felfedezés ilyenkor egyszerűen nem talál hostot).
let _toolLinks = null;
function alapToolLinks() {
  if (_toolLinks) return _toolLinks;
  try { _toolLinks = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'website', 'tool-links.json'), 'utf8')); }
  catch { _toolLinks = { tools: {} }; }
  return _toolLinks;
}

// Az ENGEDELY-előtagok hostjai (kisbetűs); a lista fix, így egyszer számoljuk.
const ENGEDELY_HOSTOK = ENGEDELY.map(p => new URL(p).hostname.toLowerCase());
const hostEgyezik = (h, e) => h === e || 'www.' + h === e || h === 'www.' + e;

/** Az eszköz hivatalos címének hostja kisbetűvel; null, ha nincs/nem https/port-felhasználó van/jóváhagyott súgó hostja. */
export function felfedezoHost(eszkozNev, toolLinks = alapToolLinks()) {
  const cim = toolLinks && toolLinks.tools && eszkozNev ? toolLinks.tools[eszkozNev] : null;
  if (!cim || typeof cim !== 'string') return null;
  try {
    const p = new URL(cim);
    if (p.protocol !== 'https:' || p.port || p.username || p.password) return null;
    const h = p.hostname.toLowerCase();
    if (!h || ENGEDELY_HOSTOK.some(e => hostEgyezik(h, e))) return null;
    return h;
  } catch { return null; }
}

// Súgó-jellegű szakasz (az útvonal bármely szakasza) és kizárt szakasz; a szakasz-határ (^|/)…(/|$)
const SUGO_SZAKASZ = /(^|\/)(help(-center)?|faqs?|guides?|user-guide|support|docs)(\/|$)/;
const KIZART_SZAKASZ = /(^|\/)(api[a-z-]*|developers?|platform|reference|sdks?|cookbooks?|pricing|[a-z-]*blog|news|legal|terms|privacy|careers)(\/|$)/;
const KIZART_HOST = /^(platform|api|developers?)\./;
const NYELV_ELOTAG = /^[a-z]{2}(-[a-z]{2,4})?$/;

/** Súgó-jellegű-e az útvonal (az angol, nem API/blog/jogi szakaszok közül a súgó/docs/GYIK jellegű)? */
export function sugoJellegu(url) {
  let p;
  try { p = new URL(String(url || '')); } catch { return false; }
  if (KIZART_HOST.test(p.hostname.toLowerCase())) return false;
  const ut = p.pathname.toLowerCase().replace(/^\/+/, '');
  const elso = ut.split('/')[0];
  if (NYELV_ELOTAG.test(elso) && elso !== 'en' && elso !== 'en-us') return false;
  if (KIZART_SZAKASZ.test(ut)) return false;
  return SUGO_SZAKASZ.test(ut);
}

/** A felfedezett cím engedélyezett-e: https, az eszköz pontos hostja, nincs port/felhasználó/„..”, ÉS súgó-jellegű útvonal. */
export function felfedezettEngedelyezett(url, eszkozNev, toolLinks = alapToolLinks()) {
  const host = felfedezoHost(eszkozNev, toolLinks);
  if (!host) return false;
  const u = String(url || '');
  // ugyanaz a normalizálás, mint a core/sugo-index.js engedelyezett()-ben: a „..” / „%2e%2e” szakasz kilépne a hostról
  if (/(^|\/)(\.|%2e){1,2}(\/|$|\?|#)/i.test(u.replace(/^https:\/\/[^/]+/i, ''))) return false;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' && !p.port && !p.username && !p.password && p.hostname.toLowerCase() === host && sugoJellegu(u);
  } catch { return false; }
}

/** Elfogadható-e a forrás: jóváhagyott lista VAGY (felfedezett jelölés ÉS az eszköz saját hostján áll). */
export function forrasEngedelyezett(forras, tema, toolLinks = alapToolLinks()) {
  const url = typeof forras === 'string' ? forras : (forras && forras.url);
  if (engedelyezett(url)) return true;
  if (!forras || typeof forras === 'string' || forras.felfedezett !== true) return false;
  const eszkoz = forrasSzint(tema && tema.tool, tema && tema.company).eszkoz;
  return felfedezettEngedelyezett(url, eszkoz, toolLinks);
}

export default { FELFEDEZO_BE, felfedezoHost, sugoJellegu, felfedezettEngedelyezett, forrasEngedelyezett };
