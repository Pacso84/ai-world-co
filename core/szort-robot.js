// 🤖 SZÉTSZÓRT ROBOT — JELZÉS (2026-11-05, user: „oké” a „csak jelzés, nem szűrés” javaslatra)
//
// 11-01: a riport „518 belépőt” írt, ebből ~240 robot volt. Ismérvek: hivatkozó nélkül, minden látogatás
// MÁS oldal, egész nap elosztva, és sok magyar/spanyol cikk olyan országból (DE, GB, JP, SG…), ahol ezeket
// a nyelveket nem beszélik. A core/traffic-log.js robotszűrője csak az egy (ország, óra, eszköz) vödörbe
// tömörülő végiglapozót fogja (10-22 Szingapúr) — ezt nem.
//
// MÉRCE = NYELVI ELTÉRÉS: hivatkozó nélküli látogatás /hu/ oldalra nem Magyarországról + /es/ oldalra nem
// spanyol nyelvű országból (az USA spanyolajkúnak számít). Mérve 10-20…11-04 (16 nap):
//   normál nap 0–10 (főleg CN) · 11-04: 20 (CN 15) · 10-31: 38 · 11-01: 123.
// BECSLÉS: a 11-01-i robotországokban a hivatkozó nélküli látogatások ~fele ment „rossz nyelvű” oldalra
// (DE 51/24, GB 25/13, JP 24/10, SG 17/8) → robot ≈ 2 × eltérés (11-01: ~246; kézi elemzés: ~240).
//
// ⚠️ CSAK JELZÉS: a látogatószámból, a hírtörlésből, semmiből NEM von le (téves szűrés veszélye).

export const SPANYOL_ORSZAGOK = new Set('ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR US GQ'.split(' '));
export const KUSZOB = 30;      // e fölött jelez (a normál napok max. ~20)
export const SZORZO = 2;       // eltérés → becsült robot-látogatás

const sajatVagyUres = h => !h || /(^|\.)aiworldhq\.com$/i.test(String(h));

/**
 * @param {Array<{country:string, referer?:string, path:string, visits:number}>} sorok  egy nap, (ország, hivatkozó, útvonal) bontásban
 * @returns {{elteres:number, orszagok:Object<string,number>}}
 */
export function nyelviElteres(sorok) {
  let elteres = 0;
  const orszagok = {};
  for (const s of sorok || []) {
    if (!sajatVagyUres(s?.referer)) continue;
    const n = Number(s?.visits) || 0, c = String(s?.country || ''), p = String(s?.path || '');
    if (!n || !c) continue;
    const rossz = (/^\/hu(\/|$)/.test(p) && c !== 'HU') || (/^\/es(\/|$)/.test(p) && !SPANYOL_ORSZAGOK.has(c));
    if (!rossz) continue;
    elteres += n;
    orszagok[c] = (orszagok[c] || 0) + n;
  }
  return { elteres, orszagok };
}

/** A napló-bejegyzés: { elteres, becsles, jelzes, orszagok (top 5) }. */
export function szortBejegyzes({ elteres, orszagok }) {
  const top = Object.fromEntries(Object.entries(orszagok || {}).sort((a, b) => b[1] - a[1]).slice(0, 5));
  const e = Number(elteres) || 0;
  return { elteres: e, becsles: Math.round(SZORZO * e), jelzes: e >= KUSZOB, orszagok: top };
}

/**
 * A 👥 sor kiegészítése, ha az adott napon jelez. Soha nem nagyobb a becslés a napi belépőknél.
 * @returns {string} '' ha nincs jelzés
 */
export function szortToldalek(bejegyzes, napiBelepo) {
  if (!bejegyzes?.jelzes) return '';
  const n = Math.min(Number(bejegyzes.becsles) || 0, Number(napiBelepo) || Infinity);
  const orsz = Object.keys(bejegyzes.orszagok || {}).slice(0, 4).join(', ');
  return ` — ⚠️ ebből ~${n} gyanús szétszórt robot (magyar/spanyol oldal idegen országból${orsz ? ': ' + orsz : ''}; NINCS levonva)`;
}
