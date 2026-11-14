// ===================================================================
// BING-WEBHELYTÉRKÉP ŐR — a napi riportba (2026-11-14)
// ===================================================================
//
// MIÉRT: 11-14-én a user hozta a Bing jelzését: „a webhelytérképeket naponta legalább egyszer frissíteni kell”.
// A mi térképünk hibátlan volt és napi 3× frissült — de a Bing (GetFeeds API) szerint a sitemap.xml-t UTOLJÁRA
// 11-07-én próbálta beolvasni, akkor „Failed” lett, és egy hétig nem próbálta újra; a news-sitemap.xml-t pedig nem
// is ismerte. Ezt senki nem látta, mert sehol nem mértük. Kézi újraküldés (SubmitFeed) után „Pending” lett.
//
// MIT CSINÁL: a napi riport lekérdezi a Bing térkép-állapotát. CSENDES, ha minden rendben. Szól, ha egy elvárt
// térkép (1) „Failed”, (2) 4 napnál régebben volt beolvasva, (3) a Bing nem ismeri, vagy (4) 3 napnál tovább
// „Pending”. Ilyenkor MAGÁTÓL újraküldi a térképeket a Bingnek (legfeljebb 2 naponta), és a sor ezt is kimondja.
// Ingyenes (Bing Webmaster API). Hiba (nincs kulcs, nincs net, furcsa válasz) SOHA nem állítja meg a riportot.
// ===================================================================

export const SITE = 'https://aiworldhq.com/';
export const ELVART_TERKEPEK = ['https://aiworldhq.com/sitemap.xml', 'https://aiworldhq.com/news-sitemap.xml'];
export const MAX_KOR_NAP = 4;          // ennél régebbi beolvasás = a Bing elavult állapotot lát
export const MAX_FUGGO_NAP = 3;        // ennyi napnál tovább „Pending” = beragadt
export const UJRAKULDES_SZUNET_NAP = 2;
const NAP = 86400000;
const API = 'https://ssl.bing.com/webmaster/api.svc/json/';

/** A Bing „/Date(ms)/” dátuma → ms. A „soha” (2100 utáni év) és a hibás érték null. */
export function bingDatum(s) {
  const m = String(s ?? '').match(/\/Date\((\d+)/);
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) && ms < Date.parse('2100-01-01T00:00:00Z') ? ms : null;
}

const hoNap = ms => new Date(ms).toISOString().slice(5, 10);
const rovid = url => String(url).replace(/^https:\/\/aiworldhq\.com\//, '');

/** A GetFeeds válaszból: mely elvárt térképpel van baj. @returns {{bajok: {url, ok}[]}} */
export function terkepAllapot(feeds, most = Date.now()) {
  const bajok = [];
  if (!Array.isArray(feeds)) return { bajok };
  for (const url of ELVART_TERKEPEK) {
    const f = feeds.find(x => String(x?.Url || '').replace(/\/+$/, '') === url);
    if (!f) { bajok.push({ url, ok: 'a Bing nem ismeri' }); continue; }
    const olvasva = bingDatum(f.LastCrawled), bekuldve = bingDatum(f.Submitted);
    const mikor = olvasva ? ` (utoljára ${hoNap(olvasva)})` : ' (még soha nem olvasta)';
    const st = String(f.Status || '');
    if (/fail/i.test(st)) bajok.push({ url, ok: 'a beolvasás sikertelen' + mikor });
    else if (/pending/i.test(st)) {
      if (!bekuldve || most - bekuldve > MAX_FUGGO_NAP * NAP) bajok.push({ url, ok: `${MAX_FUGGO_NAP} napnál régebben feldolgozásra vár` + mikor });
    } else if (!olvasva || most - olvasva > MAX_KOR_NAP * NAP)
      bajok.push({ url, ok: (olvasva ? `${Math.floor((most - olvasva) / NAP)} napja nem olvasta` : 'még soha nem olvasta') + mikor.replace(/ \(még soha nem olvasta\)$/, '') });
  }
  return { bajok };
}

/** A riport-sor; null, ha minden rendben. */
export function bingTerkepSor(allapot, { ujrakuldve = [] } = {}) {
  const bajok = allapot?.bajok || [];
  if (!bajok.length) return null;
  const mi = bajok.map(b => `${rovid(b.url)}: ${b.ok}`).join(' · ');
  const tett = ujrakuldve.length
    ? ` → újraküldtem a Bingnek (${ujrakuldve.map(rovid).join(', ')}); 1–2 nap, mire feldolgozza.`
    : ' → a következő 2 napban magától újraküldöm; ha marad, nézd meg a Bing Webmasterben (Webhelytérképek).';
  return `🔍 Bing-térkép: ⚠️ ${mi}${tett}`;
}

/** Kell-e most újraküldeni (van baj, és az utolsó újraküldés UJRAKULDES_SZUNET_NAP napnál régebbi)? */
export function ujrakuldesKell(allapot, emlek, most = Date.now()) {
  if (!(allapot?.bajok || []).length) return false;
  const utolso = Date.parse(String(emlek?.utolsoUjrakuldes || ''));
  return !Number.isFinite(utolso) || most - utolso >= UJRAKULDES_SZUNET_NAP * NAP;
}

/** GetFeeds → a tömb, vagy null (nincs kulcs / hiba / furcsa válasz). Soha nem dob. */
export async function bingTerkepek(kulcs, fetchFn = fetch) {
  if (!kulcs) return null;
  try {
    const r = await fetchFn(`${API}GetFeeds?siteUrl=${encodeURIComponent(SITE)}&apikey=${encodeURIComponent(kulcs)}`, { signal: AbortSignal.timeout(20000) });
    if (!r?.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.d) ? j.d : null;
  } catch { return null; }
}

/** SubmitFeed a megadott térképekre; a sikeresen elküldöttek listája. Soha nem dob. */
export async function ujrakuld(kulcs, terkepek, fetchFn = fetch) {
  const ok = [];
  if (!kulcs) return ok;
  for (const feedUrl of terkepek) {
    try {
      const r = await fetchFn(`${API}SubmitFeed?apikey=${encodeURIComponent(kulcs)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ siteUrl: SITE, feedUrl }), signal: AbortSignal.timeout(20000)
      });
      if (r?.ok) ok.push(feedUrl);
    } catch { /* a következő még mehet */ }
  }
  return ok;
}

export default { bingDatum, terkepAllapot, bingTerkepSor, ujrakuldesKell, bingTerkepek, ujrakuld, ELVART_TERKEPEK };
