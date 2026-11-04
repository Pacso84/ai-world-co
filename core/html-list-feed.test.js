// ===================================================================
// TESZT — listaoldal-forrás (core/html-list-feed.js). Ingyenes, hálózat nélkül.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { listaLinkek, fetchHtmlListFeed, elsoFutas, discoverHtmlListFeed } from './html-list-feed.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Listaoldal-forrás\n');

const nap = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const oldal = (cim, datum, leiras = 'New AI model for everyday chat') =>
  `<html><head><title>${cim}</title><meta property="og:description" content="${leiras}">${datum ? `<meta property="article:published_time" content="${datum}">` : ''}</head></html>`;
const hamisFetch = oldalak => async (url) => {
  const v = oldalak[url];
  return v == null ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => v };
};

const LISTA = `<html><body>
  <a href="/blog">Blog</a>
  <a href="/blog/model-h3">H3</a>
  <a href="https://www.minimax.io/blog/model-m3?utm=x">M3</a>
  <a href="/blog/model-h3/">H3 again</a>
  <a href="https://techcrunch.com/2026/09/minimax-review">Review</a>
  <a href="https://evil-minimax.io/blog/fake">Fake</a>
  <a href="/careers">Careers</a>
  <a href="/news/speech">Speech</a>
</body></html>`;

await t('🔑 CSAK a cég saját domainje: idegen oldal és hasonló nevű domain kiesik', async () => {
  const l = listaLinkek(LISTA, 'https://www.minimax.io/blog', 'minimax\\.io/(blog|news)/[^/?#]+/?$');
  assert.ok(!l.some(u => /techcrunch/.test(u)), 'hírportál-link átjött');
  assert.ok(!l.some(u => /evil-minimax/.test(u)), 'hasonló nevű idegen domain átjött');
  assert.deepEqual(l, ['https://www.minimax.io/blog/model-h3', 'https://www.minimax.io/blog/model-m3', 'https://www.minimax.io/news/speech']);
});

await t('a listaoldal maga, a nem-hír oldal és a kettőzés kiesik; a követő paraméter levágódik', async () => {
  const l = listaLinkek(LISTA, 'https://www.minimax.io/blog', 'minimax\\.io/(blog|news)/[^/?#]+/?$');
  assert.ok(!l.includes('https://www.minimax.io/blog'), 'a listaoldal hírként jött');
  assert.ok(!l.some(u => /careers/.test(u)));
  assert.ok(!l.some(u => /utm/.test(u)));
  assert.equal(l.filter(u => /model-h3/.test(u)).length, 1, 'kettőzés');
});

const OLDALAK = {
  'https://www.minimax.io/blog': LISTA,
  'https://www.minimax.io/blog/model-h3': oldal('Model H3 launch', nap(5), 'Today we&#x27;re launching H3'),
  'https://www.minimax.io/blog/model-m3': oldal('Model M3', nap(90)),
  'https://www.minimax.io/news/speech': oldal('Speech update', nap(10))
};

await t('a dátumos régi bejegyzés kiesik, a friss marad; a leírás entitásai visszaalakulnak', async () => {
  const r = await fetchHtmlListFeed({ url: 'https://www.minimax.io/blog', path_include: 'minimax\\.io/(blog|news)/[^/?#]+/?$', max_age_days: 30 }, { fetchFn: hamisFetch(OLDALAK) });
  assert.ok(r.ok);
  assert.deepEqual(r.items.map(i => i.title), ['Model H3 launch', 'Speech update']);
  assert.equal(r.stale, 1);
  assert.equal(r.items[0].contentSnippet, "Today we're launching H3");
});

await t('🔑 első futás: a DÁTUM NÉLKÜLI bejegyzés alapállapot, nem hír; később minden új link hír', async () => {
  const items = [{ link: 'a', pubDate: null }, { link: 'b', pubDate: nap(2) }, { link: 'c', pubDate: null }];
  const elso = elsoFutas(items, new Set());
  assert.deepEqual(elso.uj.map(i => i.link), ['b']);
  assert.deepEqual(elso.alap.map(i => i.link), ['a', 'c']);
  const kesobb = elsoFutas([{ link: 'd', pubDate: null }], new Set(['a', 'c']));
  assert.deepEqual(kesobb.uj.map(i => i.link), ['d']);
});

await t('SOHA nem dob: hálózati hiba → ok:false; üres lista → ok:false', async () => {
  const r = await fetchHtmlListFeed({ url: 'https://x.com/blog' }, { fetchFn: async () => { throw new Error('le'); } });
  assert.equal(r.ok, false);
  const r2 = await fetchHtmlListFeed({ url: 'https://x.com/blog', path_include: 'x\\.com/blog/' }, { fetchFn: hamisFetch({ 'https://x.com/blog': '<a href="https://other.com/blog/a">a</a>' }) });
  assert.equal(r2.ok, false);
});

await t('a kutató-felfedezés: dátumos, angol listát javasol; a csak kínait nem', async () => {
  const oldalak = {
    'https://q.com/blog': '<a href="/blog/a">a</a><a href="/blog/b">b</a><a href="/blog/c">c</a>',
    'https://q.com/blog/a': oldal('AI model A', nap(3)), 'https://q.com/blog/b': oldal('AI model B', nap(9)), 'https://q.com/blog/c': oldal('AI model C', nap(20))
  };
  const r = await discoverHtmlListFeed('https://q.com', { fetchFn: hamisFetch(oldalak) });
  assert.ok(r && r.type === 'html-list' && r.url === 'https://q.com/blog' && r.feed.items.length === 3, JSON.stringify(r));
  const kinai = {
    'https://k.com/news': '<a href="/news/a">a</a><a href="/news/b">b</a><a href="/news/c">c</a>',
    'https://k.com/news/a': oldal('Kimi 发布', nap(3)), 'https://k.com/news/b': oldal('Kimi 上线', nap(9)), 'https://k.com/news/c': oldal('Kimi 方案', nap(20))
  };
  assert.equal(await discoverHtmlListFeed('https://k.com', { fetchFn: hamisFetch(kinai) }), null);
});

await t('a hírgyűjtő ÉS a kutató tényleg használja (html-list ág + első-futás védelem)', async () => {
  const scraper = readFileSync(join(ROOT, 'agents', 'rss-scraper', 'agent.js'), 'utf-8');
  assert.ok(/type === 'html-list'[\s\S]{0,200}fetchHtmlListFeed/.test(scraper), 'a hírgyűjtő nem ismeri a html-list típust');
  assert.ok(/elsoFutas\(recent, seenLinks\)/.test(scraper), 'nincs első-futás védelem → az archívum bezúdulna');
  const scout = readFileSync(join(ROOT, 'agents', 'source-scout', 'agent.js'), 'utf-8');
  assert.ok(/discoverHtmlListFeed\(/.test(scout), 'a kutató nem próbálja a listaoldalt');
});

await t('a bekötött listaoldal-források helyesek (saját domain, dátumszűrés)', async () => {
  const src = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8')).sources.filter(s => s.type === 'html-list' && s.enabled !== false);
  assert.ok(src.length >= 2, 'nincs bekötött listaoldal-forrás');
  for (const s of src) {
    const h = new URL(s.url).hostname.replace(/^www\./, '');
    assert.ok(s.path_include && s.path_include.includes(h.replace(/\./g, '\\.')), s.id + ': a minta nem a saját domainre szűr');
    assert.ok(s.max_age_days > 0 && s.max_age_days <= 60, s.id + ': nincs ésszerű dátumszűrés');
  }
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
