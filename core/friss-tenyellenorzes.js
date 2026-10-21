// ===================================================================
// FRISS CIKKEK TÉNYELLENŐRZÉSE (2026-10-21, user: „jó lenne, ha a tényellenőr a friss cikkeket
// nézné át! ne a régieket.”)
//
// A tény-ellenőrző (agents/fact-check) eddig CSAK a 30 napnál régebbi útmutatókat nézte, és az
// „ok” ítéletet sehova nem írta fel → minden futásban UGYANAZT a 2–3 útmutatót kapta (10-20/21:
// Gemini-számológép, ChatRTX, DeepSeek-kísérőlevél). Most:
//   • ELÖL a friss (≤7 napos) hírek és útmutatók, a legújabb előre — ezeket olvassák, ezek mennek
//     ki a Facebookra;
//   • a hírt a HIVATALOS FORRÁSÁHOZ méri (letöltve), nem a modell emlékezetéhez: a modell tudása
//     régebbi a hírnél, az új funkciót „nem létezőnek” hinné;
//   • a régi útmutatók csak a maradék helyre jönnek;
//   • minden átnézést a `fact_verified_at` jegyez → nincs körbeforgás. Ez NEM módosítás: a
//     „Frissítve” sort és a sitemap-dátumot csak a valódi javítás (`fact_checked_at`) mozdítja.
// Hálózat és lemez nélkül számol → tesztelhető (az agents/ alól nem lehet importálni).
// ===================================================================

export const FRISS_NAP = 7;
const NAP = 86400e3;

const pub = m => Date.parse(m?.published_at || '') || 0;

/**
 * Az automata kör sorrendje: friss (még át nem nézett) cikkek a legújabbal kezdve, utána a
 * 30 napnál régebbi útmutatók a legrégebben átnézettel kezdve. A megjelölt (emberre váró) kimarad.
 * @param {{file: string, data: object}[]} cikkek  publikált cikkek (hír + útmutató)
 */
export function ellenorzesiSor(cikkek, now = Date.now()) {
  const elo = (cikkek || []).filter(c => c?.data?._meta && !c.data._meta.fact_check_flag && pub(c.data._meta));
  const friss = elo
    .filter(c => now - pub(c.data._meta) < FRISS_NAP * NAP && !c.data._meta.fact_verified_at)
    .sort((a, b) => pub(b.data._meta) - pub(a.data._meta));
  const regi = elo
    .filter(c => c.data._meta.type === 'guide' && now - pub(c.data._meta) > 30 * NAP)
    .sort((a, b) => {
      const av = a.data._meta.fact_verified_at || a.data._meta.fact_checked_at || '';
      const bv = b.data._meta.fact_verified_at || b.data._meta.fact_checked_at || '';
      return av.localeCompare(bv);
    });
  return [...friss, ...regi];
}

/** A forrásoldal olvasható szövege (szkript, stílus, menü nélkül), legfeljebb `max` karakter. */
export function forrasSzoveg(html, max = 15000) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Ennél rövidebb forrásszövegből nem ítélünk (JS-oldal, bejelentkezés, hibaoldal). */
export const MIN_FORRAS = 600;

export const HIR_RENDSZER = `You are the post-publication fact-checker for AI World HQ. You compare a PUBLISHED news explainer with the OFFICIAL SOURCE it was written from. The source text is the ONLY authority. Your own memory is NOT: the source may describe products and features newer than your training, so never call something false just because you have not heard of it.

Find factual specifics in the article that the SOURCE CONTRADICTS: numbers, dates, prices, plan or tier names, who gets it and where (regions, languages, platforms, account types), what the feature does or does not do, and timing (available now vs. coming later).
Ignore: general advice, explanations of what it means for the reader, widely known background, opinions and style.
A specific factual claim presented as part of this announcement that the source does not support at all: soften it ("if your account has it…") or remove it. Do not touch anything else.

Change ONLY the wrong sentences and keep everything else word for word: the same frontmatter, title, headings and structure. Keep product and company names EXACTLY as written.

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix","errors":["article says X, source says Y"],"reason":"one short sentence","fixed_markdown":"the full corrected article markdown, or an empty string"}`;

/** A hír javítása csak akkor cserélheti a régit, ha kis, célzott javítás maradt. null = rendben. */
export function hirCsereEp(fixed, original) {
  if (!fixed || !String(fixed).trimStart().startsWith('---')) return 'nincs frontmatter';
  if (!/^title:\s*\S/m.test(fixed)) return 'nincs title mező';
  const szo = s => String(s || '').split(/\s+/).filter(Boolean).length;
  const fw = szo(fixed), ow = szo(original);
  if (ow && (fw < ow * 0.8 || fw > ow * 1.2)) return `túl nagy átírás (${fw} szó a ${ow}-ből)`;
  const cimek = s => (String(s || '').match(/^#{1,4} /gm) || []).length;
  if (cimek(fixed) !== cimek(original)) return 'megváltozott a fejezetek száma';
  return null;
}
