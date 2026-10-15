// ===================================================================
// KÖZÖSSÉGI JELÖLÉS — MINDIG A FRISS FÁJLBA ÍRUNK (2026-10-15)
// ===================================================================
//
// MIÉRT KELL. Az agents/social/buffer-poster.js egy cikk közösségi fájljából
// (content/social/<slug>.json) EGY futásban akár három külön objektumot parse-ol:
// a link-poszt, a Threads-videó és a TikTok-fotó tétele ugyanazt a fájlt másképp
// olvassa be. Ha mindegyik a SAJÁT (elavult) objektumát írja vissza, az utolsó
// írás letörli az előzőek jelölését — pl. a Threads-videó írása elvinné a
// `posted_threads`-et, és a link-poszt a következő futásban újra kimenne.
//
// Megoldás: jelöléskor a fájlt ÚJRA beolvassuk, CSAK az egy mezőt állítjuk, és
// úgy írjuk vissza. A poszter (nem importálható) ezt hívja minden jelölésnél.
// ===================================================================

import { readFileSync as olvas, writeFileSync as ir } from 'fs';

/**
 * @param {string} path   a content/social/<slug>.json
 * @param {string} mezo   pl. 'posted_threads_video'
 * @param {string} ertek  az ISO időbélyeg
 * @param {{fallback?: object, readFileSync?: Function, writeFileSync?: Function}} opts
 *   fallback: ha a fájl nem olvasható, ebből az objektumból írunk (a régi viselkedés)
 * @returns {object} a visszaírt, friss bejegyzés
 */
export function jelolMezo(path, mezo, ertek, { fallback = {}, readFileSync = olvas, writeFileSync = ir } = {}) {
  let friss;
  try { friss = JSON.parse(readFileSync(path, 'utf-8')); }
  catch { friss = { ...fallback }; }
  friss[mezo] = ertek;
  writeFileSync(path, JSON.stringify(friss, null, 2), 'utf-8');
  return friss;
}

export default { jelolMezo };
