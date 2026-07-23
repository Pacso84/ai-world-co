// ===================================================================
// SITEMAP-FORRÁS TESZT — futtatás: node core/sitemap-feed.test.js
// Tiszta függvények, hálózat nélkül (a fetch-es részt éles füst fedi).
// ===================================================================
import { strict as assert } from 'assert';
import { parseSitemapXml, titleFromUrl, extractPageMeta, selectEntries, extractPublishDate, fetchSitemapFeed } from './sitemap-feed.js';

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();

// 1) Sima sitemap feldolgozása
{
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://x.com/news/a</loc><lastmod>2026-07-20T10:00:00Z</lastmod></url>
    <url><loc>https://x.com/careers</loc><lastmod>2025-01-01T10:00:00Z</lastmod></url>
  </urlset>`;
  const { isIndex, entries } = parseSitemapXml(xml);
  assert.equal(isIndex, false);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].loc, 'https://x.com/news/a');
  assert.equal(entries[0].lastmod, '2026-07-20T10:00:00Z');
}

// 2) Sitemap-INDEX felismerése (al-sitemapokra mutat)
{
  const xml = `<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>`;
  const { isIndex, entries } = parseSitemapXml(xml);
  assert.equal(isIndex, true);
  assert.equal(entries[0].loc, 'https://x.com/s1.xml');
}

// 3) Útvonal-szűrés + frissesség + sorrend (legfrissebb elöl)
{
  const entries = [
    { loc: 'https://x.com/news/friss', lastmod: iso(Date.now() - 2 * DAY) },
    { loc: 'https://x.com/news/regi', lastmod: iso(Date.now() - 400 * DAY) },
    { loc: 'https://x.com/careers/allas', lastmod: iso(Date.now() - 1 * DAY) },
    { loc: 'https://x.com/news/tegnap', lastmod: iso(Date.now() - 1 * DAY) }
  ];
  const got = selectEntries(entries, { include: '/news/', maxAgeDays: 21, limit: 10 });
  assert.deepEqual(got.map(e => e.loc), [
    'https://x.com/news/tegnap',   // legfrissebb elöl
    'https://x.com/news/friss'
  ], 'csak a friss /news/ elemek, dátum szerint csökkenő sorrendben');
}

// 4) Kizáró szűrő (pl. idegen nyelvű változatok kihagyása)
{
  const entries = [
    { loc: 'https://c.com/blog/a', lastmod: iso(Date.now() - DAY) },
    { loc: 'https://c.com/ja/blog/a', lastmod: iso(Date.now() - DAY) },
    { loc: 'https://c.com/de/blog/a', lastmod: iso(Date.now() - DAY) }
  ];
  const got = selectEntries(entries, { include: '/blog/', exclude: '/(ja|de|fr|ko|es|pt)/', limit: 10 });
  assert.deepEqual(got.map(e => e.loc), ['https://c.com/blog/a'], 'csak az angol változat marad');
}

// 5) Dátum nélküli bejegyzés kimarad (nem tudjuk, friss-e)
{
  const got = selectEntries([{ loc: 'https://x.com/news/a', lastmod: null }], { include: '/news/' });
  assert.equal(got.length, 0);
}

// 6) Darabszám-korlát tartva
{
  const many = Array.from({ length: 30 }, (_, i) => ({ loc: `https://x.com/news/${i}`, lastmod: iso(Date.now() - i * 3600e3) }));
  assert.equal(selectEntries(many, { include: '/news/', limit: 5 }).length, 5);
}

// 7) Cím kinyerése az oldalból + a záró márkanév levágása
{
  const m = extractPageMeta('<html><head><title>Claude for Excel | Anthropic</title><meta name="description" content="Egy   új  funkció"></head></html>');
  assert.equal(m.title, 'Claude for Excel', 'a " | Anthropic" utótag lekerül');
  assert.equal(m.snippet, 'Egy új funkció', 'a többszörös szóköz normalizálva');
}

// 8) og:description elsőbbsége + hiányzó meta esetén üres
{
  assert.equal(extractPageMeta('<meta property="og:description" content="OG szoveg">').snippet, 'OG szoveg');
  assert.equal(extractPageMeta('<html></html>').snippet, '');
}

// 9) Tartalék cím az URL-ből, ha az oldal nem olvasható
{
  assert.equal(titleFromUrl('https://www.anthropic.com/news/claude-for-excel'), 'Claude for excel');
  assert.equal(titleFromUrl('https://x.com/news/'), 'News');
}

