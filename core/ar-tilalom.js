// ===================================================================
// ÁR-TILALOM — termékárat a cikkeink SEMMILYEN formában nem közölnek (2026-11-01, user)
// ===================================================================
//
// USER 11-01: „de mondtam hogy árakat nem közlünk!" → „igen mindenre!"
// (hír, útmutató, heti összefoglaló, tény-ellenőrző javítás — minden gépi szöveg).
// Előtte a szabály csak az útmutatóra szólt (style-guide „💵 ÁR", 08-17), és a
// hírekbe, sőt egy kézi javításba (3 Alexa-útmutató, 3778086c) is bekerült ár.
//
// MIT FOG MEG: a MEGNEVEZETT TERMÉK árát — „ChatGPT Plus ($20/month)",
// „starting at $2,399", „$19.99 per month without Prime", „Around $10 for the
// cheapest plan".
// MIT HAGY: az olvasó SAJÁT példaszámait (költségvetés, fizetés, ajándékkeret,
// „find a flight under $300"), a cégek befektetési / bevételi összegeit
// („$150 million"), a kódblokkot és az idézőjeles példa-promptot.
//
// MÉRVE (2026-11-01, 822 publikált angol cikk): 8 cikk jelez, ebből 7 valódi
// termékár; az olvasói példaszámok (~45 útmutató) egyike sem.
//
// Nyelvfüggetlen pénz-jel + angol/magyar/spanyol környezet-szavak, mert a
// tény-ellenőrző a fordítást is írja.
// ===================================================================

import { articleBody } from './guide-claims.js';

// Pénzösszeg — a nagyságrend-utótagos (K/M/B/million/billion/millió/milliárd/millones) KIMARAD:
// az befektetés / bevétel / megtakarítás, nem a termék ára.
const NAGY = String.raw`(?!\s?(?:[kmb]n?\b|million|billion|trillion|thousand|millió|milliárd|ezer|mil(?:l[oó]n(?:es)?)?\b|millones))`;
const PENZ = new RegExp(
  String.raw`(?:US\s?|A\s?|C\s?)?\$\s?\d[\d,.]*\d?${NAGY}`
  + String.raw`|[€£₹¥]\s?\d[\d,.]*${NAGY}`
  + String.raw`|\b\d[\d,.]*\s?(?:USD|EUR|GBP|INR|US-dollár|dollár(?:t|ért|os|ba|tól|ra)?|dollars?|dólares?|euró(?:t|ért|s|tól)?|euros?|pounds?|rupees?)(?![\wáéíóöőúüű])`
  + String.raw`|\b\d[\d,.]*\d\s?(?:\$|€|£)`,   // spanyol: „2.399 $"
  'gi');

// 2026-11-02 (kód-átnézés, 8. rész): a NULLA összeg nem ár („$0 on the free plan” = ingyenes, azt szabad mondani).
const NULLA = /^\D*0+(?:[.,]0+)?\D*$/;

