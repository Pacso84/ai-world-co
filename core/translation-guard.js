// ===================================================================
// FORDÍTÁS-VÉDELEM — a CÍM oldalán (2026-08-04)
//
// MIÉRT: a fordítónak 2026-07-25 óta van nem-fordítás védelme, de az CSAK a
// TÖRZSET nézi. A cím külön úton jön (TITLE: sor a válaszban), és ha az
// hiányzik vagy angolul jön, a kód NÉMÁN az angolt menti:
//     const title = (tm ? tm[1] : enTitle).trim()   // ← angol fallback
//
// Élesben mérve (611 fordítás): 3 spanyol cím maradt angolul. Magyarban 0.
// Kevés — de a KAPCSOLÓDÓ-CIKK dobozon keresztül EGYETLEN ilyen cím 47
// spanyol oldalon jelenik meg, mert minden ajánló a cikk címét mutatja.
// A napi riport ezt nem látta: a "fordítás-hiány" számláló a fájl MEGLÉTÉT
// méri, nem a tartalmát — a fordítás ott volt, csak a címe angol.
//
// A MÉRCE: szó-átfedés a két cím között. Terméknevek (DeepSeek, Copilot)
// mindkettőben szerepelnek, ezért a küszöb magas. Éles kalibráció:
//   valódi angolul-maradt címek:  100% átfedés
//   valódi spanyol cím termékekkel: 71% és 75%
// → 0.85 tisztán elválasztja a kettőt.
// ===================================================================

const words = s => String(s || '').toLowerCase().match(/\p{L}{3,}/gu) || [];

export const UNTRANSLATED_TITLE_THRESHOLD = 0.85;

/**
 * Angolul maradt-e a lefordított cím?
 * @param {string} enTitle  az eredeti angol cím
 * @param {string} trTitle  a fordító által adott cím
 * @returns {boolean} true, ha a cím lényegében az angol (NE mentsük el)
 */
export function titleLooksUntranslated(enTitle, trTitle) {
  const T = words(trTitle);
  const E = new Set(words(enTitle));
  // Rövid címnél (1-2 érdemi szó) nem ítélünk: ott a terméknév-egyezés
  // önmagában 100%-ot adna. Pl. "Gemini 3 Pro" jogosan azonos.
  if (T.length < 4 || !E.size) return false;
  const overlap = T.filter(w => E.has(w)).length / T.length;
  return overlap >= UNTRANSLATED_TITLE_THRESHOLD;
}

export default { titleLooksUntranslated, UNTRANSLATED_TITLE_THRESHOLD };
