// ===================================================================
// llms.txt — NYELV-MONDAT (2026-08-25)
// ===================================================================
// Az llms.txt-t az AI-keresők/asszisztensek olvassák (Perplexity, ChatGPT).
// 2026-08-25-én a Perplexity ELŐSZÖR küldött hozzánk látogatót — vagyis ez
// a fájl már nem elméleti.
//
// A HIBA, ami kiváltotta: az llms.txt bevezetője KÉZZEL ÍRT mondat volt, és
// azt állította, hogy az oldal németül és franciául is elérhető. Azokat a
// nyelveket 2026-07-31-én kivezettük; a /de/* és /fr/* azóta 301-gyel megy
// az angolra. Vagyis épp annak a kereső-fajtának adtunk rossz információt,
// amelyik most kezdett minket észrevenni — 25 napon át.
//
// A TANULSÁG NEM AZ, HOGY ÁT KELLETT VOLNA ÍRNI A MONDATOT. Az az, hogy egy
// kézzel írt mondat SOHA nem tud együtt mozogni a beállítással. A nyelvlista
// (SITE_LANGS) egy helyen van megadva — a szövegnek onnan kell születnie,
// különben a következő nyelv-változásnál újra elsodródik, és megint csak
// akkor derül ki, ha valaki véletlenül ránéz.
// ===================================================================

/** Angol nyelvnevek — az llms.txt-t angolul olvassák a keresők. */
export const LANG_EN_NAME = {
  en: 'English', hu: 'Hungarian', es: 'Spanish', };

/**
 * „Also available in …" mondat a ÉLŐ nyelvlistából.
 * Csak angol → üres sztring (nincs mit hirdetni).
 * Ismeretlen kód → magát a kódot írja ki; jobb, mint elhallgatni.
 */
export function langSentence(siteLangs) {
  const others = (Array.isArray(siteLangs) ? siteLangs : [])
    .filter(l => typeof l === 'string' && l && l !== 'en');
  if (!others.length) return '';
  const parts = others.map(l => `${LANG_EN_NAME[l] || l} (/${l}/)`);
  const list = parts.length === 1
    ? parts[0]
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return ` Also available in ${list}.`;
}
