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

// ── VALÓDI MEGJELENÉSI DÁTUM AZ OLDALRÓL (2026-07-23) ──────────────
// MIÉRT KELL: a sitemap <lastmod> azt jelenti, "ekkor VÁLTOZOTT a fájl",
// NEM azt, hogy "ekkor jelent meg". Élesben mérve: az Anthropic 2026-07-22-i
// részleges újraépítéskor 13 RÉGI hír-oldalra friss lastmod-ot írt, köztük a
// "Claude Sonnet 4.5"-re (valódi dátuma 2025-09-29, tehát 10 HÓNAPOS) — így
// azok átcsúsztak a 30 napos frissesség-szűrőn, és majdnem hírként jelentek
// meg. Ez ugyanaz a hiba, amiért az alibaba-qwen forrást kikapcsoltuk.
// A VALÓDI dátum viszont ott van az oldalon, és az oldalt a címért amúgy is
// letöltjük → a kiolvasás gyakorlatilag ingyen van.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function extractPublishDate(html) {
  const h = String(html || '');
  // 1) Szabványos meta (a legtöbb blogmotor ezt adja)
  const meta = (h.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|date|publish[-_]?date)["'][^>]+content=["']([^"']+)/i) || [])[1]
    // 2) JSON-LD datePublished (pl. Cohere)
    || (h.match(/"datePublished"\s*:\s*"([^"]+)"/i) || [])[1]
    // 3) <time datetime="...">
    || (h.match(/<time[^>]+datetime=["']([^"']+)/i) || [])[1];
  if (meta) {
    const t = Date.parse(meta);
    if (!isNaN(t)) return new Date(t).toISOString();
  }
  // 4) Látható szöveges dátum a CÍMSOR UTÁN (pl. Anthropic:
  //    <h1>…</h1><div class="body-3 agate">Sep 29, 2025</div>)
  //    Csak a h1 utáni első 600 karakterben nézzük — a lábléc/ajánló
  //    blokkok dátumai így nem tévesztenek meg minket.
  const h1 = h.search(/<h1[\s>]/i);
  const zone = h1 >= 0 ? h.slice(h1, h1 + 800) : '';
  const m = zone.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d\d)\b/);
  if (m) {
    const d = Date.UTC(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
    if (!isNaN(d)) return new Date(d).toISOString();
  }
  return null;
}

// A HTML <title>, a leírás és a VALÓDI megjelenési dátum kinyerése
// (az első kettő a kulcsszó-szűrőnek + az AI-nak, a dátum a frissesség-kapunak)
export function extractPageMeta(html) {
  const h = String(html || '');
  const rawTitle = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const og = (h.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || [])[1];
  const desc = (h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1];
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
  return {
    title: clean(rawTitle).replace(/\s*[|\-–]\s*[^|\-–]{0,40}$/, ''),
    snippet: clean(og || desc),
    date: extractPublishDate(h)
  };
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
// Visszatérés: { ok, items:[{title, link, contentSnippet, pubDate}], stale, error? }
//
// KÉT LÉPCSŐS FRISSESSÉG (2026-07-23): a lastmod csak ELŐSZŰRŐ (olcsó, hálózat
// nélkül szűkít) — a DÖNTÉST az oldalról kiolvasott VALÓDI dátum hozza. Ezért
// a jelöltlista szándékosan bővebb (limit×4): ha egy újraépítés régi oldalakat
// tol a lista elejére, a tényleg friss hír ne szoruljon ki.
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

    const maxAgeDays = source.max_age_days ?? 21;
    const cutoff = Date.now() - maxAgeDays * DAY;
    const candidates = selectEntries(entries, {
      include: source.path_include,
      exclude: source.path_exclude,
      maxAgeDays,
      limit: Math.min(40, limit * 4)
    });

    // A jelöltek oldalát letöltjük (cím + leírás + VALÓDI dátum). Kis kötegekben,
    // hogy gyors legyen, és megállunk, amint megvan a kért darabszám.
    const items = [];
    let stale = 0;
    for (let i = 0; i < candidates.length && items.length < limit; i += 4) {
      const batch = candidates.slice(i, i + 4);
      const metas = await Promise.all(batch.map(async (e) => {
        try { return { e, meta: extractPageMeta(await getText(e.loc, fetchFn)) }; }
        catch { return { e, meta: null }; }
      }));
      for (const { e, meta } of metas) {
        if (items.length >= limit) break;
        // Ha az oldalon VAN valódi dátum, az dönt — a lastmod nem elég bizonyíték.
        // Ha nincs (nem minden oldal írja ki), marad a lastmod, mint eddig.
        const real = meta?.date || null;
        if (real && Date.parse(real) < cutoff) { stale++; continue; }
        items.push({
          title: meta?.title || titleFromUrl(e.loc),
          link: e.loc,
          contentSnippet: meta?.snippet || '',
          // A mezőnév SZÁNDÉKOSAN pubDate: az rss-scraper ezt olvassa
          // (item.pubDate → pub_date). Korábban isoDate volt → a sitemapos
          // piszkozatok DÁTUM NÉLKÜL készültek.
          pubDate: real || e.lastmod || null
        });
      }
    }
    if (stale) console.log(`   🕰️ ${source.id || source.name}: ${stale} elavult oldal kiszűrve (friss lastmod, régi tartalom)`);
    return { ok: true, items, stale };
  } catch (e) {
    return { ok: false, items: [], stale: 0, error: String(e.message || e).slice(0, 120) };
  }
}
