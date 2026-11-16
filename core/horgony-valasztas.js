// ===================================================================
// ⚓ HORGONYOS KIVÁLASZTÁS — az útmutató-írás KAPUJA (tényközpont 1d, 4. feladat)
// ===================================================================
// MIÉRT: egy útmutató csak akkor íródhat meg egy cég termékéről, ha a téma a cég hivatalos súgójának EGY cikkéhez
// van rögzítve (core/sugo-horgony.js). Ez a modul a jelölt-sorban végigmegy a témákon, és csak azokat engedi írásra,
// amelyek horgonyosak (vagy nem kérnek horgonyt). Az agent (agents/guide/agent.js) nem importálható tesztből, ezért
// a logika ITT van, az agentben csak a hívás és a jegyzések visszaírása marad.
//
// SZABÁLYOK:
//   • cégfüggetlen téma, már horgonyos téma és az olyan, amelyiknek nem kell horgony (adatlap.horgonyKell = false)
//     horgony-próba nélkül bekerül;
//   • a horgonyt kérő téma `keres(téma)`-t kap; siker → a kiegészített MÁSOLAT kerül az írási listába
//     (az eredeti objektum érintetlen), kudarc → a téma ebben a futásban kimarad, és UJRAPROBA_NAP napig nem próbáljuk;
//   • futásonként legfeljebb `maxProba` próba (költség-fék); utána a horgonyt kérő jelölt kimarad;
//   • `be === false` (HORGONY_BE kapcsoló) → a mai működés: az első `limit` jelölt változatlanul.
//
// ADATVÉDELEM: a nyilvános repóba és a nyilvános CI-naplóba csak RÖGZÍTETT magyar ok kerülhet (jegyzesOk).
// Az AI szabad szövegű indoka (`reason`) kiadói cikk elolvasása után születik → SOHA nem kerül sehová.
// Teszt: core/horgony-valasztas.test.js
// ===================================================================

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { adatlap } from './termek-adatlap.js';
import { sugoForrasok } from './sugo-parositas.js';
import { HORGONY_BE, FUTAS_MAX_PROBA, UJRAPROBA_NAP, horgonyJegyzes } from './sugo-horgony.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Az állapotfájl alapértelmezett helye (a napi riport ezt olvassa). */
const ALLAPOT_UT = join(ROOT, 'memory', 'horgony-allapot.json');
const rovid = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * @param jeloltek  a téma-jelöltek sorrendben (az agent pickTopics-a adja)
 * @param limit     hány témát lehet írásra venni
 * @param opciok.keres   async téma → horgonyKeres-eredmény; (a költséget a hívó gyűjti a saját burkolójában)
 * @param opciok.most    időbélyeg (ms) a jegyzésekhez
 * @param opciok.maxProba  futásonkénti próba-keret
 * @param opciok.be      kapcsoló (HORGONY_BE); false → horgony nélkül, a mai működés
 * @param opciok.naplo   konzol-író (alapból néma, így a teszt zajtalan)
 * @returns {Promise<{ iras: object[], jegyzesek: {id:any, horgony?:object, atmeneti?:true, ok_ok?:string, frissites?:object, cim:string, eszkoz:string}[], probak: number }>}
 *   (átmeneti kudarcnál nincs `horgony`: csak `atmeneti: true` + a rögzített `ok_ok` — a téma nem megy 14 napos várakozásba)
 */
