// ===================================================================
// CSATORNA NAPI PLAFON — hány poszt mehet ma még egy csatornára
// ===================================================================
//
// MIÉRT (2026-08-24). Az Instagram napi 6 posztot kapott (`--limit 2` × napi
// 3 CI-futás), miközben mérve, 11 napra (Cloudflare RUM, refererHost):
//
//     Facebook  435 belépő        Threads  1 belépő        Instagram  0
//
// Egy alig induló fiók magas ütemű, azonos sablonú automata posztolása a
// platformoknak gépi mintázat — és cserébe nulla olvasót hozott. A user
// döntése: napi 6 → napi 1, a csatorna megmarad, a bio-linket beállítja,
// két hét múlva újramérünk. (A háttér a projekt belső jegyzeteiben.)
//
// ⚠️ A `--limit` FUTÁSONKÉNT számol, tehát napi plafonnak alkalmatlan:
// `--limit 1` × napi 3 CI-futás = napi 3, nem napi 1.
//
// A MAI DARABSZÁM A BUFFERTŐL JÖN, nem a saját jelölésünkből. Ugyanez a
// lecke 2026-08-06-ról: a napi riport „Facebook-poszt: N" sora a saját
// jelölésünkből jött és torzított; azóta a Make naplójából megy.
// ===================================================================

/**
 * A ma már kiküldött posztok száma egy csatornán, a Buffer válaszából.
 *
 * @returns {number|null} darabszám, vagy `null`, ha NEM TUDJUK.
 *
 * ⚠️ A null és a 0 KÜLÖNBÖZŐ. A 0 azt jelenti: „ma még nem ment ki semmi"
 * (mehet a poszt). A null azt: „nem sikerült megtudni" — és arra az
 * allowedNow() bezár. Ha a hibát 0-nak adnánk vissza, a plafon némán
 * kikapcsolna, és pont akkor, amikor a legkevésbé vennénk észre.
 */
export function countSentToday(posts, now = Date.now()) {
  if (!Array.isArray(posts)) return null;
  const ma = new Date(now).toISOString().slice(0, 10);
  let db = 0;
  for (const p of posts) {
    if (!p || p.status !== 'sent' || !p.sentAt) continue;
    if (String(p.sentAt).slice(0, 10) === ma) db++;
  }
  return db;
}

/**
 * A csatorna napi plafonja a beállításból, vagy `null`, ha nincs.
 *
 * ⚠️ Az ÉRTELMETLEN érték (szöveg, negatív, NaN) NEM plafon — ilyenkor
 * `null` jön vissza, tehát a csatorna a szokott ütemben megy tovább.
 * Ha az elgépelés 0-t jelentene, egy félreütés NÉMÁN elnémítaná a
 * csatornát, és hetekig nem tűnne fel.
 *
 * A 0 viszont VALÓDI plafon: így lehet egy csatornát kód nélkül leállítani.
 */
export function capFor(config, channelKey) {
  const t = config && config.limits && config.limits.social_daily_caps;
  if (!t || typeof t !== 'object') return null;
  const v = t[channelKey];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return Math.floor(v);
}

/**
 * Hány poszt mehet ki EBBEN a körben.
 *
 * @param {number|null} sentToday  ma már kiküldve (null = nem tudjuk)
 * @param {number|null} dailyCap   napi plafon (null = nincs)
 * @param {number}      runLimit   a futás saját limitje (`--limit`)
 */
export function allowedNow({ sentToday, dailyCap, runLimit }) {
  const limit = Number.isFinite(runLimit) && runLimit > 0 ? Math.floor(runLimit) : 0;
  if (dailyCap === null || dailyCap === undefined) return limit;   // nincs plafon
  if (!Number.isFinite(dailyCap) || dailyCap < 0) return limit;

  // AZ IRÁNY. Ha van plafon, de a mai darabszámot nem tudjuk, ZÁRUNK.
  // A két hiba nem egyforma súlyú: a túllépés épp azt hozza vissza, ami
  // miatt a plafon készült; a kimaradás egy nap egy olyan csatornán,
  // ami 11 nap alatt 0 látogatót hozott.
  if (!Number.isFinite(sentToday) || sentToday < 0) return 0;

  return Math.max(0, Math.min(limit, Math.floor(dailyCap) - Math.floor(sentToday)));
}
