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
import { ENGEDELY, engedelyezett, slugCim, UA } from './sugo-index.js';
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

// ---------------------------------------------------------------------------------------------------
// FELFEDEZÉS (súgókereső 2. lépés, 2026-11-18): robots.txt → sitemap, llms.txt → jelöltlista az eszköz saját hostjáról.
// Nincs MI, a gyorsítótár csak a futáson belül él (a hívó `cache` objektuma). Soha nem dob: hiba/üres → [].
// HOSTONKÉNT: max 12 kérés (a számláló közös a robots/sitemap/llms lépések között), 30 s kérésenként, max 5000 olvasott URL,
// max 400 jelölt, a sitemap-index legfeljebb 2 szint mélyen. A kapcsoló (FELFEDEZO_BE / `be`) csak a KÉRÉSEKET állítja le.
// ---------------------------------------------------------------------------------------------------

export const KERES_MAX = 12, URL_MAX = 5000, JELOLT_MAX = 400, SZINT_MAX = 2, IDOKORLAT_MS = 30000;

// a jelölt URL közös normalizálása: query/hash le (a .md-t a hívó vágja le, ha llms.txt-ből jött)
const tisztaUrl = u => String(u).split('#')[0].split('?')[0];

/** Linkszöveg → tiszta cím (markdown-jelek ki, szóközök össze, max 160 karakter); üres, ha nem marad érdemi szöveg. */
function linkCim(szoveg) {
  return String(szoveg).replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160).trim();
}

/** A llms.txt markdown-linkjei: [szöveg](https://…); a .md végződés levágva. HTML-oldal (hibaoldal) → nincs link. */
function llmsLinkek(szoveg) {
  const s = String(szoveg || '');
  if (/^\s*</.test(s)) return [];                                   // 200-as HTML hibaoldal a llms.txt helyén
  const ki = [];
  for (const m of s.matchAll(/\[([^\]]*)\]\((https:\/\/[^)\s]+)[^)]*\)/g)) ki.push({ url: tisztaUrl(m[2]).replace(/\.md$/i, ''), cim: linkCim(m[1]) });
  return ki;
}

/** Az eszköz hostjának jelöltjei (robots → sitemap, llms.txt); [] ha nincs host / ki van kapcsolva / hiba. */
export async function felfedez(eszkozNev, { fetchFn = fetch, cache = {}, toolLinks, be = FELFEDEZO_BE } = {}) {
  try {
    if (!be) return [];                                              // a kapcsoló csak a kéréseket állítja le
    const host = toolLinks ? felfedezoHost(eszkozNev, toolLinks) : felfedezoHost(eszkozNev);
    if (!host) return [];
    if (Object.hasOwn(cache, host)) return cache[host];

    const jeloltek = new Map();                                      // url → {url, cim, felfedezett}; a beszúrási sorrend marad
    let keresek = 0, olvasott = 0;
    const sajatHost = u => { try { const p = new URL(u); return p.protocol === 'https:' && p.hostname.toLowerCase() === host; } catch { return false; } };

    // egy lekérés a közös számlálóval; nem-200, kivétel, időtúllépés → null (a lépés kimarad)
    const kerel = async url => {
      if (keresek >= KERES_MAX) return null;
      keresek++;
      try {
        const r = await fetchFn(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(IDOKORLAT_MS) });
        if (!r || r.status !== 200) return null;
        return String(await r.text());
      } catch { return null; }
    };
    const felvesz = (url, cim) => {
      const u = tisztaUrl(url);
      if (!felfedezettEngedelyezett(u, eszkozNev, toolLinks)) return;
      const van = jeloltek.get(u);
      if (van) { if (cim && !van.linkcim) { van.cim = cim; van.linkcim = true; } return; }   // a linkszöveg-cím nyer a slug ellen; több linkszövegből az első marad
      if (jeloltek.size >= JELOLT_MAX) return;
      jeloltek.set(u, { url: u, cim: cim || slugCim(u), felfedezett: true, linkcim: !!cim });
    };

    // 1) robots.txt → Sitemap-sorok (csak az eszköz hostja), sitemap-index rekurzió legfeljebb SZINT_MAX szint
    const latottSitemap = new Set();
    const sitemapBejar = async (url, szint) => {
      if (latottSitemap.has(url) || !sajatHost(url) || olvasott >= URL_MAX) return;
      latottSitemap.add(url);
      const xml = await kerel(url);
      if (xml === null) return;
      const lockok = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
      if (/<sitemapindex[\s>]/i.test(xml)) {
        if (szint >= SZINT_MAX) return;
        for (const al of lockok) await sitemapBejar(al, szint + 1);
        return;
      }
      for (const loc of lockok) {
        if (olvasott >= URL_MAX) break;
        olvasott++;
        felvesz(loc, '');
      }
    };
    const robots = await kerel(`https://${host}/robots.txt`);
    if (robots !== null) {
      for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) await sitemapBejar(m[1], 0);
    }

    // 2) llms.txt (gyökér és /docs): markdown-linkek; a redirect után kapott tartalmat is feldolgozzuk, csak a jelölt-hostot szűrjük
    for (const ut of ['/llms.txt', '/docs/llms.txt']) {
      const szoveg = await kerel(`https://${host}${ut}`);
      if (szoveg === null) continue;
      for (const l of llmsLinkek(szoveg)) felvesz(l.url, l.cim);
    }

    const ki = [...jeloltek.values()].map(({ url, cim }) => ({ url, cim, felfedezett: true }));
    cache[host] = ki;
    return ki;
  } catch { return []; }
}

export default { FELFEDEZO_BE, KERES_MAX, URL_MAX, JELOLT_MAX, SZINT_MAX, IDOKORLAT_MS, felfedezoHost, sugoJellegu, felfedezettEngedelyezett, forrasEngedelyezett, felfedez };
