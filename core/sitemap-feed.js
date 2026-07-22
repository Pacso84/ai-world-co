// ===================================================================
// SITEMAP-FORRÁS (2026-07-22, user: "hogyan lesz cikkünk az Anthropictól?")
//
// Néhány nagy AI-cég (Anthropic, Cohere) NEM ad RSS-t, de minden weboldal
// közzéteszi a sitemap.xml-t: a keresőknek szánt HIVATALOS tartalomjegyzéket,
// benne minden cikk URL-jével és dátumával. Ebből ugyanolyan "hírfolyamot"
// állítunk elő, mint az RSS-ből — így a cikk a MEGSZOKOTT úton megy tovább
// (kulcsszó-szűrő → AI relevancia → író → Ellenőrző → hitelesség-kapu).
//
// ETIKA: ez ELSŐ KEZES forrás — a cég SAJÁT bejelentését olvassuk, nem más
// újságíró munkáját. A "nem másolunk hírmagazint" szabály sértetlen marad.
// Miért nem HTML-kaparás: a sitemap szabvány, nem törik el a design-váltáskor.
// ===================================================================

const DAY = 86400000;

// --- Tiszta segédek (hálózat nélkül, tesztelhetők) ---

export function parseSitemapXml(xml) {
  const isIndex = /<sitemapindex/i.test(xml || '');
  const blocks = [...String(xml || '').matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/g)];
  const entries = blocks.map(b => {
    const loc = (b[1].match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const mod = (b[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
    return loc ? { loc: loc.trim(), lastmod: mod ? mod.trim() : null } : null;
  }).filter(Boolean);
  return { isIndex, entries };
}

// URL-ből emberi cím, ha az oldalról nem sikerül kiolvasni
// pl. ".../news/claude-for-excel" → "Claude for excel"
export function titleFromUrl(url) {
  const slug = String(url || '').replace(/\/+$/, '').split('/').pop() || '';
  const words = slug.replace(/[-_]+/g, ' ').replace(/\.\w+$/, '').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

// A HTML <title> és a leírás kinyerése (a kulcsszó-szűrőnek + az AI-nak)
export function extractPageMeta(html) {
  const h = String(html || '');
  const rawTitle = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const og = (h.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1];
  const desc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1];
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
  return { title: clean(rawTitle).replace(/\s*[|\-–]\s*[^|\-–]{0,40}$/, ''), snippet: clean(og || desc) };
}

// Melyik bejegyzések jöhetnek szóba? (útvonal-szűrő + frissesség + darabszám)
export function selectEntries(entries, { include, exclude, maxAgeDays = 21, limit = 10 } = {}) {
  const incRx = include ? new RegExp(include) : null;
  const excRx = exclude ? new RegExp(exclude) : null;
  const cutoff = Date.now() - maxAgeDays * DAY;
  return entries
    .filter(e => (!incRx || incRx.test(e.loc)) && (!excRx || !excRx.test(e.loc)))
    .map(e => ({ ...e, ts: e.lastmod ? Date.parse(e.lastmod) : NaN }))
    .filter(e => !isNaN(e.ts) && e.ts >= cutoff)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

// --- Hálózat ---

async function getText(url, fetchFn) {
  const r = await fetchFn(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldBot/1.0; +https://aiworldhq.com)' }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Fő belépő: a forrás-konfigból RSS-SZERŰ elemeket ad vissza.
// Visszatérés: { ok, items:[{title, link, contentSnippet, isoDate}] , error? }
export async function fetchSitemapFeed(source, { fetchFn = fetch, limit = 10 } = {}) {
  try {
    const first = await getText(source.url, fetchFn);
    let { isIndex, entries } = parseSitemapXml(first);

    // Sitemap-index: bejárjuk az al-sitemapokat (ésszerű korláttal)
    if (isIndex) {
      const subs = entries.slice(0, 8);
      entries = [];
      for (const s of subs) {
        try { entries.push(...parseSitemapXml(await getText(s.loc, fetchFn)).entries); } catch { /* egy al-sitemap hibája nem állít meg */ }
      }
    }

    const picked = selectEntries(entries, {
      include: source.path_include,
      exclude: source.path_exclude,
      maxAgeDays: source.max_age_days ?? 21,
      limit
    });

    // A kiválasztott (kevés, friss) oldal címét/leírását kiolvassuk — ez kell a
    // kulcsszó-szűrőnek és az AI relevancia-döntésnek.
    const items = [];
    for (const e of picked) {
      let meta = { title: '', snippet: '' };
      try { meta = extractPageMeta(await getText(e.loc, fetchFn)); } catch { /* marad a slug-cím */ }
      items.push({
        title: meta.title || titleFromUrl(e.loc),
        link: e.loc,
        contentSnippet: meta.snippet || '',
        isoDate: e.lastmod || null
      });
    }
    return { ok: true, items };
  } catch (e) {
    return { ok: false, items: [], error: String(e.message || e).slice(0, 120) };
  }
}
