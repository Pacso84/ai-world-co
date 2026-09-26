// ===================================================================
// TESZT — sitemap-hírfolyam felfedezése (core/sitemap-discovery.js).
// Ingyenes, hálózat nélkül: hamis fetch.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { legjobbHirCsoport, discoverSitemapFeed } from './sitemap-discovery.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Sitemap-hírfolyam felfedezése\n');

const nap = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const sm = urls => '<urlset>' + urls.map(([u, d]) => `<url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('') + '</urlset>';
const oldal = (cim, datum) => `<html><head><title>${cim}</title><meta property="og:description" content="New AI model release for chat users"><meta property="article:published_time" content="${datum}"></head><body></body></html>`;
const hamisFetch = oldalak => async (url) => {
  const v = oldalak[url];
  return v == null ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => v };
};

// A DeepSeek valódi szerkezete (09-26): /news/ listaoldal, /news/<slug>/ ÉS /en/news/<slug>/ kettőzve.
const DS = 'https://www.deepseek.com';
const dsEntries = [
  [DS + '/news/', nap(16)], [DS + '/en/news/', nap(16)],
  [DS + '/news/v4-1/', nap(16)], [DS + '/en/news/v4-1/', nap(16)],
  [DS + '/news/v4-preview/', nap(150)], [DS + '/en/news/v4-preview/', nap(150)],
  [DS + '/news/v3-2/', nap(300)], [DS + '/en/news/v3-2/', nap(300)],
  [DS + '/transparency/', nap(20)], [DS + '/privacy/', nap(20)]
];

await t('a hír-csoportot találja meg, a listaoldalt és a nem-hír oldalakat nem', async () => {
  const cs = legjobbHirCsoport(dsEntries.map(([loc, lastmod]) => ({ loc, lastmod })));
  assert.ok(cs, 'nem talált csoportot');
  assert.equal(cs.count, 3);
  const rx = new RegExp(cs.path_include);
  assert.ok(rx.test(DS + '/en/news/v4-1/'), 'a hír-oldal nem illeszkedik');
  assert.ok(!rx.test(DS + '/en/news/'), 'a LISTAOLDAL is illeszkedik');
  assert.ok(!rx.test(DS + '/transparency/'), 'nem-hír oldal illeszkedik');
});

await t('azonos méretű csoportok közül az ANGOL nyer (nincs kínai kettőzés)', async () => {
  const cs = legjobbHirCsoport(dsEntries.map(([loc, lastmod]) => ({ loc, lastmod })));
  assert.equal(cs.prefix, '/en/news/');
});

await t('lastmod nélküli bejegyzés nem számít (a hírgyűjtő sem látná)', async () => {
  const e = ['a', 'b', 'c', 'd'].map(s => ({ loc: `https://x.com/blog/${s}`, lastmod: null }));
  assert.equal(legjobbHirCsoport(e), null);
});

await t('kevesebb mint 3 hír → nincs javaslat', async () => {
  const e = [{ loc: 'https://x.com/news/a', lastmod: nap(1) }, { loc: 'https://x.com/news/b', lastmod: nap(2) }];
  assert.equal(legjobbHirCsoport(e), null);
});

await t('teljes lánc: robots.txt → sitemap → a hírgyűjtő formátuma (type, url, path_include, items)', async () => {
  const oldalak = {
    [DS + '/robots.txt']: 'User-agent: *\nSitemap: ' + DS + '/sitemap.xml\n',
    [DS + '/sitemap.xml']: sm(dsEntries),
    [DS + '/en/news/v4-1/']: oldal('Introducing DeepSeek-V4.1', nap(16)),
    [DS + '/en/news/v4-preview/']: oldal('DeepSeek-V4 Preview', nap(150)),
    [DS + '/en/news/v3-2/']: oldal('DeepSeek-V3.2', nap(300))
  };
  const r = await discoverSitemapFeed(DS, { fetchFn: hamisFetch(oldalak) });
  assert.ok(r, 'nem talált hírfolyamot');
  assert.equal(r.type, 'sitemap');
  assert.equal(r.url, DS + '/sitemap.xml');
  assert.equal(r.feed.items.length, 3);
  assert.ok(r.feed.items.every(i => i.isoDate && i.title), 'dátum vagy cím hiányzik');
  assert.ok(r.feed.items.some(i => /V4\.1/.test(i.title)), 'nem az oldal valódi címét vette át');
});

await t('sitemap-index al-sitemapjait is bejárja', async () => {
  const oldalak = {
    'https://y.com/sitemap.xml': '<sitemapindex><sitemap><loc>https://y.com/sm-blog.xml</loc></sitemap></sitemapindex>',
    'https://y.com/sm-blog.xml': sm([['https://y.com/blog/a', nap(3)], ['https://y.com/blog/b', nap(9)], ['https://y.com/blog/c', nap(30)]]),
    'https://y.com/blog/a': oldal('AI chat update A', nap(3)),
    'https://y.com/blog/b': oldal('AI chat update B', nap(9)),
    'https://y.com/blog/c': oldal('AI chat update C', nap(30))
  };
  const r = await discoverSitemapFeed('https://y.com', { fetchFn: hamisFetch(oldalak) });
  assert.ok(r && r.feed.items.length === 3, 'az index mögötti híreket nem találta');
});

await t('a CSAK kínai nyelvű hírfolyamot nem javasolja (09-26: Kimi)', async () => {
  const oldalak = {
    'https://k.com/sitemap.xml': sm([['https://k.com/news/a', nap(3)], ['https://k.com/news/b', nap(9)], ['https://k.com/news/c', nap(20)]]),
    'https://k.com/news/a': oldal('Kimi 金融行业 AI 方案', nap(3)),
    'https://k.com/news/b': oldal('Kimi 发布新模型', nap(9)),
    'https://k.com/news/c': oldal('Kimi K3 上线', nap(20))
  };
  assert.equal(await discoverSitemapFeed('https://k.com', { fetchFn: hamisFetch(oldalak) }), null);
});

await t('SOHA nem dob: hálózati hiba, rossz domain, http → null', async () => {
  assert.equal(await discoverSitemapFeed('https://z.com', { fetchFn: async () => { throw new Error('le'); } }), null);
  assert.equal(await discoverSitemapFeed('http://z.com', { fetchFn: hamisFetch({}) }), null);
  assert.equal(await discoverSitemapFeed('', { fetchFn: hamisFetch({}) }), null);
});

await t('a forrás-kutató TÉNYLEG használja (RSS után sitemap) + LLM-vadászmező mindig benne', async () => {
  const src = readFileSync(join(ROOT, 'agents', 'source-scout', 'agent.js'), 'utf-8');
  assert.ok(/discoverSitemapFeed\(/.test(src), 'a kutató nem hívja a sitemap-keresőt');
  assert.ok(/LLM_NICHE/.test(src), 'nincs állandó LLM-vadászmező');
  assert.ok(/type:\s*found\.type/.test(src) && /path_include:\s*found\.path_include/.test(src),
    'a javaslatba nem kerül be a bekötéshez kellő type/path_include');
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
