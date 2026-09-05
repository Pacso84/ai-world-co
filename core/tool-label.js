// ===================================================================
// CÉG + ESZKÖZ CÍMKE — mert a GYIK azt írta, "GitHub GitHub Copilot"
// ===================================================================
//
// ELŐZMÉNY (2026-09-05): a website/build.js a GYIK-blokkban VAKON fűzte
// össze a két mezőt:
//
//     const faqTool = [a.company, a.tool].filter(Boolean).join(' ');
//
// Amíg a cég és az eszköz külön szó volt (OpenAI + ChatGPT, NVIDIA +
// ChatRTX), ez helyes eredményt adott, és ÉVEKIG igaznak LÁTSZOTT. Az
// első olyan eszköz, amelynek a neve maga is a céggel kezdődik (GitHub
// Copilot, Apple Intelligence, Meta AI), visszamenőleg megdöntötte a
// feltevést — ugyanaz az alak, mint a core/tool-kinds.js "eszköz =
// asszisztens" tévedésénél: egy implicit feltevés ott dőlt meg, ahol
// már senki nem nézte.
//
// A kár 133 cikk-példányban (14 cég/eszköz pár) állt elő, MIND A HÁROM
// nyelven, és a schema.org FAQPage jelölésbe is beleírt:
//     "This guide uses GitHub GitHub Copilot — but the approach..."
//     "Ez az útmutató a(z) Apple Apple Intelligence eszközt használja..."
//
// KÉT ALAKJA VAN, és a második csak a valódi adat átnézésekor derült ki:
//   1) a cég az eszköznév ELEJÉN áll  → "Meta" + "Meta AI"
//   2) az eszköz a CÉGNÉV eleje       → "Perplexity AI" + "Perplexity"
// Mindkettőnél a HOSSZABB, teljesebb név a helyes címke.
//
// 🔑 EXPLICIT SZÓHATÁR, SOHA NEM PUSZTA ELŐTAG-ILLESZTÉS.
// A csábító egysoros (`tool.startsWith(company)`) néma kárt okozna:
// "Meta" + "Metaphor" → "Metaphor", vagyis egy IDEGEN termék nevére
// cserélnénk a mi címkénket. Ugyanaz a csapda, mint az us-spelling.js
// analysis→analyzis esete és a tool-regex.js raglistája: a megengedő
// minta hamis találatot ad. Ezért a cégnév után betű vagy számjegy NEM
// állhat (\p{L}, \p{N}) — a kötőjel, a pont, a kettőspont igen.
//
// AZ IRÁNY IS SZÁMÍT (2026-08-14, prompt-szivárgás): a "ne kettőződjön"
// mércét a "csonkolj mindent" megoldás is teljesítené. A teszt ezért
// külön kimondja, hogy az eszköznév NEM veszhet el a címkéből.
// ===================================================================

// Regex-metakarakterek semlegesítése: a cégnév ADAT, nem minta.
// ("C++", "A.I.", "(x)" mind előfordulhat egy mezőben.)
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Üres mezőt, nullát, nem-sztringet is elnyel — a build.js-ből bármi jöhet.
const norm = v => (v ? String(v) : '').trim();

/**
 * Egy szóhatáron kezdődik-e a `hosszu` a `rovid` szöveggel?
 * Kis/nagybetűre ÉRZÉKETLEN ("github" = "GitHub"), ékezetre NEM
 * ("Mistral" ≠ "Mistrál").
 */
function kezdodikSzohataron(hosszu, rovid) {
  if (!rovid) return false;
  return new RegExp('^' + escapeRe(rovid) + '(?![\\p{L}\\p{N}])', 'iu').test(hosszu);
}

/**
 * A cég- és eszköznév olvasható címkéje, kettőződés nélkül.
 *
 * @param {string} company  pl. "GitHub", "NVIDIA"
 * @param {string} tool     pl. "GitHub Copilot", "ChatRTX"
 * @param {string} [sep]    a KÉT NÉV KÖZÉ kerülő jel; alapból szóköz.
 *                          A 📘 útmutató-csempe morzsamenüje " · "-tal hívja.
 * @returns {string}        pl. "GitHub Copilot", "NVIDIA · ChatRTX"
 *
 * Bármelyik mező hiányozhat; ha mindkettő üres, üres sztring jön vissza
 * (a hívó ebből dönti el, kell-e egyáltalán a GYIK-kérdés).
 *
 * AZ ELVÁLASZTÓ NEM BEFOLYÁSOLJA A NÉV-DÖNTÉST. Ha az egyik név elnyeli a
 * másikat, EGY név marad — elválasztóval sem lesz belőle kettő. A csempén
 * pontosan ez látszott ki: "📘 GitHub · GitHub Copilot", 378 kiépített
 * oldalon. Az elválasztó CSAK akkor kerül bele, ha tényleg két név áll ott;
 * ezt a régi kódban a `filter(Boolean)` védte, itt a korai visszatérések.
 */
export function toolLabel(company, tool, sep) {
  const c = norm(company), e = norm(tool);
  if (!c) return e;
  if (!e) return c;
  // A hosszabb név már tartalmazza a rövidebbet → egyszer írjuk ki.
  if (kezdodikSzohataron(e, c)) return e;
  if (kezdodikSzohataron(c, e)) return c;
  // Az üres elválasztó összeragasztaná a két nevet ("NVIDIAChatRTX") — a
  // hiányzó és az üres kérés egyaránt szóközt kap.
  return c + (sep || ' ') + e;
}
