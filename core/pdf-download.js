// ===================================================================
// INGYENES PDF-LETÖLTÉS SZÁMLÁLÓ (2026-10-07)
// ===================================================================
// User: „jó lenne a könyvekhez mérő, hány töltik le".
//
// MIÉRT SAJÁT SZÁMLÁLÓ: a CF RUM csak a HTML-oldalakat látja (JS-jelzés), a
// PDF-et nem; a zóna-analitikához a CF_ANALYTICS_TOKEN-nek nincs joga.
//
// A LÁNC (három helyen, EZ a fájl a közös szabály):
//   functions/_middleware.js  → letoltesFajl() dönt, és jelez a Workernek
//   telegram-worker /dl-hit   → dlKulcs()-csal napra bontva számol a KV-ben
//   core/daily-report.js      → pdfLetoltesSor() írja a riport-sort
//
// TISZTA modul (nincs fs, nincs hálózat): a Pages Function és a Worker
// futtatókörnyezete is importálhatja, és teszt alatt áll.
// ===================================================================

/** A mi ingyenes PDF-jeink neve: aiworldhq-<téma>-<en|es>.pdf (website/assets/free/). */
export const PDF_FAJL_MINTA = /^aiworldhq-[a-z]+-(?:en|es)\.pdf$/;
const UTVONAL_ELO = '/assets/free/';

// Robot, előnézet, parancssor. A böngészők UA-ja ezek egyikét sem tartalmazza.
const ROBOT_MINTA = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|httpclient|headless|lighthouse|monitor|fetch|scan/i;

/**
 * Letöltésnek számít-e ez a kérés? Ha igen, a fájlnév; különben null.
 *
 * ⚠️ A MÉRCE IRÁNYA: inkább ALULmér, mint felül. A PDF-olvasók egy fájlt
 * több Range-kérésben töltenek — csak az ELSŐ (bytes=0-…) számít; a 304
 * (gyorsítótárból újranyitva) nem új letöltés; a robot nem ember.
 */
export function letoltesFajl({ path, method, status, range, ua } = {}) {
  const p = String(path || '');
  if (!p.startsWith(UTVONAL_ELO)) return null;
  const fajl = p.slice(UTVONAL_ELO.length);
  if (!PDF_FAJL_MINTA.test(fajl)) return null;
  if (String(method || '').toUpperCase() !== 'GET') return null;
  if (status !== 200 && status !== 206) return null;
  if (range && !/^bytes=0-/i.test(String(range).trim())) return null;
  const u = String(ua || '');
  if (!u || ROBOT_MINTA.test(u)) return null;
  return fajl;
}

/** A KV-kulcs: dl:<UTC-nap>:<fájl>. Érvénytelen fájlnévre null. */
export function dlKulcs(fajl, now = Date.now()) {
  if (!PDF_FAJL_MINTA.test(String(fajl || ''))) return null;
  return `dl:${new Date(now).toISOString().slice(0, 10)}:${fajl}`;
}

const nap = (now, vissza) => new Date(now - vissza * 864e5).toISOString().slice(0, 10);
const rovid = f => String(f).replace(/^aiworldhq-/, '').replace(/\.pdf$/, '');

/**
 * A napi riport sora. Bemenet: a Worker `__dl` exportja
 * ({ 'YYYY-MM-DD': { fájl: db } }, vagy { error: true }).
 *
 * Csend: ha a 7 napban egyetlen letöltés sem volt → nincs sor (a csendes nap
 * maradjon csendes). Ha a lekérdezés bukott → KÜLÖN mondat, mert az
 * „elromlott" és a „senki nem töltötte le" kívülről egyforma lenne.
 */
export function pdfLetoltesSor(dl, now = Date.now()) {
  if (!dl || typeof dl !== 'object') return '';
  if (dl.error) return '📚 PDF-letöltések: a számlálót nem sikerült lekérdezni.';
  const tegnap = dl[nap(now, 1)] || {};
  let het = 0;
  for (let i = 1; i <= 7; i++) for (const v of Object.values(dl[nap(now, i)] || {})) het += Number(v) || 0;
  if (het === 0) return '';
  const tegnapDb = Object.values(tegnap).reduce((s, v) => s + (Number(v) || 0), 0);
  const bontas = Object.entries(tegnap).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([f, v]) => `${rovid(f)} ${v}`).join(', ');
  return `📚 Ingyenes PDF-letöltés tegnap: ${tegnapDb}${bontas ? ` (${bontas})` : ''} · 7 nap: ${het}`;
}

export default { PDF_FAJL_MINTA, letoltesFajl, dlKulcs, pdfLetoltesSor };
