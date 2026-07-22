// ===================================================================
// SITEMAP-FORRÁS TESZT — futtatás: node core/sitemap-feed.test.js
// Tiszta függvények, hálózat nélkül (a fetch-es részt éles füst fedi).
// ===================================================================
import { strict as assert } from 'assert';
import { parseSitemapXml, titleFromUrl, extractPageMeta, selectEntries } from './sitemap-feed.js';

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

console.log('✅ sitemap-feed.test: minden átment');
