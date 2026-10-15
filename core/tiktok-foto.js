// ===================================================================
// TIKTOK FOTÓ-POSZT — melyik Facebook-posztból lehet ma TikTok-kép? (2026-10-15)
// ===================================================================
//
// USER-DÖNTÉS (10-15): „minden közösségi médiában ugyanazok jelenjenek meg".
//   • a napi videók (2 Reel + 1 TikTok-extra) a Threadsre is mennek videó-posztként
//     (core/social-text.js `videoField`);
//   • a Facebookra már kiment hír/útmutató a TikTokra is kimegy, FOTÓ-posztként
//     (a 4:5 borítókép), napi legfeljebb 3. A TikTok napi plafonja ezért 3 → 6.
//
// ⚠️ MIÉRT A CORE-BAN: az agents/social/buffer-poster.js NEM importálható (a puszta
// import is valódi posztot küldene), tehát ami ott él, az tesztelhetetlen. A döntés
// — kit, hányat — ide került; a poszter csak a fájlokat olvassa és a hívást végzi.
//
// ⚠️ AZ MI-JELÖLÉS A SZÖVEGBEN MARAD: a TikTok fotó-posztnál az `isAiGenerated`
// kapcsoló TILOS (élesben mérve 10-15: „TikTok photo posts do not support AI content
// disclosure"), ezért a jelölést a caption viszi (CHANNELS.tiktok.aiLabel).
// ===================================================================

/** Napi legfeljebb ennyi fotó-poszt megy a TikTokra (user, 10-15). */
export const FOTO_NAPI_MAX = 3;

const maiNap = now => new Date(now).toISOString().slice(0, 10);

/**
 * Hány bejegyzésen áll MA (UTC) a `mezo` jelölés.
 * A jelölés ISO időbélyeg; a 'skipped-…' és egyéb szöveg nem számít.
 *
 * @param {Array<{post:object}>} items
 */
export function maiMarkaDb(items, mezo, now = Date.now()) {
  if (!Array.isArray(items)) return 0;
  const ma = maiNap(now);
  return items.filter(x => {
    const v = x?.post?.[mezo];
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.slice(0, 10) === ma;
  }).length;
}

/**
 * A fotó-posztok kerete: a csatorna napi plafonjából mi marad, miután a mai videók
 * (az eddigiek + a most kiküldöttek) levonódtak.
 *
 * 🔒 Ismeretlen mai darabszám + plafon → 0 (a core/channel-cap.js iránya: inkább
 * kimarad, mint túllépjük). Plafon nélkül nincs korlát (Infinity).
 */
export function fotoKeret({ plafon, maiDb, videoKikuldve = 0 }) {
  if (plafon === null || plafon === undefined) return Infinity;
  if (!Number.isFinite(maiDb) || maiDb < 0) return 0;
  return Math.max(0, plafon - maiDb - (videoKikuldve || 0));
}

/**
 * A TikTok fotó-jelöltek és a ma még kiküldhető darabszám.
 *
 * Jelölt: a Facebookra MÁR kiment (`posted_at`), FRISS (7 nap — ugyanaz a szabály, mint a
 * Threadsé), a TikTokon még NINCS videóként (`posted_tiktok`) és fotóként sem
 * (`posted_tiktok_photo`). A legfrissebb elöl.
 * Hely: min(napi max - ma már kiment fotó, a csatorna maradék kerete).
 *
 * A KÉP LÉTÉT (imageExists, HTTP) a hívó nézi — a jelölt-lista ezért teljes, és a hívó
 * addig megy rajta, amíg a `hely` be nem telik (egy hiányzó kép nem viszi el a helyet).
 *
 * @param {Array<{post:object, pubAt:string, isFresh:boolean}>} items  az ÖSSZES közösségi bejegyzés
 * @param {{now?:number, keret?:number, napiMax?:number}} opts
 * @returns {{sor: Array, hely: number}}
 */
export function tiktokFotoSor(items, { now = Date.now(), keret, napiMax = FOTO_NAPI_MAX } = {}) {
  if (!Array.isArray(items)) return { sor: [], hely: 0 };
  const sor = items
    .filter(x => x?.isFresh && x.post?.posted_at && !x.post.posted_tiktok && !x.post.posted_tiktok_photo)
    .sort((a, b) => String(b.pubAt || '').localeCompare(String(a.pubAt || '')));
  const maradekNap = Math.max(0, napiMax - maiMarkaDb(items, 'posted_tiktok_photo', now));
  const k = typeof keret === 'number' && !Number.isNaN(keret) && keret >= 0 ? keret : 0;   // 🔒 ismeretlen → 0
  return { sor, hely: Math.min(maradekNap, k) };
}

export default { FOTO_NAPI_MAX, maiMarkaDb, fotoKeret, tiktokFotoSor };
