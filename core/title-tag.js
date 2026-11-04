// ===================================================================
// A <title> RÖVIDÍTÉSE — csak a keresőnek és a böngészőfülnek
// ===================================================================
//
// MIÉRT (2026-09-23, Bing Webmaster „Oldalvizsgálat": „A cím túl hosszú",
// 173 oldal). Mérve a teljes állományon a 70 karakter fölötti címek:
// angolul 194, magyarul 515, spanyolul 594 (az 1029-ből) — a fordítás
// hosszabb. A Google ~60, a Bing ~70 karakternél vág, és a vágás a cím
// VÉGÉT nyesi le, gyakran szó közepén.
//
// ⚠️ CSAK A <title> RÖVIDÜL. A lapon látható főcím (h1), az og:title és a
// cikk minden más része a TELJES címet kapja.
//
// A szabály (sorrendben):
//   1. ha belefér → változatlan
//   2. ha van tagolás (": ", " — ", " – ", " - ", "? ") és az ELŐTTE álló
//      rész elég hosszú ahhoz, hogy önmagában értelmes legyen → az megy
//   3. különben szóhatáron vágunk, a végéről lehagyjuk a lógó kötőszót és
//      írásjelet, és „…" jelzi, hogy a cím folytatódik
// ===================================================================

export const CIM_TAG_MAX = 65;
const TAGOLAS_MIN = 25;          // ennél rövidebb előtag nem áll meg egyedül

// A végén nem maradhat: névelő, kötőszó, elöljáró (en/hu/es).
const LOGO_VEG = /\s+(?:a|an|the|and|or|but|to|for|of|in|on|with|at|by|from|your|you|how|is|are|az|a|egy|és|vagy|de|hogy|meg|is|el|le|ki|be|y|o|de|del|la|el|los|las|un|una|para|con|en|por|tu|tus|que|cómo|como)$/i;

/**
 * @param {string} cim a teljes cím
 * @param {number} [max] a legnagyobb hossz (karakter)
 * @returns {string}
 */
export function cimTag(cim, max = CIM_TAG_MAX) {
  const t = String(cim == null ? '' : cim).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;

  // 2. tagolás mentén: a LEGUTOLSÓ olyan tagolás, ami még belefér
  const jeloltek = [];
  for (const m of t.matchAll(/(\?)\s|:\s|\s[—–-]\s/g)) {
    const eleje = t.slice(0, m.index + (m[1] ? 1 : 0)).trim();
    if (eleje.length >= TAGOLAS_MIN && eleje.length <= max) jeloltek.push(eleje);
  }
  if (jeloltek.length) return jeloltek[jeloltek.length - 1];

  // 3. szóhatáron, „…"-val
  let v = t.slice(0, max - 1);
  const szokoz = v.lastIndexOf(' ');
  if (szokoz > max * 0.5) v = v.slice(0, szokoz);
  for (let i = 0; i < 4; i++) {
    const elotte = v;
    v = v.replace(/[\s,;:.!?—–-]+$/, '').replace(LOGO_VEG, '');
    if (v === elotte) break;
  }
  return v + '…';
}
