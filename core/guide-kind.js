// ===================================================================
// „ÚTMUTATÓ-E EZ A CIKK?" — EGY HELYEN
// ===================================================================
//
// ELŐZMÉNY (2026-09-16, párhuzamos-megvalósítás audit). Ugyanerre az EGY
// kérdésre HÁROM különböző szabály élt, 11 helyen, egymástól függetlenül:
//
//   A) `_meta.type === 'guide' || frontmatter.category === 'guide'`
//        website/build.js (isGuide mező) · core/tool-kinds.js (scanGuideToolNames)
//   B) `_meta.type === 'guide' || fájlnév.startsWith('ARTICLE_GUIDE')`
//        core/social-published.js · core/daily-report.js · core/housekeeping.js
//        core/image-guard.js
//   C) `_meta.type === 'guide'` — egyedül
//        core/reel-post.js · core/quality-guard.js (2 hely) ·
//        core/daily-report.js (2. hely) · core/topic-dedup.js · core/ebook-build.js
//
// ⚠️ A C) CSOPORT FELÉT CSAK A MÁSODIK KERESÉS TALÁLTA MEG, mert TAGADÓ
// alakban volt megírva (`type !== 'guide'` → `continue`). Az első mintám csak
// `=== 'guide'`-ot keresett, és így NÉGY hívót átengedett — köztük a fizetős
// PDF-csomagét és a téma-ismétlés-őrét. Harmadszor fogott meg ugyanaz az
// alak: **minden mérce IRÁNYA számít** (08-14 prompt-szivárgás, 08-16
// hossz-kapu). A core/guide-kind.test.js másolat-keresője ezért `[!=]==`.
//
// MÉRVE A VALÓDI ADATON (986 élő cikk, content/articles, 2026-09-16):
//   • mind a három szabály UGYANAZT a 441 cikket mondja útmutatónak,
//   • ELTÉRŐEN BESOROLT CIKK: **0**,
//   • sőt a három jel egyenként is 100%-ban redundáns:
//       - `type=guide`, de nincs `_GUIDE` a fájlnévben:      0
//       - `type=guide`, de `fm.category != guide`:           0
//       - `_GUIDE` fájlnév, de `type != guide`:              0
//       - `fm.category=guide`, de `type != guide`:           0
//     (ugyanez a content/rejected és a content/withdrawn alatt is).
//
// 🔑 EZÉRT SZÜLETETT EZ A MODUL. A „0 eltérés" NEM azt jelenti, hogy nincs
// baj — azt jelenti, hogy **ma még egyezik, de SEMMI nem őrzi**. Pontosan ez
// volt a két cikk-sablon helyzete is, ahol NÉGYSZER került javítás csak az
// egyik példányba. Egy elmaradt `_meta.type` (pl. egy új publikáló út, ahogy
// a CEO-felülbírálás a slugot elfelejtette — lásd core/publish-meta.js) a
// C) szabály szerint HÍRRÉ minősítene egy útmutatót, és akkor:
//   • a Házmester 90 nap után TÖRÖLNÉ (isEvergreen → false),
//   • a build hír-sablonnal renderelné,
//   • a poszter-sor hátralék-helye (csak útmutató) kihagyná.
//   • a fizetős PDF-csomagból (core/ebook-build.js) kimaradna,
//   • a téma-ismétlés-őr (core/topic-dedup.js) nem látná a címét, és
//     ugyanarról írnánk még egyszer.
// Visszafordíthatatlan kár, néma úton.
//
// A DÖNTÉS: az EGYESÍTÉS (bármelyik jel elég), nem a metszet.
// ⚠️ A MÉRCE IRÁNYA SZÁMÍT (08-14, prompt-szivárgás; 08-16, hossz-kapu). Itt a
// két irány nem egyenrangú:
//   • ha egy HÍRT tévedésből útmutatónak veszünk → örökzöld marad, azaz a
//     legrosszabb eset egy fölöslegesen megőrzött cikk;
//   • ha egy ÚTMUTATÓT tévedésből hírnek veszünk → 90 nap múlva TÖRÖLJÜK.
// Aszimmetrikus kockázat → a megengedőbb irány a helyes. Ezért `||`, nem `&&`.
//
// A modul SEMMIT nem olvas lemezről és semmit nem ír: a hívó adja be a
// fájlnevet és a már beolvasott cikk-JSON-t. Így szabadon tesztelhető, és
// nem tud kört képezni egyik `core/` modullal sem (semmit nem importál).
//
// -------------------------------------------------------------------
// AMI SZÁNDÉKOSAN KÜLÖN MARADT — és miért
// -------------------------------------------------------------------
//  1. `core/reel-queue.js` (`c.type === 'guide'`). Nem osztályoz: MÁR
//     NORMALIZÁLT mezőt kap a `core/reel-post.js`-től, ami ezt a függvényt
//     hívja. Se fájlnév, se markdown nincs a kezében — a három jelből kettőt
//     meg sem tudna nézni. A bekötés itt nem pontosítana, csak egy negyedik
//     kérdés-alakot szülne.
//
//  2. Az `agents/` alatti 29 hely. Ezek NEM a megjelent cikket osztályozzák,
//     hanem a CSŐVEZETÉKBEN lévő vázlatot (`WRITER_*`, `REJECTED_*`), ahol a
//     `_meta.type` az EGYETLEN létező jel: a végleges `ARTICLE_GUIDE_*` nevet
//     a publikálás adja, a frontmatter `category:` sorát pedig maga az író
//     írja meg — tehát a másik két jel ott még nem is létezhet. Ugyanaz a
//     szó, más kérdés. ⚠️ Ezt NEM ellenőriztem egyesével mind a 29 helyen,
//     és az `agents/` futtatása/importálása tilos (pénzt költene és
//     publikálna), ezért a besorolás DOKUMENTÁLT FELTÉTELEZÉS, nem mérés.
//     Aki hozzányúl: a `content/articles`-t OLVASÓ agent-helyek (pl.
//     `agents/ceo/instruct.js`, `agents/designer/agent.js`,
//     `agents/social/agent.js`) valódi jelöltek a bekötésre.
//
//  3. `agents/ellenorzo/agent.js` `promisesSteps` (cím-regex: „How to…",
//     „Step-by-step…"). Ez MÁS KÉRDÉS: nem az, hogy útmutató-e a cikk, hanem
//     hogy a CÍM ígér-e lépéseket (ÍGÉRET-FEDEZET, 2026-07-27). Kimérve: az
//     útmutatóknak csak 32%-a esik a regexbe. A kettő SZÁNDÉKOSAN nem
//     ugyanaz, és a hossz-kapu köre a KETTŐ EGYESÍTÉSE — összevonni hiba
//     lenne.
// ===================================================================

