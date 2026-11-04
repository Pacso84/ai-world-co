// ===================================================================
// META LEÍRÁS — a keresőben és a megosztásban látszó kivonat
// ===================================================================
//
// ELŐZMÉNY (2026-08-13): a meta leírásunk SZÓ SZERINT a cikk alcíme volt.
// Mérve 688 cikken: 360 (52%) így 120 karakter alatt maradt, pedig a keresők
// ~155-öt jelenítenek meg. Ugyanez a szöveg megy az og:description és a
// twitter:description mezőbe is, tehát nem csak a kereső látja.
//
// AMIT NEM CSINÁLUNK: nem íratjuk újra az alcímeket. Az fizetős lenne, és az
// alcím a LÁTHATÓ oldalon is ott van — a dizájnhoz nem nyúlunk egy meta mező
// kedvéért. Helyette a build a törzs első mondataiból egészíti ki, gépileg:
// nulla modellhívás, örökre $0, és minden újraépítésnél magától frissül.
//
// ⚠️ A "Röviden" doboz NEM lehet a fő forrás: mérve a cikkek 29%-ának van
// ilyenje. Ahol van, ott a törzs elején áll, tehát magától elsőként kerül be —
// de a kiegészítés a sima törzsszövegből is működik.
//
// ŐSZINTE VÁRAKOZÁS: a kereső jelenleg 6 látogatót hoz hetente a 306-ból, és a
// Google amúgy is gyakran felülírja a meta leírást a saját kivonatával. Ez a
// javítás rövid távon valószínűleg MÉRHETETLEN. Azért van mégis, mert egyszer
// kell megírni, utána ingyen fut, és készen áll, ha a kereső valaha beindul.
// ===================================================================

/** Ez alatt kiegészítjük a leírást. */
export const MIN_LEN = 120;
/** E fölött vágunk — a keresők kb. itt csonkolnak. */
export const MAX_LEN = 158;

/**
 * Markdown → sima próza. Ugyanaz az elv, mint a translation-guard
 * stripNonProse-ánál: ami nem emberi mondat, az nem kerül a kivonatba.
 * A link SZÖVEGE viszont marad — az is próza.
 */
export function stripMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')            // kódblokk
    .replace(/`[^`\n]*`/g, ' ')                 // soron belüli kód
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')      // kép (az alt sem mondat)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // [szöveg](cél) → a SZÖVEG marad
    .replace(/^\s*\[[^\]]*\]:\s*\S+$/gm, ' ')   // referencia-link definíció
    .replace(/https?:\/\/\S+/g, ' ')            // csupasz URL
    .replace(/<[^>]+>/g, ' ')                   // beágyazott HTML
    .replace(/^\s*#{1,6}\s+.*$/gm, ' ')         // FEJEZETCÍM: nem folyó szöveg
    .replace(/^\s*>\s?/gm, ' ')                 // idézet-marker (a "Röviden" doboz)
    .replace(/\*\*(In short|Röviden|En resumen):?\*\*/gi, ' ')   // a doboz CÍMKÉJE nem mondat
    .replace(/^\s*[-*+]\s+/gm, ' ')             // felsorolás-jel
    .replace(/^\s*\d+\.\s+/gm, ' ')             // számozott lista jele
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')        // vízszintes vonal
    .replace(/[*_]{1,3}/g, '')                  // vastag/dőlt jelölők
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mondatokra bont. A rövid "mondatokat" (rövidítés-törmelék) eldobja. */
function mondatok(szoveg) {
  return String(szoveg || '')
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 12);
}

/** Szóhatáron vág, és rendes véget ad neki. */
function vag(s, max) {
  if (s.length <= max) return s;
  const nyers = s.slice(0, max);
  const hatar = nyers.lastIndexOf(' ');
  let alap = (hatar > max * 0.5 ? nyers.slice(0, hatar) : nyers).replace(/[\s,;:—-]+$/, '');
  if (/[.!?…]$/.test(alap)) return alap;
  // A "…" IS beleszámít a keretbe — enélkül a max+1 karakter lett (első teszt).
  if (alap.length >= max) alap = alap.slice(0, max - 1).replace(/[\s,;:—-]+$/, '');
  return alap + '…';
}

/**
 * A meta leírás összeállítása.
 *
 * @param {string} lead  a legjobb saját szövegünk (alcím) — ez marad az eleje
 * @param {string} body  a cikk markdown törzse, ebből egészítünk ki
 * @returns {string} 0…MAX_LEN karakter, szóhatáron vágva
 */
export function buildMetaDescription(lead, body, { min = MIN_LEN, max = MAX_LEN } = {}) {
  const eleje = String(lead || '').replace(/\s+/g, ' ').trim();
  if (!eleje) {
    // Nincs alcím: tisztán a törzsből építünk.
    const proza = stripMarkdown(body);
    if (!proza) return '';
    let ki = '';
    for (const m of mondatok(proza)) {
      if ((ki ? ki + ' ' : '').length + m.length > max) break;
      ki = ki ? `${ki} ${m}` : m;
      if (ki.length >= min) break;
    }
    return vag(ki || proza, max);
  }

  if (eleje.length >= min) return vag(eleje, max);

  // Az alcím rövid → kiegészítjük. Az alcím a legjobb szövegünk, ezért MARAD
  // az eleje; a törzs csak hozzátesz.
  const zart = /[.!?…]$/.test(eleje) ? eleje : eleje + '.';
  let ki = zart;
  for (const m of mondatok(stripMarkdown(body))) {
    // Ne mondjuk kétszer ugyanazt: ha a mondat eleje már benne van, kihagyjuk.
    const ujjlenyomat = m.slice(0, 30).toLowerCase();
    if (ujjlenyomat && ki.toLowerCase().includes(ujjlenyomat)) continue;
    if (ki.length + 1 + m.length > max) continue;   // ez nem fér — hátha a következő igen
    ki = `${ki} ${m}`;
    if (ki.length >= min) break;
  }
  // Ha semmi nem fért hozzá, az EREDETI alcím megy ki (nem a mesterséges pont).
  return vag(ki === zart ? eleje : ki, max);
}

export default { buildMetaDescription, stripMarkdown, MIN_LEN, MAX_LEN };
