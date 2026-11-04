// ===================================================================
// ISMÉTLÉS-ŐR — írtunk-e már erről?
// ===================================================================
//
// ELŐZMÉNY (2026-08-25, a user vette észre): „van cikk agent több cikkben
// is szerepel". Mérve: 797 cikkből 4-5% ismétel egy korábbit — hír 18/439,
// útmutató 18/358. A gyökérok: a hír-íróban EGYÁLTALÁN nem volt ismétlés-
// ellenőrzés, az útmutató-őr referenciája meg csak MÁS ÚTMUTATÓ volt.
//
// ⚠️ EZ NEM AZ ÖSSZEVONÁS. A `core/cluster-runner.js` azt nézi, hogy EGY
// FUTÁSON BELÜL két hír ugyanarról szól-e (órák). Ez itt HETEKBEN mérhető
// ismétlés. A kettő kívülről egyformán néz ki: „két cikk ugyanarról".
//
// ── AZ IRÁNY ITT DÖNTŐ ──────────────────────────────────────────────
// A hír romlandó, és ugyanarról a témáról egy valódi FEJLEMÉNY jogos hír:
//     08-11  „ChatGPT Is Testing Ads"
//     08-19  „ChatGPT Ads Are Expanding Across Europe"
// Túl szigorú kapu pont ezeket némítaná el. Ezért a hasonlóság ELŐTT három
// kizárás fut, mind a SAJÁT METAADATUNKBÓL — nem találgatásból.
//
// MÉRVE 42 kézzel osztályozott páron (13 valódi ismétlés, 29 jogos):
//     a három kizárás a 29 jogosból 15-öt kiejt, a 13 ismétlésből EGYET SEM
//     utána cosine 0.92 → 12/12 ismétlés elkapva, 2 hamis riasztás 14-ből
//
//     küszöb   fog (12-ből)   hamis riasztás (14-ből)
//      0.88         12                  7
//      0.90         12                  4
//      0.92         12                  2      ← ez
//      0.94          8                  0
// ===================================================================

/** A 42 páron mért küszöb. Egy helyen él, hogy ne csússzon szét. */
export const REPEAT_COSINE = 0.92;

const sz = (x) => String(x == null ? '' : x).trim();

/**
 * Heti összefoglaló-e?
 *
 * ⚠️ MIÉRT KELL EZ: a digest címe SZÁNDÉKOSAN mindig ugyanaz, csak a dátum
 * más. Mérve: a beágyazás 0.989-et adott két digestre — a LEGMAGASABB
 * pontszámot az egész halmazban. Kizárás nélkül minden héten elnémítanánk
 * a saját összefoglalónkat.
 *
 * A minta SZŰK: a „This Week in AI" a mi rögzített sorozatcímünk. Egy cikk,
 * ami csak említi, hogy „this week", NEM digest.
 */
export function isDigest(c) {
  const o = c || {};
  return /this-week-in-ai|^weekly-/.test(sz(o.slug).toLowerCase())
    || /^this week in ai\b/i.test(sz(o.cim));
}

/**
 * Kizárja-e valami a két cikket az ismétlés-vizsgálat alól?
 *
 * @param {object} [opts]
 * @param {boolean} [opts.pairing=true]  vegyük-e figyelembe a szándékos
 *        hír+útmutató párosítást
 *
 * ⚠️ A HÍR-ÍRÓ `pairing: false`-szal hívja, és ez MÉRÉSEN alapul. A hír
 * ELŐBB születik, mint a hozzá írt útmutató, tehát visszafelé mutató
 * párosítás ott nem jelent semmit — csak elfedi a valódi ismétlést:
 *
 *     hír-jelölt esetén   párosítás-kizárással:  8/9 elkapva, 2 hamis
 *                         kizárás NÉLKÜL:        9/9 elkapva, 2 hamis
 *
 * ÉS EGY KÜLÖN LELET (2026-08-25): a szándékos párosítás MAGA IS termelhet
 * duplikátumot, ha a hír már eleve „hogyan"-cikk. Példa: a
 * „How to Build a Custom GPT… Step-by-Step" HÍRHEZ írt útmutató a
 * „Create Your Own Custom GPT…" lett — 0.942 hasonlóság. A Picsart-párosnál
 * ugyanez rendben van (a hír BEJELENT, az útmutató TANÍT). A kettőt a cím
 * hasonlósága nem választja el (0.933 vs 0.942) — ez a párosító agent
 * oldalán megoldandó feladat, nem itt.
 *
 * @returns {string|null} a kizárás oka (riportba való), vagy null
 */
export function kizart(a, b, opts = {}) {
  const { pairing = true } = opts;
  const x = a || {}, y = b || {};

  if (isDigest(x) || isDigest(y)) return 'heti összefoglaló';

  // ELTÉRŐ ESZKÖZ: „…with DeepSeek" / „…with Grok" / „…with Qwen" — ez
  // szándékos, a /tools oldal erre épül.
  //
  // ⚠️ CSAK AKKOR KIZÁRÁS, HA MINDKETTŐ KI VAN TÖLTVE. A hiányzó mezőből
  // NEM következik, hogy más eszközről szól — a „nem tudom" nem lehet
  // „nem". (Ugyanaz az elv, mint a beágyazás null-jánál.)
  const ta = sz(x.tool).toLowerCase(), tb = sz(y.tool).toLowerCase();
  if (ta && tb && ta !== tb) return 'eltérő eszköz';

  // SZÁNDÉKOS HÍR+ÚTMUTATÓ PÁROS: a párosító agent írja az útmutatót egy
  // híshez, és a `_meta.source_news` RÖGZÍTI a kapcsolatot.
  if (pairing && (parosak(x, y) || parosak(y, x))) return 'szándékos hír+útmutató páros';

  return null;
}

/**
 * A `source_news` a FORRÁS-CIKK FÁJLNEVÉT hordozza, nem a slugját:
 *     { file: "ARTICLE_2026-08-14T01-01-38-197Z_picsart_Picsart_AI_...json",
 *       title: "Picsart AI Playground is now on desktop for Mac and Windows" }
 *
 * ⚠️ A `title` az EREDETI forrás-cím, nem a mi átírt címünk — arra hasonlítani
 * nem szabad („Picsart AI Playground is now on desktop" vs a mi „Picsart Brings
 * Its AI Playground to Your Desktop" címünk). A `file` a pontos hivatkozás.
 * Régebbi cikkeknél a mező sima szöveg is lehet, ezért mindkettőt kezeljük.
 */
function parosak(x, y) {
  const s = x.source_news;
  if (!s) return false;
  const cel = [sz(y.file), sz(y.slug)].filter(Boolean);
  if (typeof s === 'string') return !!sz(s) && cel.includes(sz(s));
  return !!sz(s.file) && cel.includes(sz(s.file));
}

export default { REPEAT_COSINE, isDigest, kizart };
