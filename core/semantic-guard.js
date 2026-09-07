// ===================================================================
// MEMÓRIA-KERESÉS-ŐR — mennyi emlék maradt ki a promptból? (2026-09-06)
// ===================================================================
//
// ELŐZMÉNY. A `core/memory-manager.js` `recallSemantic()`-ja már 2026-09-06
// óta MEGSZÁMOLJA, hány emlék beágyazása nem sikerült („a NEM TUDOM nem NEM
// HASONLÓ"), és hangosan szól is róla — a CI naplójába. A
// `szemantikusAllapot()` kommentje maga mondta ki: „EGYELŐRE A CI-NAPLÓIG JUT
// EL". A projekt kemény szabálya viszont az, hogy AZ ŐRSZEM CSAK AKKOR ŐR, HA
// ODASZÓL, AHOL A USER NÉZ — a CI-naplóba írni annyi, mintha senkinek nem
// szólnál.
//
// 🔑 UGYANAZ AZ ALAK, MINT AZ `embedStatus()`-É 2026-08-30-ig: folyamat-lokális
// `let` változó, aminek a kommentje szerint „a napi riport kiírja", miközben a
// riport KÜLÖN PROCESSZ, tehát soha nem is láthatta volna. Ez a modul a hiányzó
// láncszem: lemezre teszi az állapotot, hogy átérjen egyik folyamatból a másikba.
//
// ⚠️ MIT FOG MEG EZ, AMIT AZ `embed-guard.js` NEM. Ott a kérdés: „van-e
// egyáltalán beágyazás?" Itt: „MINDEN emléket sikerült-e beágyazni?" Egy 429-es
// sebességkorlát közepén az `embedText()` UTOLSÓ hívása sikeres lehet (az
// embed-guard tehát ZÖLD), miközben a memória fele kimaradt az AI promptjából.
// A két őrszem külön kérdésre felel; egyik sem helyettesíti a másikat.
//
// ⚠️ MIÉRT KÜLÖN FÁJL, ÉS NEM A memory-manager.js-BEN. Ugyanaz a szétválasztás,
// mint a `buffer-guard.js`-nél és a `test-guard.js`-nél: a döntés (mi számít
// gondnak, mikor írunk, mit mondunk a usernek) tiszta függvényként tesztelhető,
// a hívás marad az agentekből futó modulban.
// ===================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A `memory/` alatti fájlnév — EGY helyen, mert a riport is hivatkozik rá. */
export const GUARD_FAJL = 'semantic-guard.json';

// ⚠️ TESZT-FELÜLÍRÁS, élesben nincs beállítva — ugyanaz a minta, mint az
// `EMBED_GUARD_PATH`-nál és a `MEMORY_STORE_PATH`-nál. A teszt SOHA nem
// írhat az éles őrszem-fájlba.
export const GUARD_PATH = process.env.SEMANTIC_GUARD_PATH
  || join(__dirname, '..', 'memory', GUARD_FAJL);

const szam = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const napja = (at) => String(at || '').slice(0, 10);

/**
 * Mi számít gondnak EGY szemantikus keresésben?
 *
 * 🔑 NINCS „ELHANYAGOLHATÓ" KÜSZÖB. Egy kimaradt emlék is azt jelenti, hogy egy
 * lecke NEM jutott be az AI promptjába, és a hívó ezt „nem hasonló"-nak látta.
 * A küszöb pont azt a fajta csendes lebutulást engedné vissza, ami ellen az
 * egész javítás készült (a témaismétlés-őr 15-ből 1-et fogott, és zöld volt).
 *
 * ⚠️ A NEVEZŐ IS KIMEGY: 106 kimaradt 212-ből MÁS hír, mint 106 a 106-ból.
 * (A magyar helyesírás-őrszem 773→12-es leckéje: a szám lefedettség nélkül
 * félrevezet.)
 *
 * @param {{osszes?:number, kihagyott?:number, provider?:string}} allapot
 * @returns {Array<{code: string, detail: string}>}
 */
export function szemantikusProblemak(allapot = {}) {
  const a = (allapot && typeof allapot === 'object' && !Array.isArray(allapot)) ? allapot : {};
  const kihagyott = szam(a.kihagyott);
  const osszes = szam(a.osszes);
  if (kihagyott === null || kihagyott <= 0) return [];
  return [{
    code: 'MEMORIA_KIMARADT',
    detail: `${kihagyott}/${osszes === null ? '?' : osszes} emlék beágyazása nem sikerült`
      + (a.provider ? ` (${String(a.provider).slice(0, 20)})` : '')
      + ' — ezek KIMARADTAK a keresésből'
  }];
}

/**
 * Kell-e lemezre írni?
 *
 * 🔑 A NAPI BIZONYÍTÉKOT EGY KÉSŐBBI TISZTA FUTÁS NEM TÖRÖLHETI. A
 * `recallSemantic()`-ot EGY CI-futásban többször hívjuk (Író, majd Útmutató).
 * Ha a második, hibátlan hívás felülírná az elsőt, a riport azt mondaná, hogy
 * „ma minden rendben volt" — pedig a nap egyik promptja fél memóriával készült.
 * A kár már megtörtént; a BIZONYÍTÉK IRÁNYA számít, nem a sorrend. (Ugyanaz az
 * elv, mint az `embed-guard.js kellIrni()`-jében, csak ott az egészség veri a
 * konfig-hiányt, itt a mért baj veri az aznapi csendet.)
 *
 * ⚠️ ÉS KELL ÚT VISSZA A NULLÁHOZ: MÁSNAP a tiszta futás mindig felülír.
 * Enélkül a lelet örökre pirosan ragadna — „ha egy számláló N bukást jelent,
 * kell út VISSZA a nullához is".
 *
 * @param {{at?:string, kihagyott?:number}|null} elozo
 * @param {{at?:string, kihagyott?:number}} most
 */
