// ===================================================================
// HOST-KANONIZÁLÓ MIDDLEWARE (2026-07-31)
// ===================================================================
//
// MIÉRT: az oldal HÁROM címen élt egyszerre — aiworldhq.com, www.aiworldhq.com
// és aiworldco.pages.dev — mindhárom 200-zal szolgálta ki ugyanazt.
//
// ELŐSZÖR a _redirects-szel próbáltuk (https://www.… /* → … minta), de KINTRŐL
// MÉRVE kiderült: a Cloudflare Pages az ABSZOLÚT CÍMES forrás-szabályt némán
// figyelmen kívül hagyja — a pages.dev-sor is halott volt a kezdetek óta,
// pedig mindenki működőnek hitte. (Tanulság: a szabály megléte nem bizonyíték,
// csak a kintről mért 301.)
//
// EZ A MIDDLEWARE a működő út: minden kérésnél megnézi a hostot, és ha nem a
// fő domain, 301-gyel odaküldi — az útvonal és a query megtartásával. A fő
// domainen egyetlen fejléc-összehasonlítás az ára, aztán továbbenged.
//
// A _redirects (1440+ szabály) TOVÁBBRA IS ÉL: a statikus átirányítások a
// middleware ELŐTT értékelődnek ki, ez csak a nem-illeszkedő kéréseket kapja.
// ===================================================================

// ===================================================================
// 📚 INGYENES PDF-LETÖLTÉS SZÁMLÁLÓ (2026-10-07)
// ===================================================================
// Ha a kérés a közös szabály (core/pdf-download.js) szerint EMBERI letöltés,
// a háttérben (waitUntil) jelez a Worker számlálójának. A letöltést SOHA nem
// lassítja és nem akaszthatja meg: a válasz előbb megy ki, a jel hibája néma.
import { letoltesFajl } from '../core/pdf-download.js';

const CANONICAL_HOST = 'aiworldhq.com';
const DL_JEL = 'https://api.aiworldhq.com/dl-hit';
// 🧵 FORRÁS-JEL (2026-10-22): a jelölt közösségi linkkel (?src=th) érkező EMBERI oldalletöltés számlálása.
const SRC_JEL = 'https://api.aiworldhq.com/src-hit';
export const FORRASOK = ['th'];
const ROBOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|meta-external|preview|headless|curl|wget|python|node-fetch/i;
/** Számolandó-e: ismert forrás-jel, GET, 200-as HTML-oldal, nem robot. */
export function forrasJel({ src, method, status, ua, tipus }) {
  return FORRASOK.includes(src) && method === 'GET' && status === 200 && /text\/html/.test(tipus || '') && !ROBOT_UA.test(ua || '') ? src : null;
}

export async function onRequest({ request, next, waitUntil }) {
  const url = new URL(request.url);
  if (url.hostname !== CANONICAL_HOST) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  const res = await next();
  try {
    const f = letoltesFajl({
      path: url.pathname, method: request.method, status: res.status,
      range: request.headers.get('Range'), ua: request.headers.get('User-Agent')
    });
    if (f) {
      waitUntil(fetch(DL_JEL, {
        // Saját UA: a Cloudflare a robotgyanús (pl. curl) UA-t 403-mal fogja meg — mérve 10-08.
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'aiworldhq-pages/1.0 (+https://aiworldhq.com)' },
        body: JSON.stringify({ f })
      }).catch(() => {}));
    }
    const s = forrasJel({ src: url.searchParams.get('src'), method: request.method, status: res.status, ua: request.headers.get('User-Agent'), tipus: res.headers.get('Content-Type') });
    if (s) {
      waitUntil(fetch(SRC_JEL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'aiworldhq-pages/1.0 (+https://aiworldhq.com)' },
        body: JSON.stringify({ s })
      }).catch(() => {}));
    }
  } catch { /* a számláló hibája nem a látogató gondja */ }
  return res;
}