// Időszak a pénz UTÁN: „/month", „per month", „havonta", „al mes".
// ⚠️ A JS \b CSAK ASCII-betűt ismer: „hó)" vagy „ára" mellett NEM áll meg — ezért ékezetes
// szóhatárnál kézi lookaround-ot használunk (mérve: „20 USD/hó)" és „suscripción" átcsúszott).
const IDOSZAK = /^[\s)*]*(?:USD\s?)?(?:\/\s?(?:mo|month|yr|year|user|seat|hó|hónap|év|mes|año)(?![\wáéíóöőúüűñ])|(?:per|a|each)\s(?:month|year|user|seat)\b|monthly|annually|yearly|havonta|havi|évente|egy hónapra|(?:al|por|cada)\s(?:mes|año)(?![\wáéíóöőúüűñ])|mensuales?|anuales?)/i;
// Termék-szó UGYANABBAN a mondatban.
const TERMEK = /(?<![\wáéíóöőúüűñ])(?:subscriptions?|subscribe|membership|plans?|tiers?|Plus|Pro|Premium|Prime|Ultra|Max|Business|Enterprise|licen[cs]e|laptops?|headsets?|glasses|előfizetés\S*|csomag\S*|tagság\S*|suscripci[oó]n\S*|plan(?:es)?|membres[ií]a)(?![\wáéíóöőúüűñ])/i;
// Ár-ige a pénz ELŐTT: „starting at", „priced at", „costs", „kerül", „cuesta".
const IGE = /(?:\bstart(?:s|ing)? at|\bpriced at|\bprice[sd]?\s(?:is|of|at|from|starts at)|(?<!\ba\s)\bcosts?|\bretails?(?:\sfor|\sat)?|\bsells? for|\bon sale (?:at|for)|\bMSRP|\bfor (?:just|only)|\bfrom just|\blaunch(?:es|ed)? at|(?<![\wáéíóöőúüű])(?:kerül|ára|áron)|\bcuesta|\bcuestan|\bvalen?|\bprecio(?:\sde)?|\bdesde)\s*(?:about|around|roughly|only|just|kb\.|körülbelül|alrededor de|unos)?\s*$/i;
// Pénz UTÁN „for the cheapest plan" / „a Plus csomagért".
const UTANA_TERMEK = /^\s?(?:USD\s?)?(?:(?:for|on)\s(?:the\s|a\s|an\s)?(?:[\w-]+\s){0,2}(?:plan|tier|subscription|membership|version)\b|-?(?:tól|től)?\s?(?:indul|kezdve|kerül)|\s?(?:laptops?\b|laptop\S*|portátil\S*|csomag\S*|előfizetés\S*))/i;
// Időszak a pénz ELŐTT: „havi 19,99 dollár", „évi …".
const ELOTTE_IDOSZAK = /(?<![\wáéíóöőúüű])(?:havi|évi|havonta|monthly|yearly)\s*(?:kb\.|körülbelül|about|around)?\s*$/i;