export function kellIrniSzemantikus(elozo, most) {
  if (!elozo || typeof elozo !== 'object' || Array.isArray(elozo)) return true;

  const elozoNap = napja(elozo.at);
  // Értelmezhetetlen előzmény-dátum: nincs mihez viszonyítani → írunk.
  // (Se néma jóváhagyás, se kitalált nap — a `guard-freshness.js` szabálya.)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(elozoNap)) return true;
  if (elozoNap !== napja(most?.at)) return true;               // új nap = tiszta lap

  const mostKihagyott = szam(most?.kihagyott) ?? 0;
  if (mostKihagyott > 0) return true;                          // friss baj MINDIG kimegy

  // ITT ÁLLUNK MEG: aznap már van bejegyzés, és a mostani futás TISZTA.
  //   • ha az aznapi bejegyzés BAJT rögzít → nem törölhetjük felül (lásd fent);
  //   • ha az is tiszta volt → érdemben ugyanaz, a `memory/` viszont
  //     GIT-KÖVETETT, tehát ne gyártsunk napi három üres diffet.
  // Mindkét ág ugyanaz a válasz, de KÉT KÜLÖN OKBÓL — ezért van kimondva.
  return false;
}

/**
 * Az állapot lemezre mentése. SOHA nem dob, és sosem akaszt meg egy keresést.
 *
 * @param {object} allapot a `szemantikusAllapot()` alakja
 * @param {string} [ut]
 * @returns {boolean} írt-e
 */
export function jegyezSzemantikus(allapot, ut = GUARD_PATH) {
  try {
    if (!allapot || typeof allapot !== 'object' || Array.isArray(allapot)) return false;
    let elozo = null;
    try { elozo = JSON.parse(readFileSync(ut, 'utf-8')); } catch { /* első alkalom */ }
    if (!kellIrniSzemantikus(elozo, allapot)) return false;
    mkdirSync(dirname(ut), { recursive: true });
    writeFileSync(ut, JSON.stringify({
      at: allapot.at || new Date().toISOString(),
      provider: allapot.provider ?? null,
      dim: szam(allapot.dim) ?? 0,
      osszes: szam(allapot.osszes) ?? 0,
      cache: szam(allapot.cache) ?? 0,
      beagyazva: szam(allapot.beagyazva) ?? 0,
      kihagyott: szam(allapot.kihagyott) ?? 0,
      problems: szemantikusProblemak(allapot)
    }, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * A napi riport sora. ÜRES, ha minden emlék beágyazódott — a csendes napok
 * maradjanak csendesek.
 *
 * ⚠️ A sor ⚠️-vel KEZDŐDIK, és ez nem díszítés: a `core/report-noise.js`
 * vészjelzés-mintája (`VESZ_RX`) erre illeszkedik, tehát a zajszűrő SOSEM
 * némíthatja el. Egy napokig VÁLTOZATLAN vakság pont az a szöveg, amit egy
 * „csak ha változott" szabály másnapra elhallgattatna — márpedig itt a KITARTÓ
 * vakság maga a hír.
 *
 * ⚠️ HIÁNYZÓ FÁJLRA HALLGATUNK — SZÁNDÉKOSAN, a `test-guard.js`-től eltérően.
 * Ott a CI-lépés minden futásban megy, tehát a hiányzó fájl valódi jel. Itt a
 * szemantikus keresés csak akkor fut, ha az Író/Útmutató agent egyáltalán
 * dolgozott (hír-keret, üres backlog, kihagyott fázis). Egy „nem tudom" sor
 * ilyen napokon NAPI HAMIS RIASZTÁS lenne — és a hamis riasztás megeszi az
 * igazit is. Azt a kérdést, hogy ÉL-E a beágyazás, az `embed-guard.js` felelős
 * megválaszolni; ez a modul csak a RÉSZLEGES vakságot méri.
 *
 * @param {object|null} guard a beolvasott memory/semantic-guard.json
 */
export function szemantikusSor(guard) {
  if (!guard || typeof guard !== 'object' || Array.isArray(guard)) return '';
  const p = Array.isArray(guard.problems)
    ? guard.problems.filter(Boolean)
    : szemantikusProblemak(guard);
  if (!p.length) return '';
  const reszlet = p.map(x => String(x?.detail || x?.code || '')).join(' · ');
  return '⚠️ MEMÓRIA-KERESÉS: ' + reszlet
    + ' — a „nem tudom" NEM „nem hasonló": ezek a leckék nem jutottak be az AI promptjába.';
}

export default {
  GUARD_FAJL, GUARD_PATH, szemantikusProblemak, kellIrniSzemantikus, jegyezSzemantikus, szemantikusSor
};