// ── 2026-07-23: VALÓDI megjelenési dátum (a lastmod hazudhat) ──────

// 10) Szabványos meta-dátum
{
  assert.equal(extractPublishDate('<meta property="article:published_time" content="2026-07-01T10:00:00Z">'),
    '2026-07-01T10:00:00.000Z');
  assert.equal(extractPublishDate('<script type="application/ld+json">{"datePublished":"2026-03-16T16:28:39.000-04:00"}</script>'),
    '2026-03-16T20:28:39.000Z', 'JSON-LD (Cohere) — időzóna átszámolva');
  assert.equal(extractPublishDate('<time datetime="2026-05-05">x</time>'), '2026-05-05T00:00:00.000Z');
}

// 11) Anthropic-alak: látható dátum KÖZVETLENÜL a címsor után
{
  const html = '<h1 class="headline-1">Introducing Claude Sonnet 4.5</h1><div class="body-3 agate">Sep 29, 2025</div>';
  assert.equal(extractPublishDate(html), '2025-09-29T00:00:00.000Z');
}

// 12) A LÁBLÉC/ajánló dátumai NEM tévesztenek meg (csak a h1 utáni sáv számít)
{
  const html = '<h1>Cím</h1><div>Feb 3, 2026</div>' + 'x'.repeat(2000) + '<footer>Jan 1, 2020</footer>';
  assert.equal(extractPublishDate(html), '2026-02-03T00:00:00.000Z', 'a h1 utáni ELSŐ dátum nyer');
  assert.equal(extractPublishDate('<p>Jan 1, 2020</p><h1>Cím</h1><p>nincs dátum</p>'), null,
    'a címsor ELŐTTI dátumot nem vesszük figyelembe');
}

// 13) Nincs dátum → null (nem találunk ki semmit)
{
  assert.equal(extractPublishDate('<html><body>semmi</body></html>'), null);
  assert.equal(extractPublishDate(''), null);
  assert.equal(extractPublishDate('<meta property="article:published_time" content="kacat">'), null,
    'olvashatatlan dátum → null, nem NaN');
}

// 14) ÉLES ESET: friss lastmod + RÉGI oldal-dátum → KISZŰRVE
//     (ez a 2026-07-22-i Anthropic-újraépítés hibája)
{
  const recent = iso(Date.now() - 1 * DAY);
  const sitemap = `<urlset>
    <url><loc>https://a.com/news/regi-bejelentes</loc><lastmod>${recent}</lastmod></url>
    <url><loc>https://a.com/news/tenyleg-friss</loc><lastmod>${recent}</lastmod></url>
  </urlset>`;
  const pages = {
    'https://a.com/news/regi-bejelentes': '<h1>Régi</h1><div>Sep 29, 2025</div>',
    'https://a.com/news/tenyleg-friss': `<h1>Friss</h1><meta property="article:published_time" content="${iso(Date.now() - 2 * DAY)}">`
  };
  const fakeFetch = async (url) => ({ ok: true, text: async () => (url.endsWith('.xml') ? sitemap : pages[url]) });
  const r = await fetchSitemapFeed({ id: 'a', url: 'https://a.com/sitemap.xml', path_include: '/news/', max_age_days: 30 },
    { fetchFn: fakeFetch, limit: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map(i => i.link), ['https://a.com/news/tenyleg-friss'],
    'a friss lastmod-dal álcázott RÉGI cikk kiesik');
  assert.equal(r.stale, 1);
  assert.ok(r.items[0].pubDate, 'a mezőnév pubDate (az rss-scraper ezt olvassa)');
}

// 15) Dátum nélküli oldal → marad a lastmod (nem esik ki, nem regresszió)
{
  const recent = iso(Date.now() - 1 * DAY);
  const sitemap = `<urlset><url><loc>https://b.com/blog/x</loc><lastmod>${recent}</lastmod></url></urlset>`;
  const fakeFetch = async (url) => ({ ok: true, text: async () => (url.endsWith('.xml') ? sitemap : '<title>Cím | B</title>') });
  const r = await fetchSitemapFeed({ id: 'b', url: 'https://b.com/sitemap.xml', path_include: '/blog/', max_age_days: 30 },
    { fetchFn: fakeFetch, limit: 5 });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].pubDate, recent, 'oldal-dátum híján a lastmod marad');
  assert.equal(r.items[0].title, 'Cím');
}

console.log('✅ sitemap-feed.test: minden átment');
