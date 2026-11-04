// ===================================================================
// MEMÓRIA-BEÁGYAZÁS GYORSÍTÓTÁR (2026-09-06)
// ===================================================================
//
// MIÉRT LETT KÜLÖN FÁJL — a gyökérok, igazolva. Ugyanannak a CI-futásnak
// két commitja:
//     8cd53e0a  02:02:54  memory/store.json = 6 379 702 bájt · 212 vektor
//     a8fd5f08  02:12:40  memory/store.json =   318 783 bájt ·   0 vektor
// Közte egyetlen dolog fut, ami vektort töröl: a Házmester. A vektorok tehát
// MINDEN futásban megszülettek (`recallSemantic` visszatöltötte és mentette)
// és MINDEN futásban törlődtek. 12 napja.
//
// A KÁR NEM A LEMEZEN VOLT, HANEM A GIT-TÖRTÉNETBEN: a 13,9 MB ↔ 0,3 MB
// oszcilláció megsemmisíti a delta-tömörítést — mérve 165,9 KB/commit a
// stabil 14,3 KB helyett, azaz 11,6× drágább, ~335 MB/év a NYILVÁNOS repó
// történetében, VÉGLEGESEN.
//
// A MEGOLDÁS a `core/topic-dedup.js` MŰKÖDŐ mintája: a vektor gitignore-olt
// gyorsítótár-fájlba megy (`memory/memory-embeddings.json`), a szövegtár
// (`memory/store.json`) pedig tiszta és kicsi marad.
//
// 🔑 A GYORSÍTÓTÁR TUDJA, MELYIK TÉRBEN KÉSZÜLT. A Google 768, a Mistral 1024
// dimenziós vektort ad, és a kettő KÜLÖN TÉR — összemérni őket értelmetlen.
// A `cosineSim()` eltérő hosszra NÉMÁN 0-t ad vissza, ami „nem hasonló"-nak
// LÁTSZIK, pedig „nem tudom". Ezért minden bejegyzés mellett ott a
// SZOLGÁLTATÓ és a DIMENZIÓ, és eltérésnél a bejegyzés TÉVESZTÉS, nem adat.
// (Ugyanez a méreg-cache hiba fogta meg a `topic-dedup.js`-t 2026-08-25-én.)
//
// ⚠️ A SZÖVEG IS VÁLTOZHAT. A `remember()` a stabil `kulcs` mellett ÁTÍRJA az
// emlék szövegét („a lecke lényege állandó, de a példa ne legyen hetekkel
// ezelőtti") — a régi szöveghez tartozó vektor ilyenkor hazugság. Ezért
// minden bejegyzésben ott a szöveg ujjlenyomata is.
//
// ⚠️ EZ A FÁJL GITIGNORE-OLT (.gitignore), és ez SZÁNDÉKOS: a CI friss
// checkoutot csinál, tehát ott a gyorsítótár mindig hideg — pontosan úgy,
// ahogy MA is minden futás újraszámol. Nincs időbeli visszalépés, viszont a
// git-történet megszabadul a napi 13,9 MB-os hullámzástól. Helyben (és minden
// tartós munkakörnyezetben) a gyorsítótár megmarad, és az újraszámolás
// egyszeri.
// ===================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// ⚠️ TESZT-FELÜLÍRÁS, élesben nincs beállítva — ugyanaz a minta, mint a
// `MEMORY_STORE_PATH`-nál és a `TOPIC_EMBED_CACHE_PATH`-nál. A teszt SOHA nem
// írhat az éles gyorsítótárba (a `topic-dedup` esetében ez már megtörtént:
// 8 dimenziós ál-vektorok kerültek az éles fájlba).
export const CACHE_PATH = process.env.MEMORY_EMBED_CACHE_PATH
  || join(__dirname, '..', 'memory', 'memory-embeddings.json');

const MEGJEGYZES = 'A memória szemantikus keresésének vektor-gyorsítótára. '
  + 'GITIGNORE-OLT és ÚJRAÉPÍTHETŐ — nem való a git-történetbe. '
  + 'Szolgáltató- vagy dimenzió-váltásnál a teljes tartalma tévesztés lesz.';

/**
 * Rövid, determinisztikus szöveg-ujjlenyomat (FNV-1a, 32 bit).
 *
 * Nem kriptográfia: azt a kérdést kell megválaszolnia, hogy „ugyanaz a szöveg
 * van-e még az emlékben, mint amikor a vektort készítettük". Ütközésre nincs
 * támadó, csak véletlen — és egy ütközés legrosszabb esetben egy elavult
 * vektort hagy bent, nem hibát.
 */
