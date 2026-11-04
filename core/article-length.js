// ===================================================================
// CIKKHOSSZ — EGY HELYEN, mert tíz helyen szétcsúszott
// ===================================================================
//
// ELŐZMÉNY (2026-08-16, mérve): a hosszúság-előírás TÍZ élő helyen szerepelt,
// KÉT különböző értékkel (700–1100 és 700–1200), és a rendszer EGYIKET SEM
// tartotta: a "How to" útmutatók 95%-a a felső határ fölött volt, medián 1475 szó.
//
// AZ OK NEM AZ ÍRÓ VOLT. Ugyanaz a szabálygyűjtemény kért 700–1200 szót ÉS
// 5–7 perc olvasási időt — az utóbbi 200 szó/perccel 1000–1400 szó. A két cél
// nem fér össze; az író az OLVASÁSI IDŐT teljesítette (1475 ≈ 7,4 perc).
// Vagyis nem elszaladt, hanem választott — csak nem tudtuk, hogy választania kell.
//
// A FELOLDÁS: az olvasási idő a mérce (az az olvasó élménye, nem a szószám),
// és a szószám ehhez igazodik. 1000–1400 szó ≈ 5–7 perc.
//
// ⚠️ MIÉRT NEM VETTE ÉSZRE SENKI: a kapu CSAK LEFELÉ őrzött. A HOWTO_TOO_THIN
// a 600 szó alattit fogta, a felső határt SEMMI. Ugyanaz az alak, mint a
// 08-14-i prompt-szivárgásnál: **minden mérce IRÁNYA számít** — ott is a
// fölösleg irányából jött a hiba, és ott is mind a három kapu átengedte.
//
// A KAPU LAZÁBB, MINT A CÉL — szándékosan, a meglévő minta szerint (a szabály
// alja 700, a kapu 600-nál fog). A cél az írónak szól, a kapu a kirívót fogja.
// ===================================================================

/** Az ÍRÓNAK szóló cél: lépéseket ígérő cikk (How to…, Set up…, …). */
export const HOWTO_MIN = 1000;
export const HOWTO_MAX = 1400;

/** A KAPU határai — a célnál lazábbak, csak a kirívót jelzik. */
export const GATE_MIN = 600;
export const GATE_MAX = 1700;

/** ~200 szó/perc: ebből jön az 5–7 perces olvasási idő. */
export const WORDS_PER_MINUTE = 200;

/** Promptokba illeszthető szöveg — így a szám EGY helyen él. */
export const HOWTO_RANGE = `${HOWTO_MIN}-${HOWTO_MAX}`;
export const HOWTO_RANGE_TEXT =
  `${HOWTO_MIN}-${HOWTO_MAX} words (about ${Math.round(HOWTO_MIN / WORDS_PER_MINUTE)}-${Math.round(HOWTO_MAX / WORDS_PER_MINUTE)} minutes to read)`;

/** Percben, olvasásra. */
export function readingMinutes(wordCount) {
  const n = Number(wordCount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / WORDS_PER_MINUTE;
}

/**
 * Kifogásolható-e a hossz? A KAPU határaival dolgozik, nem a céllal.
 *
 * @param {number} wordCount
 * @returns {{code:'TOO_THIN'|'TOO_LONG', wordCount:number, minutes:number}|null}
 */
export function lengthIssue(wordCount) {
  const n = Number(wordCount);
  if (!Number.isFinite(n) || n <= 0) return null;      // nem tudjuk — nem állítunk
  if (n < GATE_MIN) return { code: 'TOO_THIN', wordCount: n, minutes: readingMinutes(n) };
  if (n > GATE_MAX) return { code: 'TOO_LONG', wordCount: n, minutes: readingMinutes(n) };
  return null;
}

export default {
  HOWTO_MIN, HOWTO_MAX, GATE_MIN, GATE_MAX, WORDS_PER_MINUTE,
  HOWTO_RANGE, HOWTO_RANGE_TEXT, readingMinutes, lengthIssue
};
