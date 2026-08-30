// ===================================================================
// BEÁGYAZÁS-ŐR — lát-e még a témaismétlés-őr? (2026-08-30)
// ===================================================================
// ELŐZMÉNY (2026-08-25, éles lelet): a Google-kulcs kerete elfogyott
// („429 — Your prepayment credits are depleted"), az `embedText()` erre
// NÉMÁN `null`-t adott, a közeli-téma-őr pedig szó nélkül átváltott a
// Jaccard-tartalékra. MÉRVE: a tartalék 15 ismert témaismétlésből 1-et
// fogott meg (7%). Az őr hónapokig futott ~7%-os érzékenységgel, és közben
// végig ZÖLDNEK látszott.
//
// Akkor született rá az `ai-router.js`-ben egy `embedStatus()`, a komment
// szerint „amit a napi riport kiír".
//
// 🔑 A BAJ: SOHA NEM ÍRTA KI. Az `embedStatus()`-nak 2026-08-30-ig NULLA
// hívója volt az egész repóban (a saját kommentjén kívül) — ráadásul
// FOLYAMAT-LOKÁLIS változóból dolgozott, tehát a külön processzben futó
// `core/daily-report.js` akkor SEM láthatta volna, ha meghívja.
//
// Vagyis a 08-25-i javítás a „nem futott" esetet lezárta, a „LEBUTULT" esetet
// nem: ha a beágyazás megint elhal, a riport ma is `🔁 Ismétlés-őr: nem volt
// ismétlés (0)`-t írna — ugyanaz a megnyugtató mondat, mint amikor tényleg
// nincs ismétlés.
//
// EZ A MODUL a hiányzó láncszem: lemezre teszi az állapotot, hogy átérjen
// egyik folyamatból a másikba.
//
// ⚠️ ÍRÁS-TAKARÉKOSSÁG: az `embedText()` futásonként sokszor hívódik, de az
// állapot ritkán változik. Ezért CSAK VÁLTOZÁSKOR írunk (szolgáltató-váltás,
// hiba megjelenése vagy eltűnése) — plusz naponta egyszer, hogy a frissesség-
// őr (`core/guard-freshness.js`) lássa, hogy egyáltalán futott.
// ===================================================================

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Teszt-felülírás — élesben nincs beállítva.
const GUARD_PATH = process.env.EMBED_GUARD_PATH
  || join(__dirname, '..', 'memory', 'embed-guard.json');

/**
 * Kell-e lemezre írni? Igen, ha a szolgáltató vagy a hibaállapot megváltozott,
 * vagy ha a legutóbbi bejegyzés más napról való.
 *
 * @param {{provider:string|null, error:string|null}|null} elozo
 * @param {{provider:string|null, error:string|null, at:string}} most
 */
export function kellIrni(elozo, most) {
  if (!elozo) return true;
  if ((elozo.provider ?? null) !== (most.provider ?? null)) return true;
  // A hiba SZÖVEGE változhat (más kvóta-üzenet) — a LÉNYEG, hogy van-e hiba.
  if (!!elozo.error !== !!most.error) return true;
  return String(elozo.at || '').slice(0, 10) !== String(most.at || '').slice(0, 10);
}

/** Az állapot lemezre mentése — SOHA nem dob, és sosem akaszt meg egy hívást. */
export function jegyezEmbed(allapot, ut = GUARD_PATH) {
  try {
    let elozo = null;
    try { elozo = JSON.parse(readFileSync(ut, 'utf-8')); } catch { /* első alkalom */ }
    if (!kellIrni(elozo, allapot)) return false;
    writeFileSync(ut, JSON.stringify({ ...allapot, problems: allapot.error ? [allapot.error] : [] }, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * A napi riport sora. ÜRES, ha a beágyazás rendben van — csendes napokon
 * ne zajongjunk.
 *
 * ⚠️ A sor ⚠️-vel kezdődik: a `core/report-noise.js` vészjelzés-mintája erre
 * illeszkedik, tehát a zajszűrő SOSEM némíthatja el. Épp ez a lelet lényege —
 * egy csendesen lebutult őr fontosabb hír, mint egy hangosan elromlott.
 */
export function embedSor(guard) {
  if (!guard || typeof guard !== 'object') return '';
  if (!guard.error) return '';
  return '⚠️ BEÁGYAZÁS HALOTT: ' + String(guard.error).slice(0, 90)
    + ' — a témaismétlés-őr a gyengébb Jaccard-tartalékra esett vissza '
    + '(mérve: 15 ismétlésből 1-et fog meg). A „nem volt ismétlés" MOST NEM BIZONYÍTÉK.';
}