/**
 * A FÁJLNÉV-JEL mintája.
 *
 * A publikált útmutató neve `ARTICLE_GUIDE_<guide_topic_id>.json` — ez volt
 * az eredeti, B) szabály szerinti minta. A csővezeték korábbi állomásain
 * ugyanaz a cikk `WRITER_GUIDE_*`, `DRAFT_GUIDE_*`, illetve elutasítva
 * `REJECTED_GUIDE_*` néven él (lásd content/rejected, content/withdrawn),
 * ezért a minta MINDEGYIKET felismeri — hogy ne szülessen negyedik példány,
 * amikor valaki a vázlatokra is felteszi ugyanezt a kérdést.
 *
 * ⚠️ KIMÉRVE, hogy ez a tágítás SEMMIT nem változtat: a négy tartalom-mappa
 * egyetlen fájljánál sem dönt a fájlnév EGYEDÜL (prefix-de-nincs-type: 0).
 * A hír-fájlok neve `ARTICLE_<időbélyeg>_<forrás>_<cím>.json`, tehát a
 * `_GUIDE` szótag a nevük elején nem fordulhat elő.
 */
const FAJLNEV_RX = /^(?:ARTICLE|WRITER|DRAFT|REJECTED)_GUIDE/;

/**
 * A markdown frontmatteréből a `category:` érték.
 *
 * ⚠️ MIÉRT CRLF-TŰRŐ. A két korábbi olvasó eltért: a website/build.js
 * `parseFrontmatter`-e CSAK `\n`-t fogadott el (`/^---\n/`), a
 * core/tool-kinds.js `frontmatterOf`-ja `\r?\n`-t. Ma ez nem számít (a 986
 * cikkből egyiknek sincs CRLF-es frontmattere — kimérve, a két olvasó
 * ugyanazt a 441-et adta), de a szűkebb minta egy Windowson szerkesztett
 * cikknél NÉMÁN „hír"-t mondana. A megengedőbb változatot visszük tovább,
 * összhangban a fenti aszimmetrikus kockázattal.
 *
 * A záró `---` utáni tartalom itt nem érdekes, ezért nem is követeljük meg —
 * a csonka frontmatterből is ki tudjuk olvasni a kategóriát.
 */
function fmKategoria(markdown) {
  const m = String(markdown == null ? '' : markdown).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return '';
  for (const sor of m[1].split(/\r?\n/)) {
    const kv = sor.match(/^category:\s*(.*)$/);
    if (kv) return kv[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

/**
 * A három jel KÜLÖN-KÜLÖN — diagnózishoz és teszthez.
 *
 * Azért van kivezetve, hogy ha egyszer MÉGIS szétcsúsznak (mert egy új
 * publikáló út elfelejt egy mezőt), az eltérés MÉRHETŐ legyen, ne csak
 * sejthető. A „0 eltérés" állítást csak így lehet újra ellenőrizni.
 *
 * @param {string} fajlnev  a cikk fájlneve (útvonal nélkül)
 * @param {object} cikk     a beolvasott cikk-JSON (`{_meta, article_markdown}`)
 * @returns {{type:boolean, fajlnev:boolean, kategoria:boolean}}
 */
export function utmutatoJelek(fajlnev, cikk) {
  const meta = (cikk && cikk._meta) || {};
  return {
    type: meta.type === 'guide',
    fajlnev: FAJLNEV_RX.test(String(fajlnev == null ? '' : fajlnev)),
    kategoria: fmKategoria(cikk && cikk.article_markdown) === 'guide'
  };
}

/**
 * ÚTMUTATÓ-E? — a projekt EGYETLEN válasza erre a kérdésre.
 *
 * Bármelyik jel elég (lásd a fejléc „a mérce iránya" szakaszát).
 *
 * @param {string} fajlnev  a cikk fájlneve; ha a hívónak nincs, adjon `''`-t —
 *                          akkor a másik két jel dönt, hibázni nem fog
 * @param {object} cikk     a beolvasott cikk-JSON
 * @returns {boolean}
 */
export function utmutatoE(fajlnev, cikk) {
  const j = utmutatoJelek(fajlnev, cikk);
  return j.type || j.fajlnev || j.kategoria;
}

export default { utmutatoE, utmutatoJelek };
