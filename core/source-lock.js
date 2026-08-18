// ===================================================================
// FORRÁS-ZÁR — ugyanabból a hírből ne szülessen két cikk
// ===================================================================
//
// MIÉRT: 2026-08-18-án öt sztoriról derült ki, hogy két-két cikkünk van róla,
// mind 2026 júliusából. A cikkek tartalmilag KÜLÖNBÖZŐEK (0,091–0,409
// hasonlóság), mert az író promptja szerint a hír csak JELZÉS, nem alapanyag —
// a modell ugyanabból a forrásból két különböző témát tanított. Ezért sem
// tartalom-, sem cím-hasonlósággal nem lehet őket kiszűrni; a forrás-URL
// viszont egyértelműen azonosítja őket.
//
// MIÉRT KÉTKULCSOS: az egyik párnál a forrás a SAJÁT linkje kötőjelezését írta
// át (gemini-36-flash vs gemini-3-6-flash). Ezt semmilyen ésszerű
// URL-normalizálás nem hozza közös kulcsra — az agresszívabb normalizálás
// viszont valódi, különböző cikkeket olvasztana össze. Ezért a cím a második
// kulcs. Ugyanezt csinálja az agents/ceo/desk.js isDuplicate()-je 2026 óta,
// csak normalizálás nélkül és rossz helyen (a beragadt cikkeken) — azt erre a
// modulra állítjuk át, hogy ne éljen két duplikátum-fogalom egyszerre.
//
// MIÉRT ROBUSZTUSABB, MINT A SCRAPER EMLÉKEZETE: a scraper saveDraft()-ja
// azonnal lemezre ír, a saveSeenItems() viszont csak a futás VÉGÉN fut le. Ha
// egy futás félbeszakad, a draftok ott vannak, de egyetlen link sem lesz
// „látott" → a következő futás újra lementi őket. Ez a zár a PUBLIKÁLT
// cikkekből épül, tehát nem függ attól, sikerült-e a futás végén menteni.
// ===================================================================

/** A saját domainjeink — ezek sosem zárolnak. */
export const OWN_DOMAINS = Object.freeze(['aiworldhq.com']);

/**
 * Ennyi karakternél rövidebb normalizált címből nem csinálunk kulcsot.
 * Egy „V8" cím véletlenül is egyezhet két független hírnél.
 */
export const MIN_TITLE_KEY_LEN = 12;

/**
 * A jelentéktelen eltérések levágása: protokoll, www., query, horgony, záró per.
 * SZÁNDÉKOSAN nem nyúl az útvonalhoz — lásd a fejlécben a Gemini-esetet.
 */
export function normalizeSourceUrl(url) {
  const s = String(url == null ? '' : url).trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/[?#].*$/, '')
          .replace(/\/+$/, '');
}

/** Cím-kulcs: kisbetű, csak betű/szám, egy szóköz. */
export function normalizeSourceTitle(title) {
  return String(title == null ? '' : title)
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A saját domainünk-e? (A digest/compare source_link-je a saját oldalunk.) */
export function isOwnDomain(url) {
  const n = normalizeSourceUrl(url);
  if (!n) return false;
  return OWN_DOMAINS.some(d => n === d || n.startsWith(d + '/'));
}

/**
 * A publikált cikkekből a zárolt kulcsok.
 * @param {object[]} articles  a content/articles/*.json beolvasott tartalma
 * @returns {{urls: Set<string>, titles: Set<string>}}
 */
export function publishedSourceKeys(articles) {
  const urls = new Set(), titles = new Set();
  for (const a of Array.isArray(articles) ? articles : []) {
    const m = a?._meta || {};
    const linkek = [m.source_link, ...(Array.isArray(m.source_links) ? m.source_links : [])];
    for (const l of linkek) {
      if (!l || isOwnDomain(l)) continue;
      const k = normalizeSourceUrl(l);
      if (k) urls.add(k);
    }
    const t = normalizeSourceTitle(a?.original_title);
    if (t.length >= MIN_TITLE_KEY_LEN) titles.add(t);
  }
  return { urls, titles };
}

/**
 * Írtunk már ebből a draftból cikket?
 * ⚠️ A draftban a forrás-URL mezőjének neve `link` (a `source_link` nevet az
 * író adja neki: agents/iro/agent.js saveWrittenArticle()).
 */
export function isAlreadyWritten(draft, keys) {
  if (!keys || !draft) return false;
  const url = draft.link || draft._meta?.source_link || '';
  if (url && !isOwnDomain(url)) {
    const k = normalizeSourceUrl(url);
    if (k && keys.urls?.has(k)) return true;
  }
  const t = normalizeSourceTitle(draft.title || draft.original_title);
  return !!(t.length >= MIN_TITLE_KEY_LEN && keys.titles?.has(t));
}

export default {
  OWN_DOMAINS, MIN_TITLE_KEY_LEN,
  normalizeSourceUrl, normalizeSourceTitle, isOwnDomain,
  publishedSourceKeys, isAlreadyWritten
};