export async function horgonyozottValasztas(jeloltek, limit, { keres, most = Date.now(), maxProba = FUTAS_MAX_PROBA, be = HORGONY_BE, naplo = () => {} } = {}) {
  const lista = Array.isArray(jeloltek) ? jeloltek.filter(x => x && typeof x === 'object') : [];
  const keret = Math.max(0, Number(limit) || 0);
  if (!be) return { iras: lista.slice(0, keret), jegyzesek: [], probak: 0 };   // kapcsoló ki: a mai működés

  const iras = [];
  const jegyzesek = [];
  let probak = 0;
  for (const t of lista) {
    if (iras.length >= keret) break;
    const ad = adatlap(t);
    // nem kér horgonyt, vagy már horgonyos → próba nélkül mehet
    if (!ad.horgonyKell || sugoForrasok(t).length > 0) { iras.push(t); continue; }
    if (probak >= maxProba) continue;   // elfogyott a futás próba-kerete: a cégfüggetlen még bekerülhet, ez nem
    probak++;
    let eredmeny;
    try {
      eredmeny = await keres(t);
    } catch {
      eredmeny = { ok: false, jegyzesOk: 'hiba', atmeneti: true };   // a kivétel szövege nem kerül sehová
    }
    const jegyzes = horgonyJegyzes(t, eredmeny, most);
    const j = { id: t.id, cim: rovid(t.title, 120), eszkoz: ad.nev || rovid(t.tool, 60), horgony: jegyzes };
    if (!eredmeny?.ok && eredmeny?.atmeneti === true) {
      // ÁTMENETI kudarc (a letöltés/hiba miatt, nem a téma miatt): próbának számít és ma kimarad, de NEM kap `horgony` jegyzést,
      // így nem kerül a 14 napos várakozásba — a következő futás újra próbálja. Az állapotfájl a rögzített okot látja.
      delete j.horgony;
      j.atmeneti = true;
      j.ok_ok = jegyzes.ok_ok;
      jegyzesek.push(j);
      naplo(`🧭 nincs horgony most: „${rovid(t.title, 60)}” — ${jegyzes.ok_ok || 'ismeretlen ok'} (átmeneti hiba, a következő futásban újra próbáljuk)`);
      continue;
    }
    if (eredmeny?.ok && eredmeny.frissites) {
      j.frissites = eredmeny.frissites;
      jegyzesek.push(j);
      iras.push({ ...t, ...eredmeny.frissites });   // MÁSOLAT: az eredeti téma-objektum nem módosul
      naplo(`🧭 súgó-horgony: „${rovid(t.title, 60)}” → ${rovid(eredmeny.frissites.official_sources?.[0]?.title, 80) || 'hivatalos súgócikk'}`);
    } else {
      jegyzesek.push(j);
      naplo(`🧭 nincs horgony: „${rovid(t.title, 60)}” — ${jegyzes.ok_ok || 'ismeretlen ok'} (${UJRAPROBA_NAP} nap múlva újra)`);
    }
  }
  return { iras, jegyzesek, probak };
}

/**
 * A napi riport állapotfájlja: hány próba, hány siker, mely témák nem kaptak horgonyt (és miért).
 * NYILVÁNOS repó → csak a téma címe, az eszköz neve és a RÖGZÍTETT magyar ok kerül bele; súgószöveg és az AI szabad
 * szövegű indoka (`reason`) soha. Hibára nem dob (a futást nem állíthatja le).
 */
export function horgonyAllapotIr(osszegzes, { fajl = null, most = Date.now() } = {}) {
  try {
    const o = osszegzes && typeof osszegzes === 'object' ? osszegzes : {};
    const jegyzesek = (Array.isArray(o.jegyzesek) ? o.jegyzesek : []).filter(x => x && typeof x === 'object');
    const j = {
      at: new Date(most).toISOString(),
      probak: Number(o.probak) || 0,
      sikeres: jegyzesek.filter(x => x.horgony?.ok === true).length,
      sikertelen: jegyzesek.filter(x => x.horgony?.ok === false || x.atmeneti === true).map(x => ({
        cim: rovid(x.cim, 120),
        eszkoz: rovid(x.eszkoz, 60),
        ok: rovid(x.horgony?.ok_ok ?? x.ok_ok, 80) || 'ismeretlen ok',   // CSAK a rögzített magyar ok — a `reason`-t nem olvassuk
        // átmeneti = a súgó most nem volt elérhető: nem kap 14 napos várakozást, a riport ezt külön kimondja
        ...(x.atmeneti === true ? { atmeneti: true } : {})
      }))
    };
    const ut = fajl ? (isAbsolute(fajl) ? fajl : join(ROOT, fajl)) : ALLAPOT_UT;
    mkdirSync(dirname(ut), { recursive: true });
    writeFileSync(ut, JSON.stringify(j, null, 2), 'utf-8');
  } catch (e) {
    console.log('   ⚠️ a horgony állapotfájlja nem íródott: ' + String(e?.message || e).slice(0, 80));
  }
}

export default { horgonyozottValasztas, horgonyAllapotIr };
