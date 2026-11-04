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
/**
 * „Ebben a lépésben nincs is beállítva kulcs" — ez NEM a rendszer állapota.
 *
 * ⚠️ EXPLICIT MINTA, nem előtag-illesztés (a projekt kemény szabálya): csak a
 * konkrét „nincs VALAMI_API_KEY" alakra illeszkedik. Egy valódi hibaüzenet
 * (HTTP 429, kvóta, hálózat) SOHA nem eshet ide.
 */
const KONFIG_HIANY_RX = /\bnincs\s+[A-Z][A-Z0-9_]*_API_KEY\b/;

// A szolgáltatók okait az `embedText()` ezzel fűzi össze („google: … · mistral: …").
export const OK_ELVALASZTO = ' · ';

const reszek = (error) => String(error || '').split(OK_ELVALASZTO).map(r => r.trim()).filter(Boolean);

/**
 * „Ebben a lépésben EGYÁLTALÁN nincs kulcs beállítva."
 *
 * ⚠️ MINDEN RÉSZNEK teljesülnie kell (2026-09-06). A hibaüzenet 2026-09-06 óta
 * TÖBB szolgáltató okát hordozza egyszerre, és a puszta „illeszkedik valahol"
 * vizsgálat itt VESZÉLYES: a
 *     „google: 429 credits depleted · mistral: nincs MISTRAL_API_KEY"
 * üzenet konfig-hiánynak látszana, holott a Google TÉNYLEG megpróbálta és
 * elbukott. Egy valódi baj így némán eltűnne — pontosan az a hibaosztály,
 * ami ellen ez a fájl készült.
 */
function csakKonfigHiany(error) {
  const r = reszek(error);
  return r.length > 0 && r.every(x => KONFIG_HIANY_RX.test(x));
}

export function kellIrni(elozo, most) {
  if (!elozo) return true;

  // ===================================================================
  // 🔑 A „NINCS KULCS" NEM AZONOS A „HALOTT"-TAL (2026-09-06, saját regresszió)
  // ===================================================================
  // A `jegyezEmbed()`-et a `core/ai-router.js` hívja, tehát MINDEN AI-t
  // érintő CI-lépésből lefut. A Házmester lépésnek viszont EGYÁLTALÁN NINCS
  // env-je (nem is kell neki), ezért ott a beágyazás „nincs kulcs"-csal bukik.
  // Élesben ettől NAPONTA OSZCILLÁLT a fájl:
  //     provider:"mistral", error:null                    ← Pipeline (van kulcs)
  //     provider:null, error:"mistral: nincs MISTRAL_API_KEY"  ← Házmester
  // és a napi riport „⚠️ BEÁGYAZÁS HALOTT"-ot írt volna egy MŰKÖDŐ rendszerre.
  //
  // Ha AZNAP egy másik lépés MÁR IGAZOLTA, hogy megy, a konfig-hiány nem
  // írhatja felül. Egy VALÓDI hiba viszont mindig felülír — a bizonyíték
  // iránya számít, nem a sorrend.
  const ugyanazNap = String(elozo.at || '').slice(0, 10) === String(most.at || '').slice(0, 10);
  if (ugyanazNap && csakKonfigHiany(most.error)) return false;

  if ((elozo.provider ?? null) !== (most.provider ?? null)) return true;
  // A hiba SZÖVEGE változhat (más kvóta-üzenet) — a LÉNYEG, hogy van-e hiba.
  if (!!elozo.error !== !!most.error) return true;
  return !ugyanazNap;
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
  return '⚠️ BEÁGYAZÁS HALOTT: ' + rovidHiba(guard.error)
    + ' — a témaismétlés-őr a gyengébb Jaccard-tartalékra esett vissza '
    + '(mérve: 15 ismétlésből 1-et fog meg). A „nem volt ismétlés" MOST NEM BIZONYÍTÉK.';
}

/**
 * Csonkolás SZOLGÁLTATÓNKÉNT, nem vakon a végéről (2026-09-06).
 *
 * ⚠️ MIÉRT NEM ELÉG A `.slice(0, 90)`: az `error` 2026-09-06 óta MINDEN
 * szolgáltató okát hordozza („google: … · mistral: …"). A vak csonkolás a
 * VÉGÉT vágja le — vagyis pont a második szolgáltató okát, amiért az egész
 * bővítés készült. Mérve: egy valósághű Google-kvótaüzenet (140 kar) mellől
 * a Mistral neve teljesen eltűnt a riportsorból.
 *
 * Így minden résznek SAJÁT kerete van; egyrészes hibánál a viselkedés a
 * korábbival azonos (90 karakter), tehát a riport nem hízik ok nélkül.
 */
export function rovidHiba(error, reszKeret = 90) {
  const r = reszek(error);
  if (!r.length) return '';
  return r.map(x => (x.length > reszKeret ? x.slice(0, reszKeret - 1) + '…' : x)).join(OK_ELVALASZTO);
}
