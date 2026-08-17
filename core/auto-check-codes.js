// ===================================================================
// AUTO-KAPU KÓDOK — EGY HELYEN, mert három fájlban szétcsúsztak
// ===================================================================
//
// ELŐZMÉNY (2026-08-16, kódellenőrzés): az a tudás, hogy "melyik jelzés
// utasít el", KÉT helyen élt, egymástól függetlenül:
//
//   • agents/ellenorzo/agent.js — négy kód nevesítve (NO_FRONTMATTER,
//     NO_H1, MISSING_SECTION, GUIDE_TOO_SHORT) → csak ezek buktatnak;
//   • agents/iro/agent.js és agents/guide/agent.js — `!issues.length`,
//     vagyis BÁRMELY jelzést komoly bajnak vett.
//
// Amíg MINDEN jelzés kritikus volt, a kettő egyetértett, és a különbség
// láthatatlan maradt. Az első NEM kritikus jelzés (HOWTO_TOO_LONG,
// OPENING_REPETITIVE — 2026-08-16) visszamenőleg elrontotta a feltevést:
// az `isReviewerSideFailure()` `autoOk`-ja hamisra billent, így a bíró
// JSON-hibája után az INGYENES, változatlan visszasorolás helyett
// FIZETŐS AI-újraírás indult — pont a fordítottja annak, amit a jelzés
// szánt ("nem indít fizetős újraírást").
//
// ⚠️ AZ ALAK, AMIT ÉRDEMES MEGJEGYEZNI: nem elírás volt, hanem egy
// IMPLICIT FELTEVÉS (“auto-hiba = komoly baj”), ami három fájllal arrébb
// élt, mint ahol megdőlt. Ugyanaz a minta, mint a core/article-length.js
// tíz kimásolt szószámánál. Ezért él ez EGY helyen, és mindenki innen
// kérdezi — nem mindenki maga dönti el újra.
// ===================================================================

import { HOWTO_RANGE } from './article-length.js';

/**
 * Ezek a kódok AZONNAL elutasítanak, AI-hívás nélkül.
 * Minden más jelzés TANÁCSADÓ: nem buktat, nem indít fizetős újraírást,
 * csak leckét ír a következő íráshoz.
 */
// ⚠️ A 2026-08-17-i HÁROM ÚJ JELZÉS (UI_CLAIMS_UNSOURCED, PRICE_CLAIM_UNSOURCED,
// ACCESS_NOT_SELF_SERVE) SZÁNDÉKOSAN NINCS ITT. A user szabálya erre az
// osztályra: „tanuljon, de ne utasítson el" — a forrás nélküli felület-leírás
// nem szerkezeti hiba, hanem szokás, és a szokást lecke javítja, nem elutasítás.
// Az elutasítás FIZETŐS újraírást indít; egy 19%-on tüzelő kapu havonta több
// tucat ilyet hozna. Aki ezt a listát bővíteni akarja velük, előbb számolja ki
// az árát.
export const BLOCKING_CODES = Object.freeze([
  'NO_FRONTMATTER',
  'NO_H1',
  'MISSING_SECTION',
  'GUIDE_TOO_SHORT'
]);

/** A "KÓD: emberi szöveg" alakú jelzésből a puszta kód. */
export function issueCode(issue) {
  const s = String(issue == null ? '' : issue).trim();
  const i = s.indexOf(':');
  return (i > 0 ? s.slice(0, i) : s).trim();
}

/** Elutasít-e ez a jelzés? */
export function isBlocking(issue) {
  return BLOCKING_CODES.includes(issueCode(issue));
}

/** Csak az elutasító jelzések. */
export function blockingIssues(issues) {
  return (Array.isArray(issues) ? issues : []).filter(isBlocking);
}

/** Csak a tanácsadó (nem elutasító) jelzések. */
export function advisoryIssues(issues) {
  return (Array.isArray(issues) ? issues : []).filter(i => !isBlocking(i));
}

