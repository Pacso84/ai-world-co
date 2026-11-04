// ===================================================================
// TERMÉKNÉV-HORGONY  —  a szövegen belüli linkelés mintaillesztése
// ===================================================================
//
// MIÉRT KELL EZ KÜLÖN:
// A szigorú szóhatár (a terméknév után nem állhat betű) angolul és
// spanyolul helyes, magyarul viszont ELVÁGJA a linkek 12%-át, mert a
// magyar toldalék KÖTŐJEL NÉLKÜL tapad: "Geminit", "Copilotot",
// "Grokkal". A "ChatGPT-t" azért működött mindig, mert ott kötőjel áll
// a rag előtt — az nem betű.
//
// Élesben mérve (2026-08-05, 621 cikk): angol 0 elbukás, SPANYOL 2,
// MAGYAR 835. A user vette észre egy cikkben, hogy a "Geminit" nem link.
//
// A RAGLISTA EXPLICIT, SOHA NEM ELŐTAG-ILLESZTÉS. Ugyanaz a lecke, mint
// a helyesírás-javítónál (analysis→analyzis csapda): egy megengedő minta
// hamis találatot ad. Az éles adatban 40 különböző toldalék szerepelt,
// és közülük EGYETLEN nem volt rag ("Chat", 1 előfordulás) — pontosan
// az, amit egy explicit lista kizár, egy általános minta pedig beengedne.
//
// A RAG A LINKEN KÍVÜL MARAD: a toldalékot LOOKAHEAD nézi, így a találat
// (m[0]) csak a terméknév. Így a magyar szöveg is úgy néz ki, mint a már
// működő "ChatGPT-t": a márkanév aláhúzott, a rag nem.
// ===================================================================

// Magyar toldalékok, amelyek közvetlenül a terméknévhez tapadhatnak.
// A sorrend nem számít (a regex visszalép), de hosszúság szerint van
// csoportosítva, hogy olvasható maradjon.
export const HU_SUFFIXES = [
  // birtokos + rag (a leghosszabbak elöl, hogy szemre is követhető legyen)
  'jainak', 'jeinek', 'jaival', 'jeivel',
  'jának', 'jének', 'jában', 'jében', 'járól', 'jéről', 'jához', 'jéhez',
  'jával', 'jével', 'jaink', 'jeink',
  'ként', 'nál', 'nél', 'ból', 'ből', 'ról', 'ről', 'tól', 'től',
  'hoz', 'hez', 'höz', 'ban', 'ben', 'nak', 'nek', 'ért', 'val', 'vel',
  'ját', 'jét', 'juk', 'jük', 'unk', 'ünk',
  // -val/-vel teljes hasonulása: a v felveszi az előző mássalhangzót
  'tal', 'tel', 'kal', 'kel', 'gal', 'gel', 'nal', 'nel', 'ral', 'rel',
  'sal', 'sel', 'zal', 'zel', 'dal', 'del', 'bal', 'bel', 'pal', 'pel',
  'fal', 'fel', 'mal', 'mel', 'cal', 'cel', 'lal', 'lel', 'jal', 'jel',
  // rövid ragok és jelek
  'ba', 'be', 'ra', 're', 'on', 'en', 'ön', 'ig', 'ul', 'ül',
  'ot', 'et', 'at', 'öt', 'ok', 'ek', 'ak', 'ök', 'os', 'es', 'as', 'ös',
  'ja', 'je',
  't', 'k', 'n', 's', 'i', 'é'
];
// SZÁNDÉKOSAN KIMARAD: 'ta', 'te', 'nk'.
// A -ta/-te igei személyrag ("látta", "kérte"), névszóhoz nem járul; az éles
// szövegben egyetlen előfordulása egy FORDÍTÁSI ELGÉPELÉS volt ("Nyisd meg a
// Geminita" — helyesen "Geminit"), és nem dolgunk elgépelést linkelhetővé
// tenni. A birtokos többes helyes alakja '-unk/-ünk', nem '-nk'.

const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Hosszabb rag ELŐRE az alternációban: így a minta olvasható, és a
// visszalépés is kevesebbet dolgozik.
const HU_ALT = [...HU_SUFFIXES].sort((a, b) => b.length - a.length).join('|');

/**
 * Egy terméknév horgony-regexe.
 *
 * @param {string} tool  a terméknév, pl. "Gemini" vagy "GitHub Copilot"
 * @param {string} lang  'hu' esetén a tapadó magyar toldalékot is elfogadja
 * @returns {RegExp}     a TALÁLAT mindig csak a terméknév (a rag nem része)
 *
 * Kis-nagybetűre ÉRZÉKENY: a márkanevek nagybetűsek, így a köznévi
 * "grok"/"claude" előfordulás nem lesz link.
 */
export function toolRegex(tool, lang) {
  const esc = escapeRe(tool);
  const before = '(?<![\\p{L}\\p{N}])';
  const after = lang === 'hu'
    // A rag LOOKAHEAD-ben: felismerjük, de nem húzzuk bele a linkbe.
    ? `(?=(?:${HU_ALT})?(?![\\p{L}\\p{N}]))`
    : '(?![\\p{L}\\p{N}])';
  return new RegExp(`${before}${esc}${after}`, 'u');
}
