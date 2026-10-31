// 🪦 HALOTT-LINK ŐR (2026-10-31, user: „jó lenne, ha ez a hiba ne forduljon elő többet!”). Ingyenes, AI nélküli.
//
// A Bing 10-31-én „magas súlyosságú” ajánlást adott: a 10-16-án törölt
// /article/translate-foreign-documents-and-everyday-signs-with-gemini halott linkjét nem jelentettük be.
// KÉT RÉS volt: (1) csak a Házmester két törlés-listája (hírek, útmutatók) ment az IndexNow-ba — ami MÁS úton
// tűnik el (tény-ellenőrző levétele, kézi törlés, összevonás…), arról nem szóltunk; (2) csak 48 órás ablakban —
// ha azok a futások elbuknak, a bejelentés csendben örökre elmarad.
//
// MEGOLDÁS: ÁLLAPOT-ÖSSZEVETÉS. Minden futás eltárolja az élő slugokat; ami az előzőhöz képest eltűnt —
// BÁRMILYEN okból —, sorba kerül. A bejelentést CSAK sikeres (200/202) IndexNow-válasz után pipáljuk ki, tehát
// egy elbukott futás után a következő pótolja. 7 nap múlva még egyszer szólunk (a kereső addigra újra-feltérképez);
// a 2. sikeres bejelentés után 30 napig még a sorban marad (ha visszatérne), utána kikerül.

export const MASODIK_NAP = 7;
export const MEGORZES_NAP = 30;
const NAP = 864e5;

/** Az állapot frissítése az élő slugokkal. Első futásnál (nincs előző lista) csak alapállapot — semmi nem „tűnt el”. */
export function frissit(allapot, eloSlugok, now = Date.now()) {
  const elo = [...new Set(eloSlugok || [])].sort();
  const sor = { ...((allapot && allapot.sor) || {}) };
  const elozo = allapot && Array.isArray(allapot.elo) ? new Set(allapot.elo) : null;
  const most = new Set(elo);
  if (elozo) for (const s of elozo) if (!most.has(s) && !sor[s]) sor[s] = { eltunt_at: new Date(now).toISOString(), bejelentve: [] };
  for (const s of Object.keys(sor)) {
    if (most.has(s)) { delete sor[s]; continue; }                              // visszatért → nem halott
    const b = sor[s].bejelentve || [];
    if (b.length >= 2 && now - Date.parse(b[b.length - 1]) > MEGORZES_NAP * NAP) delete sor[s];
  }
  return { elo, sor };
}

/** Bejelentendő slugok most: még soha (vagy minden eddigi próba elbukott), illetve az 1. után 7 nappal a 2. kör. */
export function esedekes(allapot, now = Date.now()) {
  return Object.entries((allapot && allapot.sor) || {}).filter(([, x]) => {
    const b = x.bejelentve || [];
    return b.length === 0 || (b.length === 1 && now - Date.parse(b[0]) >= MASODIK_NAP * NAP);
  }).map(([s]) => s).sort();
}

/** Sikeres IndexNow-válasz UTÁN: a slugok kipipálása. */
export function bejelentve(allapot, slugok, now = Date.now()) {
  const sor = { ...allapot.sor };
  for (const s of slugok || []) if (sor[s]) sor[s] = { ...sor[s], bejelentve: [...(sor[s].bejelentve || []), new Date(now).toISOString()] };
  return { ...allapot, sor };
}
