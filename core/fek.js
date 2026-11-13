// ===================================================================
// FÉK — jóváhagyott hivatalos súgó nélküli eszközről nincs új / átírt útmutató (TÉNYKÖZPONT 0b, 2026-11-12)
// ===================================================================
//
// MIÉRT: a 11-11-i mérés szerint 345/377 útmutató forrás nélkül, emlékezetből készült → kitalált gombnevek és
// menüutak. A user 11-12-én jóváhagyta: amíg egy eszköznek nincs jóváhagyott, gépileg olvasható hivatalos súgója
// (core/forras-szint.js: szint = „nincs”), addig
//   • róla ÚJ útmutató-téma nem kerül fel és nem készül útmutató,
//   • az elutasított útmutatóját nem dolgozzuk át,
//   • a publikált útmutatóját nem írjuk át emlékezetből.
// A MEGLÉVŐ útmutatók élnek tovább — NEM törlünk semmit, és semmilyen státuszmezőt sem módosítunk. A fék
// futáskor, a memóriában szűr: ha később jóváhagyunk egy súgót (forras-szint.js), a téma magától feloldódik.
//
// Mi NEM fékezett: „reszleges” (DeepSeek, Kimi…) és „cegfuggetlen” — azokat a bírálat kapuja (GUIDE_UI_NO_HELP,
// 0c) fogja meg: ott az útmutató készülhet, de gomb-/menünevet nem állíthat.
// Terv: docs/superpowers/specs/2026-11-12-tenykozpont-design.md (0b)
// ===================================================================

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { forrasSzint, SZINT } from './forras-szint.js';
import { sugoForrasok } from './sugo-parositas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// KILL-SWITCH: false-ra állítva a fék semmit sem fékez (az eredeti működés tér vissza). Kézzel kapcsolható;
// a config.json `enabled` mezői NEM kapcsolnak ki semmit (lásd memória).
export const FEK_BE = true;

/**
 * Fékezett-e ez a téma / útmutató? x = { tool, company, title } (a title csak naplózáshoz kell).
 * Visszaad: { fek, szint, eszkoz, ok } — `fek` igaz, ha a fék be van kapcsolva ÉS a szint „nincs”.
 * A `be` opció a tesztelhetőségért van (kill-switch próba).
 */
export function fekezett(x, { be = FEK_BE } = {}) {
  const r = forrasSzint(x?.tool, x?.company);
  // Ha maga a téma / útmutató jóváhagyott súgócikkre épül (`sugo_alapu` + engedélyezett URL, pl. a párosító
  // második esélye), akkor az al-termék a súgóból dolgozik → NEM fékezzük, bármi is az eszköz szintje.
  if (sugoForrasok(x).length > 0) {
    return { fek: false, szint: r.szint, eszkoz: r.eszkoz, ok: 'a téma jóváhagyott súgócikkre épül' };
  }
  return { fek: Boolean(be) && r.szint === SZINT.NINCS, szint: r.szint, eszkoz: r.eszkoz, ok: r.ok };
}

/** A lista szétválasztása: { mehet, fekezett } — stabil sorrend, az elemek ugyanazok az objektumok. */
export function fekSzuro(lista, { be = FEK_BE } = {}) {
  const mehet = [], f = [];
  for (const x of Array.isArray(lista) ? lista : []) (fekezett(x, { be }).fek ? f : mehet).push(x);
  return { mehet, fekezett: f };
}

// Az eszköz neve a naplóhoz: a kanonikus név, ennek hiányában amit a téma megad (ismeretlen eszköznél is látsszon).
function eszkozNev(x) {
  return forrasSzint(x?.tool, x?.company).eszkoz || String(x?.tool || x?.company || '').trim() || 'ismeretlen';
}

function eszkozDarabok(lista) {
  const db = {};
  for (const x of lista) { const n = eszkozNev(x); db[n] = (db[n] || 0) + 1; }
  return db;
}

/**
 * Az eszközök felsorolása szövegként: „Meta AI 2, Qwen 1” — csökkenő darab, döntetlennél ábécé, max. 5 név, utána „…”.
 * Közös a konzolsorban (fekOsszegzo) és a Telegram-riport soraiban (report-lines.js fekLine), hogy a kettő sosem tér el.
 * Üres / hibás bemenetre üres szöveget ad.
 */
export function eszkozFelsorolas(eszkozok) {
  const rendezett = Object.entries(eszkozok && typeof eszkozok === 'object' ? eszkozok : {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const nevek = rendezett.slice(0, 5).map(([n, d]) => `${n} ${d}`).join(', ');
  return nevek ? nevek + (rendezett.length > 5 ? '…' : '') : '';
}

/** Egy konzolsor: „🧯 Fék: 3 téma vár hivatalos súgóra (Meta AI 2, Qwen 1)” — csökkenő darab, döntetlennél ábécé, max. 5 név. */
export function fekOsszegzo(lista) {
  const l = Array.isArray(lista) ? lista : [];
  const nevek = eszkozFelsorolas(eszkozDarabok(l));
  return `🧯 Fék: ${l.length} téma vár hivatalos súgóra${nevek ? ` (${nevek})` : ''}`;
}

/**
 * A fék állapota a napi riportnak: { at, db, eszkozok: { eszköz: db }, minta: [{ id, title, eszkoz }] (max. 10) }.
 * SOSEM dob: hiba esetén csak figyelmeztetést ír — a fék állapotfájlja nem állíthatja meg az írást.
 * A relatív útvonal a repó gyökeréhez képest értendő (nem a munkamappához).
 */
export function fekAllapotIr(fekezettLista, { fajl = 'memory/fek-allapot.json', most = new Date() } = {}) {
  try {
    const l = (Array.isArray(fekezettLista) ? fekezettLista : []).filter(x => x && typeof x === 'object');
    const ut = isAbsolute(fajl) ? fajl : join(ROOT, fajl);
    const j = {
      at: most.toISOString(),
      db: l.length,
      eszkozok: eszkozDarabok(l),
      minta: l.slice(0, 10).map(x => ({ id: x.id ?? null, title: x.title ?? '', eszkoz: eszkozNev(x) }))
    };
    mkdirSync(dirname(ut), { recursive: true });
    writeFileSync(ut, JSON.stringify(j, null, 2), 'utf-8');
  } catch (e) {
    console.log('   ⚠️ a fék állapotfájlja nem íródott: ' + String(e?.message || e).slice(0, 80));
  }
}

export default { FEK_BE, fekezett, fekSzuro, fekAllapotIr, fekOsszegzo, eszkozFelsorolas };
