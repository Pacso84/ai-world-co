// ===================================================================
// NÉV-ZÁR — a TÉNYELLENŐR nem nevezhet át egy terméket
// ===================================================================
//
// ELŐZMÉNY (2026-08-31, élesben megtörtént). A `agents/fact-check/agent.js`
// egy publikált útmutatóban a VALÓDI `ChatRTX` terméknevet átírta „NVIDIA
// Chat"-re, ezzel az indoklással:
//     „NVIDIA ChatRTX has been rebranded to NVIDIA Chat"
// Ez HAMIS. Az nvidia.com-on ma is ChatRTX, „NVIDIA Chat" nulla találat.
// A cikk így AZT ÁLLÍTOTTA, hogy a terméket átnevezték, és a NEM LÉTEZŐ
// névre küldte keresni az olvasót — 10 helyen angolul, 11× magyarul,
// 10× spanyolul.
//
// 🔑 A LÉNYEG: nem az ÍRÓ hallucinált, hanem a TÉNYELLENŐR. Az a szerep,
// amelyik éppen a valótlanságot volna hivatott kiszűrni, írt be kitalált
// terméknevet — és mivel a „javítás" a hitelesség nevében érkezett, semmi
// nem kérdőjelezte meg. A hiedelem MA IS MEGVAN: 2026-09-04-én egy másik
// NVIDIA-cikk audit-mezőjébe megint „rebranded" került (a szöveget akkor
// nem rontotta el). 17 NVIDIA-útmutatónk van — ismétlődhet.
//
// ── HOGYAN JUTOTT KI (mérve, 2026-09-06) ──────────────────────────
// Az agent `applyFix()`-e a `_meta.tool`-hoz HOZZÁ SEM NYÚL: csak
// szétteríti a régi `_meta`-t. A név mégis a chipre és a /tools oldalra
// jutott volna, mert a lánc két lépésből áll:
//   1) a fact-check a modell `fixed_markdown` mezőjét EGÉSZBEN a cikk
//      `article_markdown`-jába írja — és abban ott a YAML frontmatter is,
//      a `title:`, a `company:` és a `tool:` sorral együtt;
//   2) a `core/quality-guard.js` 2b pontja a `_meta.tool`/`_meta.company`
//      mezőt EBBŐL A FRONTMATTERBŐL szinkronizálja
//      (`wantTool = fixedChip(fmTool || d._meta.tool, …)`).
// Vagyis a tényellenőr nem a `_meta`-t írja át, hanem a forrását.
//
// ── MIT CSINÁL EZ A MODUL ─────────────────────────────────────────
// A tényellenőr JAVASLATÁT nézi meg, MIELŐTT a cikkbe kerülne, és négy
// dolgot utasít vissza. VISSZAUTASÍTÁS = a RÉGI cikk marad érintetlenül
// (ugyanaz a bevált minta, mint az agent `isSafeReplacement()`-jénél: az
// oldalon soha nincs lyuk), a kifogás pedig NAPLÓBA megy — onnan a
// `core/quality-guard.js` `qualityFindings()`-én át a napi Telegram-
// jelentésbe. („Az őrszem csak akkor őr, ha odaszól, ahol a user néz.")
//
// ⚠️ AMIT SZÁNDÉKOSAN NEM TILT. A tényellenőr TÖBBI munkája hasznos és
// kell: elavult gombnév, kitalált képernyő-elem, halott URL eltávolítása,
// állítás lágyítása. Ez a kapu KIZÁRÓLAG a cikk cég-/eszköznevére és a
// címére vonatkozik. Egy szűkebb kapu, ami tényleg zárva van, többet ér,
// mint egy tág, amit ki kell kapcsolni.
//
// ⚠️ MIÉRT NEM AZ AGENTBEN VAN. Az `agents/` alól semmit nem lehet
// importálni (25-ből 21 modul a fájl végén feltétel nélkül hívja a
// `main()`-t → a puszta import pénzt költ és publikál), tehát ami ott
// belül van, azt SOHA nem lehet tesztelni. Ez a modul `fs`-en kívül csak
// két saját `core/` modult használ.
//
// ⚠️ EGYIRÁNYÚ FÜGGŐSÉG. Ez a modul importál a `quality-guard.js`-ből —
// a `quality-guard.js` VISZONT NEM importál innen (körkörös lenne:
// quality-guard → name-guard → tool-kinds → quality-guard). Ezért a
// minőség-őr a naplót a SAJÁT, `fs`-es olvasásával nézi meg. A két
// olvasás összetartozását a `core/name-guard.test.js` utolsó esete köti
// meg — az fut le mindkét oldalon.
// ===================================================================

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fm } from './frontmatter.js';
import { canonicalChip } from './quality-guard.js';
import { unclassified } from './tool-kinds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * A napló felső korlátja. Növekvő lista mellé MINDIG kell plafon — ezt a
 * `_redirects` tanította meg (a Cloudflare-limit 83%-án állt, miközben a
 * kód kommentje azt írta, „ez a lista nem nő tovább").
 */
export const NEV_ZAR_MAX = 60;

/**
 * A napló útja. FÜGGVÉNY, nem konstans: a `process.env` felülírását
 * HÍVÁSKOR kell megnézni, különben a teszt-felülírás lekésné a modul
 * betöltését. Élesben nincs beállítva.
 */
export function nevZarUt() {
  return process.env.NAME_GUARD_PATH || join(__dirname, '..', 'memory', 'name-guard.json');
}

const strip = (s) => String(s == null ? '' : s).trim().replace(/^["']+|["']+$/g, '').trim();
/** Kis-nagybetű és többszörös szóköz NEM különbség — ember és AI is ír ide. */
const norm = (s) => strip(s).replace(/\s+/g, ' ').toLowerCase();

/**
 * A cikk DEKLARÁLT cég- és eszközneve.
 *
 * A sorrend SZÁNDÉKOSAN ugyanaz, amit a `core/quality-guard.js` 2b pontja
 * használ a `_meta` szinkronizálásakor: a FRONTMATTER az elsődleges, a
 * `_meta` a tartalék. Épp ezen a soron keresztül jutott volna ki a kitalált
 * név a chipre — tehát a kapunak is ezt kell mérnie, nem valami mást.
 *
 * Az eszköznév a `canonicalChip`-en megy át, hogy a „NVIDIA ChatRTX" és a
 * „ChatRTX" NE látsszon átnevezésnek: a chipen sem változtat semmit.
 *
 * @param {string} markdown
 * @param {object} [meta] a cikk `_meta` mezője
 * @returns {{tool: string, company: string}} sosem undefined
 */
export function declaredNames(markdown, meta) {
  const md = String(markdown == null ? '' : markdown);
  const m = meta && typeof meta === 'object' ? meta : {};
  const company = strip(fm(md, 'company')) || strip(m.company);
  const tool = canonicalChip(strip(fm(md, 'tool')) || strip(m.tool), company);
  return { tool: strip(tool), company };
}

/**
 * ELŐZETES regiszter-ellenőrzés: a megadott nevek közül melyiknek NINCS
 * kimondott besorolása a `core/tool-kinds.js`-ben?
 *
 * A `core/tool-kinds.test.js` ugyanezt kérdezi — csak AZUTÁN, hogy a név
 * már bent van egy megjelent cikkben. Ez az előre hozott változat: a
 * javaslat pillanatában kérdez, amikor még vissza lehet utasítani.
 * (2026-08-31-én a csapda MŰKÖDÖTT, de a CI nem futtat teszteket, így öt
 * napig pirosan állt, és senki nem hallotta.)
 *
 * @param {string[]} names
 * @returns {string[]} a besorolatlanok, ábécésorrendben, egyszer-egyszer
 */
export function unregisteredNames(names) {
  return unclassified(names);
}

/** A markdown TÖRZSE — a frontmatter nélkül. */
function torzs(md) {
  const s = String(md == null ? '' : md);
  const m = s.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? s.slice(m[0].length) : s;
}

/** Hányszor szerepel a név a szövegben? Kis-nagybetűre érzéketlen. */
function elofordulas(szoveg, nev) {
  const n = strip(nev);
  if (!n) return 0;
  const rx = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return (String(szoveg || '').match(rx) || []).length;
}

/**
 * Kifogás-objektum. A `kod` azért kétféle, mert a NAPLÓBÓL látszania kell,
 * mi történt: kitalált nevet írt be a modell, vagy egy létező termékre
 * cserélte a cikk tárgyát. A kettő más baj, más emberi lépéssel.
 */
function kifogas(kod, mezo, regi, uj, indok) {
  return { kod, mezo, regi, uj, indok, at: new Date().toISOString() };
}

/**
 * A NÉV-ZÁR. Elfogadható-e a tényellenőr javaslata NÉVHASZNÁLAT szerint?
 *
 * Négy visszautasítási ok, EBBEN a sorrendben (az első nyer):
 *   NEV_ATIRVA     — a deklarált `tool`/`company` más lett; a cél-név
 *                    szerepel a regiszterben. Akkor is tilos: a cikk
 *                    tárgyát nem a tényellenőr dönti el.
 *   ISMERETLEN_NEV — ugyanaz, de a cél-név a `tool-kinds` regiszterében
 *                    SINCS BENNE. Ez a 08-31-i eset: „NVIDIA Chat".
 *   NEV_ELTUNT     — a frontmatter érintetlen, de a termék saját neve a
 *                    TÖRZSBŐL teljesen eltűnt (2+ előfordulásból 0). A chip
 *                    helyes maradna, a szöveg mégis hazudna.
 *   CIM_ATNEVEZVE  — a cím elveszítette a terméknevet. A cím hajtja a
 *                    /guides listát és a keresőt: ott ugyanúgy kiül.
 *
 * IRÁNY-SZABÁLY (a „minden mérce IRÁNYA számít" lecke): az eltűnés-kapu a
 * TÖMEGES átírásra van élezve. EGYETLEN, mellékes említés eltávolítása
 * lehet jogos lágyítás — ott a frontmatter-zár őriz tovább.
 *
 * @param {string} eredetiMarkdown a MOST kint lévő cikk szövege
 * @param {string} javasoltMarkdown amit a tényellenőr be akar írni
 * @param {object} [meta] a cikk `_meta` mezője
 * @returns {null|{kod:string, mezo:string, regi:string, uj:string, indok:string, at:string}}
 *          null = nincs kifogás, a javítás mehet tovább
 */
export function nameLockObjection(eredetiMarkdown, javasoltMarkdown, meta) {
  const eredeti = String(eredetiMarkdown == null ? '' : eredetiMarkdown);
  const javasolt = String(javasoltMarkdown == null ? '' : javasoltMarkdown);
  // Nincs mit összehasonlítani → nincs kifogás. A hiányzó javított szöveget
  // az agent `isSafeReplacement()`-je amúgy is elutasítja.
  if (!eredeti.trim() || !javasolt.trim()) return null;

  const elotte = declaredNames(eredeti, meta);
  const utana = declaredNames(javasolt, meta);

  // 1) DEKLARÁLT NÉV ÁTÍRÁSA — ez a fő zár.
  for (const mezo of ['tool', 'company']) {
    const regi = elotte[mezo], uj = utana[mezo];
    if (norm(regi) === norm(uj)) continue;
    const ismeretlen = uj && unregisteredNames([uj]).length > 0;
    return kifogas(
      ismeretlen ? 'ISMERETLEN_NEV' : 'NEV_ATIRVA', mezo, regi, uj,
      `a tény-ellenőrző át akarta nevezni a(z) ${mezo} mezőt: "${regi || '(üres)'}" → "${uj || '(üres)'}"`
      + (ismeretlen ? ' — ez a név a core/tool-kinds.js regiszterében SINCS BENNE' : '')
      + ' — VISSZAUTASÍTVA, a cikk neve marad'
    );
  }

  // 2) A TERMÉK SAJÁT NEVE ELTŰNT A TÖRZSBŐL.
  const nev = elotte.tool;
  if (nev) {
    const volt = elofordulas(torzs(eredeti), nev);
    if (volt >= 2 && elofordulas(torzs(javasolt), nev) === 0) {
      return kifogas('NEV_ELTUNT', 'article_markdown', nev, '(eltűnt)',
        `a tény-ellenőrző a cikk törzséből MINDEN "${nev}" említést eltávolított (${volt} volt)`
        + ' — VISSZAUTASÍTVA, a cikk neve marad');
    }
  }

  // 3) A CÍM ELVESZÍTETTE A TERMÉKNEVET.
  if (nev) {
    const regiCim = fm(eredeti, 'title'), ujCim = fm(javasolt, 'title');
    if (regiCim && ujCim && elofordulas(regiCim, nev) > 0 && elofordulas(ujCim, nev) === 0) {
      return kifogas('CIM_ATNEVEZVE', 'title', regiCim, ujCim,
        `a tény-ellenőrző kivette a "${nev}" nevet a címből: "${ujCim}"`
        + ' — VISSZAUTASÍTVA, a cikk neve marad');
    }
  }

  return null;
}

/**
 * A kifogás naplóba. SOHA nem dob: egy őr hibája nem akaszthatja meg az
 * agentet — ez a kapu a cikket védi, nem a futást.
 *
 * @param {object} bejegyzes a `nameLockObjection()` kifogása + `file`, `reason`
 * @param {string} [ut]
 * @returns {boolean} sikerült-e naplózni
 */
export function jegyezNevZar(bejegyzes, ut = nevZarUt()) {
  try {
    if (!bejegyzes || typeof bejegyzes !== 'object' || !bejegyzes.kod) return false;
    let log = { entries: [] };
    try {
      const be = JSON.parse(readFileSync(ut, 'utf-8'));
      if (Array.isArray(be?.entries)) log = be;
    } catch { /* első alkalom vagy sérült napló — újrakezdjük */ }
    log.entries.push({ at: new Date().toISOString(), ...bejegyzes });
    if (log.entries.length > NEV_ZAR_MAX) log.entries = log.entries.slice(-NEV_ZAR_MAX);
    writeFileSync(ut, JSON.stringify(log, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * A MAI kifogások, a minőség-őr találat-formájában.
 *
 * Csak a mai nap: a napi jelentés MAI hírt mond. („A napi riport számai" —
 * a lecke élettartamának összegzése egyszer már félrevezetett.) Csendes
 * napon üres lista, hogy ne zajongjunk.
 *
 * @param {string} [ut]
 * @returns {string[]}
 */
export function nevZarTalalatok(ut = nevZarUt()) {
  try {
    const log = JSON.parse(readFileSync(ut, 'utf-8'));
    const ma = new Date().toISOString().slice(0, 10);
    return (log?.entries || [])
      .filter(e => String(e?.at || '').slice(0, 10) === ma)
      .map(e => `NÉV-ZÁR: ${e.indok}`
        + (e.file ? ` (${String(e.file).replace(/^ARTICLE_(GUIDE_)?/, '').replace(/\.json$/, '').slice(0, 45)})` : ''));
  } catch { return []; }   // nincs napló = nem volt kifogás
}

export default {
  NEV_ZAR_MAX, nevZarUt, declaredNames, unregisteredNames,
  nameLockObjection, jegyezNevZar, nevZarTalalatok
};
