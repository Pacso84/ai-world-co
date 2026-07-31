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

const CANONICAL_HOST = 'aiworldhq.com';

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname !== CANONICAL_HOST) {
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