// ===================================================================
// LECKE-SZÖVEGEK — STABILAK, mert a memória ISMÉTLŐDÉSRE erősödik
// ===================================================================
// A lecke az ÍRÓ PROMPTJÁBA kerül vissza, ezért ANGOL.
//
// ⚠️ MIÉRT NINCS BENNE A KONKRÉT SZÁM: a recordLesson eddig a puszta
// kódot mentette (`MISSING_SECTION`), ami az írónak semmit nem mond. A
// kézenfekvő javítás — mentsük az egész jelzést — viszont ELRONTANÁ a
// memóriát: a "1823 szó" minden cikknél más, tehát minden elutasítás ÚJ
// emléket hozna létre ahelyett, hogy a meglévőt erősítené. (Ugyanez a
// csapda vitte be korábban a "JSON parse error at position 237" sorokat
// accessCount 305-tel.)
// Ezért: a jelzés VÁLTOZÓ része a naplóé, a lecke ÁLLANDÓ és tanítható.
const LESSON_TEXT = Object.freeze({
  HOWTO_TOO_LONG:
    `The guide ran past the length target (${HOWTO_RANGE} words, about 5-7 minutes to read). `
    + 'Cut background, repetition and warm-up — never the steps. The reader is on a phone.',
  HOWTO_TOO_THIN:
    `The title promised steps but the article was too thin (target ${HOWTO_RANGE} words). `
    + 'Give each step its own section with what to tap, what to expect, and what to do if the screen differs.',
  HOWTO_NO_STEPS:
    'The title promised steps but the article was one merged block. '
    + 'Use 4-6 numbered sections ("## Step 1 — …"), each doing exactly one thing.',
  OPENING_REPETITIVE:
    'Recent articles keep opening the same way. Start differently — with a question, '
    + 'a concrete fact, or a specific situation. Do not reach for a stock opening formula.',
  // ---------------------------------------------------------------
  // 2026-08-17 — a FORRÁS NÉLKÜLI ÚTMUTATÓ három leckéje.
  // A szöveg SZÁM NÉLKÜL van megírva (nincs benne "4 felirat", "$10"),
  // hogy két különböző cikk UGYANAZT az emléket erősítse, ne kettőt hozzon
  // létre. A konkrét felirat/összeg a jelzésben és a naplóban marad.
  // ---------------------------------------------------------------
  UI_CLAIMS_UNSOURCED:
    'The guide stated specific on-screen labels as hard fact, but it was written with no source, '
    + 'so nothing could check them. Open the official page and read the interface, or write it the honest way: '
    + '"if you do not see X, look for …". Never name a button you have not seen.',
  PRICE_CLAIM_UNSOURCED:
    'A guide named a price for a tool. Guides are evergreen but prices are not: trials end, plans are '
    + 'retired, amounts move — and nobody comes back to correct the sentence. Do not print the number at all. '
    + 'Name the plan and send the reader to the official pricing page instead. Two real failures: one guide '
    + 'promised a free trial that had not existed for years, another told readers to buy a product that had '
    + 'already been discontinued.',
  ACCESS_NOT_SELF_SERVE:
    'The guide needed company, IT or enterprise access that our reader does not have. We write for everyday people: '
    + 'if a tool has to be switched on by an employer, say so in the opening lines — or pick a tool the reader can '
    + 'sign up for alone.',
  TOO_SHORT:
    'The article was too short to be useful. Add a concrete example or a worked-through case, not filler.',
  TOO_LONG:
    'The article was long enough to need splitting. Keep one article to one job.',
  CLICHE:
    'A banned cliche appeared ("game changer", "in today\'s fast-paced world", …). '
    + 'Say the specific thing that actually happened instead.',
  BRITISH_SPELLING_NAME:
    'A capitalised British spelling appeared. Use US spelling for ordinary words; '
    + 'keep the British form only inside a genuine proper name.',
  GUIDE_TOO_SHORT:
    `The guide was far below the length target (${HOWTO_RANGE} words) and could not teach a beginner.`,
  MISSING_SECTION:
    'A required section was missing ("What this means for you" / wrap-up). '
    + 'The reader must always leave with a next step.',
  NO_H1: 'The article had no H1 title line.',
  NO_FRONTMATTER: 'The article did not start with YAML frontmatter.'
});

/**
 * Tanítható lecke egy jelzésből — ÁLLANDÓ szöveg, szám nélkül.
 * Ismeretlen kódra a kód marad (a régi viselkedés), hogy semmi ne vesszen el.
 */
export function lessonFor(issue) {
  const code = issueCode(issue);
  return LESSON_TEXT[code] || code;
}

export default {
  BLOCKING_CODES, issueCode, isBlocking, blockingIssues, advisoryIssues, lessonFor
};