export function ujjlenyomat(szoveg) {
  const s = String(szoveg == null ? '' : szoveg);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * A gyorsítótár betöltése — MINDIG az AKTUÁLIS tér ismeretében.
 *
 * 🔑 Ha a fájl más szolgáltatóé vagy más dimenziójú, ÜRESEN térünk vissza.
 * Nem „javítjuk meg" és nem konvertáljuk: a másik tér vektorai nem
 * fordíthatók át, csak újraszámolhatók. SOHA nem dob — hiányzó és sérült
 * fájl egyaránt „üres gyorsítótár".
 *
 * @param {string} provider  a MOSTANI szolgáltató neve
 * @param {number} dim       a MOSTANI vektorhossz (a friss kérdés-vektorból)
 * @param {string} [ut]      útvonal-felülírás (teszt)
 * @returns {{items: Record<string,{v:number[],p:string,d:number,h:string}>}}
 */
export function cacheBetolt(provider, dim, ut = CACHE_PATH) {
  const ures = { items: {} };
  let nyers;
  try { nyers = JSON.parse(readFileSync(ut, 'utf-8')); } catch { return ures; }
  if (!nyers || typeof nyers !== 'object') return ures;
  const m = nyers._meta || {};
  // A fejléc az EGÉSZ fájl teréről szól: eltérés = az egész tartalom tévesztés.
  if (String(m.provider || '') !== String(provider || '')) return ures;
  if (Number(m.dim) !== Number(dim)) return ures;
  const items = (nyers.items && typeof nyers.items === 'object') ? nyers.items : {};
  return { items };
}

/**
 * Egy emlék vektora a gyorsítótárból — vagy `null`, ha bármi nem stimmel.
 *
 * NÉGY dolognak kell egyszerre igaznak lennie; bármelyik hiánya TÉVESZTÉS:
 *   1. van vektor, és tömb                (sérült/félbeírt fájl)
 *   2. a hossza az AKTUÁLIS dimenzió      (szolgáltató-váltás, csonka vektor)
 *   3. a jelölt szolgáltató az AKTUÁLIS   (azonos dimenziójú másik tér)
 *   4. a szöveg ujjlenyomata egyezik      (a lecke szövegét átírták)
 *
 * ⚠️ A `d` mező NEM helyettesíti a `v.length`-t: egy félbeírt fájlban a jelölt
 * hazudhat. Mindkettőt megnézzük.
 */
export function cacheOlvas(cache, id, szoveg, provider, dim) {
  const be = cache && cache.items ? cache.items[id] : null;
  if (!be || typeof be !== 'object') return null;
  if (!Array.isArray(be.v) || be.v.length !== dim) return null;
  if (Number(be.d) !== Number(dim)) return null;
  if (String(be.p || '') !== String(provider || '')) return null;
  if (be.h !== ujjlenyomat(szoveg)) return null;
  return be.v;
}

/** Egy frissen számolt vektor betétele a gyorsítótárba (memóriában). */
export function cacheIr(cache, id, szoveg, vektor, provider) {
  if (!cache || !cache.items || !Array.isArray(vektor) || !vektor.length) return false;
  cache.items[id] = { v: vektor, p: String(provider || ''), d: vektor.length, h: ujjlenyomat(szoveg) };
  return true;
}

/**
 * Kiírás lemezre. SOHA nem dob: a gyorsítótár elvesztése kellemetlenség,
 * nem hiba — a hívó munkája már kész, azt nem dönthetjük el.
 *
 * A fejlécbe a MOSTANI tér kerül, hogy a következő betöltés tudja, mit talált.
 */
export function cacheMent(cache, provider, dim, ut = CACHE_PATH) {
  try {
    mkdirSync(dirname(ut), { recursive: true });
    writeFileSync(ut, JSON.stringify({
      _meta: {
        note: MEGJEGYZES,
        provider: String(provider || ''),
        dim: Number(dim) || 0,
        count: Object.keys(cache.items || {}).length,
        updated: new Date().toISOString()
      },
      items: cache.items || {}
    }, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

export default { CACHE_PATH, ujjlenyomat, cacheBetolt, cacheOlvas, cacheIr, cacheMent };
