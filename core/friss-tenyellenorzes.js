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

// 🧑 EMBER ÁLTAL MEGERŐSÍTETT cikk (2026-10-29): a tény-ellenőrző a SAJÁT elavult emlékezete alapján 75 útmutatót írt át
// és 6-ot jelölt „elavultnak” — a Le Chat „megszűnt”, a GPT Store „bezárt”, az Alexa+ „nincs kint”: mind téves volt
// (helyreállítva, hivatalos forrással). Amit ember (vagy a hivatalos forrás) megerősített, azt az automata HUMAN_OK_NAP
// napig nem nézi újra — különben ugyanazt a tévedést újra beírná / újra megjelölné.
export const HUMAN_OK_NAP = 180;
export const emberOk = (meta, now = Date.now()) => {
  const t = Date.parse(meta?.fact_human_ok || '');
  return Number.isFinite(t) && now - t < HUMAN_OK_NAP * NAP;
};

/**
 * Az automata kör sorrendje: friss (még át nem nézett) cikkek a legújabbal kezdve, utána a
 * 30 napnál régebbi útmutatók a legrégebben átnézettel kezdve. A megjelölt (emberre váró) kimarad.
 * @param {{file: string, data: object}[]} cikkek  publikált cikkek (hír + útmutató)
 */
export function ellenorzesiSor(cikkek, now = Date.now()) {
  const elo = (cikkek || []).filter(c => c?.data?._meta && !c.data._meta.fact_check_flag && !emberOk(c.data._meta, now) && pub(c.data._meta));
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

/**
 * A cikk ÖSSZES forrása. Az összevont hírnek (merged_from) több forrása van a `source_links`-ben;
 * ha csak az elsőt néznénk, a többiből jövő HELYES adatot „kitaláltnak” hinnénk (10-21, Picsart).
 */
export function forrasLinkek(meta) {
  const m = meta || {};
  return [...new Set([...(Array.isArray(m.source_links) ? m.source_links : []), m.source_link].filter(u => /^https?:\/\//.test(u || '')))];
}

/** Ennél rövidebb forrásszövegből nem ítélünk (JS-oldal, bejelentkezés, hibaoldal). */
export const MIN_FORRAS = 600;

export const HIR_RENDSZER = `You are the post-publication fact-checker for AI World HQ. You compare a PUBLISHED news explainer with the OFFICIAL SOURCE(S) it was written from. When several sources are given, the article may combine them: a claim is supported if ANY source supports it. The source text is the ONLY authority. Your own memory is NOT: the source may describe products and features newer than your training, so never call something false just because you have not heard of it.

Find factual specifics in the article that the SOURCE CONTRADICTS: numbers, dates, prices, plan or tier names, who gets it and where (regions, languages, platforms, account types), what the feature does or does not do, and timing (available now vs. coming later).
Ignore: general advice, explanations of what it means for the reader, widely known background, opinions and style.
A specific factual claim presented as part of this announcement that the source does not support at all: soften it ("if your account has it…") or remove it. Do not touch anything else.

Change ONLY the wrong sentences and keep everything else word for word: the same frontmatter, title, headings and structure. Keep product and company names EXACTLY as written.

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix","errors":["article says X, source says Y"],"reason":"one short sentence","fixed_markdown":"the full corrected article markdown, or an empty string"}`;

// ── GÉPI BIZTOSÍTÉK (2026-10-21, user: „ezek a hibák ne forduljanak elő többet!”) ──────────────
// A modell ítélete nem elég ahhoz, hogy élő szövegből kivegyünk valamit: 10-21-én a Picsart-hírből
// HELYES adatot vett ki, mert a forrás egy részét nem látta. Ezért a csere ELŐTT a kód maga nézi
// meg: a kivett / átírt mondat számai és tartalomszavai benne vannak-e a forrás(ok)ban. Ha igen,
// a forrás ALÁTÁMASZTJA → a javítás nem mehet ki (a régi szöveg marad, és szólunk).
const SZAMSZO = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
const TOLTELEK = new Set('about above after again also because been before being between both could does doing down during each from further have having here into itself just more most much need only other over same should some such than that their them then there these they this those through under until very what when where which while with would your yours youre will what\'s it\'s that\'s company says said according announcement post blog article'.split(' '));
const mondatok = md => String(md || '').replace(/^---[\s\S]*?\n---\n/, '').split(/\n+|(?<=[.!?])\s+(?=[A-Z"„“])/).map(s => s.replace(/^[#>*\-\d.\s]+/, '').trim()).filter(s => s.split(/\s+/).length >= 4);
/** A szöveg mondatainak száma UGYANAZZAL a bontással, mint a forrasAlatamasztja (≥4 szavas mondatok) — az arány nevezője (core/elakadas.js, 2026-10-24). */
export const mondatSzam = md => mondatok(md).length;
const szamok = s => [...String(s).toLowerCase().matchAll(/\b(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred)\b/g)].map(m => String(SZAMSZO[m[1]] ?? m[1].replace(',', '.')));
const szavak = s => [...new Set((String(s).toLowerCase().replace(/[’']s\b/g, '').match(/[a-z][a-z-]{3,}/g) || []).filter(w => !TOLTELEK.has(w)))];

/**
 * A javítás által KIVETT vagy átírt mondatok közül azok, amelyeket a forrás alátámaszt
 * (minden számuk és tartalomszavaik ≥60%-a megvan a forrásban). Üres tömb = a csere mehet.
 */
export function forrasAlatamasztja(eredeti, javitott, forrasSz) {
  const uj = new Set(mondatok(javitott));
  const F = String(forrasSz || '').toLowerCase();
  const fSzam = new Set(szamok(F)), fSzo = new Set(szavak(F));
  return mondatok(eredeti).filter(m => !uj.has(m)).filter(m => {
    const sz = szamok(m), w = szavak(m);
    if (!w.length) return false;
    const szamOk = sz.every(x => fSzam.has(x));
    const arany = w.filter(x => fSzo.has(x)).length / w.length;
    return szamOk && arany >= 0.6;
  });
}

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