// 2026-11-02 (kód-átnézés, 8. rész) — EZEK CSÚSZTAK ÁT: „Alexa+ is $19.99 without Prime.”, „The Pro tier is $200.”,
// „It is €9 per month.”, „Gemini Advanced is US$19.99.”, „Az Alexa+ ára Prime nélkül 19,99 dollár.”,
// „El plan Pro vale 19,99 dólares.”, „$1.25 per million tokens”, „The price of Plus is $20.”
// Létige a pénz ELŐTT: „X is $…", „X: $…", „es de", „van".
// (A kettőspont NEM létige itt: „…for the first laptop: … Price: $2,199" egy olvasói adatlap-példa.)
const KOPULA = /(?:\b(?:is|are|was|were|will be|remains?|stays?|es|son|está|sale)|(?<![\wáéíóöőúüű])(?:van|lesz|marad))\s*(?:now\s|still\s|about\s|around\s|roughly\s|only\s|just\s|de\s|kb\.\s|körülbelül\s)?$/i;
// „It is €9 per month” — a névmás a termékre utal; a „Groceries are $400 a month” olvasói költségvetés (nem névmás).
const NEVMAS_ALANY = /(?<![\wáéíóöőúüűñ])(?:it|this|that|it's|ez|az|es|cuesta)\s+(?:is\s|costs?\s|van\s)?(?:now\s|still\s|about\s|around\s|only\s|just\s)?$/i;
// Tulajdonnév (termék) közvetlenül a létige előtt: „Gemini Advanced is", „Alexa+ is", „Le Chat Pro:" — az „It is" /
// „Your budget is" / „The total is" NEM (olvasói szám).
// A név TERMÉKSZERŰ legyen: több szó („Gemini Advanced”), „+” vagy szám benne („Alexa+”, „GPT-5”), vagy mondat
// KÖZBEN álló tulajdonnév — a mondatkezdő egyszavas „Rent is $1,200” / „Groceries are $400” olvasói költségvetés.
const NEVES_ALANY_RE = /([A-Z][\w+.-]*(?:\s[A-Z0-9][\w+.-]*)*)\s(?:is|are|costs?|es|cuesta|vale)\s(?:now\s|still\s|about\s|around\s|only\s|just\s)?$/;
const NEM_NEV = /^(?:It|This|That|The|Your|My|A|An|If|Each|Total|Price|Precio|Cost|Costo|Budget|Presupuesto|Az?|Ez|Ár|Tu|Su|El|La|Los|Las|Es)$/;
function nevesAlany(elotte) {
  const m = elotte.match(NEVES_ALANY_RE);
  if (!m) return false;
  const nev = m[1], elsoSzo = nev.split(/\s/)[0];
  if (NEM_NEV.test(elsoSzo)) return false;
  const mondatKozben = /[\p{L}\p{N}]/u.test(elotte.slice(0, m.index).replace(/[*_#>\-•\s]/g, ''));
  return /\s/.test(nev) || /[+\d]/.test(nev) || mondatKozben;
}
// Csomagnév + kettőspont: „Le Chat Pro: €14.99”, „Basic: $10” — a „Groceries: $400” / „Price: $2,199” NEM.
const CSOMAG_CIMKE = /(?<![\wáéíóöőúüűñ])(?:Plus|Pro|Premium|Ultra|Max|Business|Enterprise|Team|Basic|Standard|Starter|plan|tier|csomag|előfizetés|plan(?:es)?)\s?:\s?$/i;
// Ár-szó a pénz ELŐTT, közel (≤ 45 karakter, vessző/zárójel/gondolatjel nélkül): „The price of Plus is $20",
// „Az Alexa+ ára Prime nélkül 19,99 dollár". NEM: a „cost" FŐNÉV („at a cost around $12,000" = cég kiadása), a „vale"
// („vale la pena" = megéri; a „vale 19,99" az IGE-ben van), a „Price:" adatlap-címke (olvasói példa-adatlap), és a
// mondat elején álló, vesszővel elválasztott ár-szó („the plan's base price, taxes … say $25" = olvasói példa).
const ARSZO_ELOTTE = /(?<![\wáéíóöőúüűñ])(?:prices?(?!\s*:)|pricing|priced|ára(?!\s*:)|árú|árát|árért|precios?(?!\s*:)|cuesta|cuestan|costs)(?![\wáéíóöőúüűñ])[^,;:—–()\n]{0,45}$/i;
// Egységár a pénz UTÁN (API, kép, perc): „per million tokens", „/1M tokens", „per 1M", „por millón de tokens", „millió tokenenként".
const EGYSEGAR = /^[\s)*]*(?:USD\s?)?(?:(?:\/|per\s|a\s|for\s|each\s|por\s|cada\s)\s?(?:(?:1\s?)?(?:M|K|million|thousand|mill[oó]n(?:es)?|1,000|1000)\b\s?)?(?:de\s)?(?:input\s|output\s|entrada\s|salida\s)?(?:tokens?|images?|requests?|API calls?|calls?|credits?|minutes?|seconds?|generations?|videos?)\b|(?:\/|per\s)\s?(?:1\s?)?(?:M|K|million|thousand)\b|(?:1\s)?millió\s(?:bemeneti\s|kimeneti\s)?token)/i;

// Olvasói példák sora — ezek az olvasó saját számai, nem a világról szóló állítások.
const PELDA_SOR = /💬|\bExample\b|\bPélda\b|\bEjemplo\b|You'll know it worked|hogy működött|hogy működik|Sabrás que funcionó|Sabrás que ha funcionado/i;
// Idézőjeles példa-prompt (az olvasó gépeli be) — a pénz benne a SAJÁT száma.
const IDEZET = /"[^"\n]{0,400}"|“[^”\n]{0,400}”|„[^”"\n]{0,400}[”"]|«[^»\n]{0,400}»/g;

// A frontmatter LÁTHATÓ mezői (cím, alcím, leírás) is számítanak: a cím a lap tetején és a keresőben, az alcím a
// cím alatt, a leírás a találati listában jelenik meg (2026-11-02, kód-átnézés: eddig kimaradt; CRLF-es fájlnál
// viszont az EGÉSZ frontmatter a törzsbe csúszott — most mindkét sorvég ugyanúgy megy).
const LATHATO_MEZO = /^(?:title|subtitle|description|seo_title|meta_description|excerpt|summary):[^\S\n]*(.*)$/gm;
const FRONTMATTER = /^﻿?---\n([\s\S]*?)\n---[^\S\n]*(?:\n|$)/;
/** A cikk olvasó által látott szövege: a frontmatter látható mezői (idézőjel nélkül) + a törzs (kódblokk nélkül). */
function latottSzoveg(markdown) {
  const raw = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n');
  const fm = raw.match(FRONTMATTER);
  const mezok = fm ? [...fm[1].matchAll(LATHATO_MEZO)].map(m => m[1].trim().replace(/^(["'])([\s\S]*)\1$/, '$2').replace(/\\"/g, '"')) : [];
  return [...mezok, articleBody(fm ? raw.slice(fm[0].length) : raw)].join('\n');
}

/** Mondatokra bontás (a sorhatár is határ). */
function mondatok(szoveg) {
  return szoveg.split(/\n/).flatMap(s => s.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ¿¡>*#\-])/));
}

/**
 * Termékár-állítások a cikk törzsében.
 * @param {string} markdown  teljes cikk (frontmatterrel vagy anélkül)
 * @returns {string[]}       a gyanús mondatok (rövidítve), sorrendben, ismétlés nélkül
 */
export function arAllitasok(markdown) {
  const talalt = [];
  for (const sor of latottSzoveg(markdown).split(/\n/)) {
    if (PELDA_SOR.test(sor)) continue;
    const tiszta = sor.replace(IDEZET, ' ');
    for (const m of mondatok(tiszta)) {
      for (const p of m.matchAll(PENZ)) {
        if (NULLA.test(p[0])) continue;
        const elotte = m.slice(0, p.index);
        const utana = m.slice(p.index + p[0].length);
        const idoszak = IDOSZAK.test(utana);
        const ar = (idoszak && TERMEK.test(m)) || IGE.test(elotte) || UTANA_TERMEK.test(utana)
          || (ELOTTE_IDOSZAK.test(elotte) && TERMEK.test(m))
          || (KOPULA.test(elotte) && (TERMEK.test(m) || (idoszak && NEVMAS_ALANY.test(elotte))))
          || nevesAlany(elotte) || CSOMAG_CIMKE.test(elotte)
          || ARSZO_ELOTTE.test(elotte)
          || EGYSEGAR.test(utana);
        if (ar) { talalt.push(m.trim().replace(/\s+/g, ' ').slice(0, 220)); break; }
      }
    }
  }
  return [...new Set(talalt)];
}

/** Van-e termékár a szövegben? */
export function vanAr(markdown) {
  return arAllitasok(markdown).length > 0;
}

/**
 * Az ÚJ szöveg hoz-e be olyan ár-mondatot, ami a régiben nem volt? (javítás-őr)
 * @returns {string[]} az új ár-mondatok
 */
export function ujArak(regi, uj) {
  const volt = new Set(arAllitasok(regi));
  return arAllitasok(uj).filter(m => !volt.has(m));
}

/** Az ellenőrző jelzése — „KÓD: szöveg" alak, a BLOCKING_CODES-ban szerepel. */
export function arJelzes(markdown) {
  const a = arAllitasok(markdown);
  if (!a.length) return null;
  return `PRICE_IN_ARTICLE: ${a.length} termékár a szövegben (${a.slice(0, 2).map(s => `"${s.slice(0, 90)}"`).join('; ')}). `
    + 'Árat NEM közlünk: nevezd meg a csomagot, és küldd az olvasót a hivatalos árlapra.';
}

export default { arAllitasok, vanAr, ujArak, arJelzes };
