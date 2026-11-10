// ===================================================================
// TIKTOK FOTÓ-POSZT — melyik Facebook-posztból lehet ma TikTok-kép? (2026-10-15)
// ===================================================================
//
// USER-DÖNTÉS (10-15): „minden közösségi médiában ugyanazok jelenjenek meg".
//   • a napi videók (2 Reel + 1 TikTok-extra) a Threadsre is mennek videó-posztként
//     (core/social-text.js `videoField`);
//   • a Facebookra már kiment hír/útmutató a TikTokra is kimegy, FOTÓ-posztként
//     (a 4:5 borítókép) — CSAK HÍR (az útmutató videóként megy), napi legfeljebb 3. A TikTok napi plafonja ezért 3 → 6.
//
// ⚠️ MIÉRT A CORE-BAN: az agents/social/buffer-poster.js NEM importálható (a puszta
// import is valódi posztot küldene), tehát ami ott él, az tesztelhetetlen. A döntés
// — kit, hányat — ide került; a poszter csak a fájlokat olvassa és a hívást végzi.
//
// ⚠️ AZ MI-JELÖLÉS A SZÖVEGBEN MARAD: a TikTok fotó-posztnál az `isAiGenerated`
// kapcsoló TILOS (élesben mérve 10-15: „TikTok photo posts do not support AI content
// disclosure"), ezért a jelölést a caption viszi (CHANNELS.tiktok.aiLabel).
// ===================================================================

import { aznapElol } from './social-queue.js';

/**
 * Napi legfeljebb ennyi fotó-poszt megy a TikTokra.
 * 10-15 (user): 3. → 2026-11-10 (user: „amit megírunk aznap, az jöjjön le a közösségi
 * hálózatokon, de mind, ami aznap készült!"): 9 — a napi ~7–10 cikkből ami nem videóként
 * megy, az fotóként. A csatorna napi plafonja (config social_daily_caps.tiktok) ezért 12
 * = a napi 3 videó + 9 fotó.
 */
export const FOTO_NAPI_MAX = 9;

/**
 * Futásonként legfeljebb ennyi fotó (2026-10-15, végső review I3: egy tömbben spamnek
 * látszana). 11-10: 1 → 4, mert a CI sokszor csak kétszer fut egy nap, és 1/futás mellett
 * a nap cikkeinek fele kimaradt (mérve: 11-10-én 8 cikkből 2 ment TikTokra).
 */
export const FOTO_FUTASONKENT_MAX = 4;

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
 * @param {{now?:number, keret?:number, napiMax?:number, futasMax?:number, kizar?:Set}} opts
 * @returns {{sor: Array, hely: number}}
 */
export function tiktokFotoSor(items, { now = Date.now(), keret, napiMax = FOTO_NAPI_MAX, futasMax = FOTO_FUTASONKENT_MAX, kizar } = {}) {
  if (!Array.isArray(items)) return { sor: [], hely: 0 };
  // 2026-10-15 (review I1) a fotó még CSAK HÍRBŐL ment („az útmutató videóként megy”). Csakhogy a Reel
  // a LEGRÉGEBBI videó nélküli útmutatót viszi (core/reel-queue.js), így a mai útmutató napokig nem
  // jutott a TikTokra. 2026-11-10 (user: „mind, ami aznap készült”): az útmutató is mehet fotóként,
  // ha a Facebookra FOTÓKÉNT ment ki (`posted_at`) — pontosan, ahogy a Facebook is kapja: ma a kép,
  // később (ha sorra kerül) a Reel. `kizar`: a futásban már VIDEÓKÉNT kiment elemek útvonalai
  // (a sor a videók előtt készült, a jelölésük nála elavult) — ugyanaz a cikk egy futásban nem
  // megy videóként ÉS fotóként.
  // SORREND (11-10): a mai + tegnapi elöl a legrégebbitől, aztán a többi friss a legújabbtól
  // (core/social-queue.js aznapElol) — a hajnali cikk ne csússzon örökké a frissebbek mögé.
  const jeloltek = items
    .filter(x => x?.isFresh && x.post?.posted_at && !x.post.posted_tiktok && !x.post.posted_tiktok_photo
      && !(kizar && kizar.has(x.path)));
  const sor = aznapElol(jeloltek, now);
  const maradekNap = Math.max(0, napiMax - maiMarkaDb(items, 'posted_tiktok_photo', now));
  const k = typeof keret === 'number' && !Number.isNaN(keret) && keret >= 0 ? keret : 0;   // 🔒 ismeretlen → 0
  return { sor, hely: Math.min(maradekNap, k, futasMax) };
}

/**
 * Egy fotó-tétel utáni döntés a poszter ciklusának (2026-10-15, végső review I1).
 * Minden createPost-KÍSÉRLET helyet használ (a kísérletet az API-kérések számlálója
 * mutatja: nőtt-e), és az első Buffer-hibánál a ciklus MEGÁLL — különben egy
 * elutasító Buffer mellett minden futás a teljes jelölt-listán (~27) végigégetné
 * a kvótát. Ami nem jutott el a createPost-ig (nem fér ki a szöveg), nem használ
 * helyet. Próbában (dry) a darabszám mutatható, de nincs mit megállítani.
 *
 * @returns {{hely:boolean, megall:boolean}}
 */
export function fotoLepes({ keresElotte, keresUtana, ok, dry = false }) {
  if (dry) return { hely: true, megall: false };
  const probalt = keresUtana > keresElotte;
  return { hely: probalt, megall: probalt && !ok };
}

export default { FOTO_NAPI_MAX, FOTO_FUTASONKENT_MAX, maiMarkaDb, fotoKeret, tiktokFotoSor, fotoLepes };
