// TESZT — súgó-felfedező engedély-rész (core/sugo-felfedezo.js, tiszta függvények). Ingyenes, hálózat és MI nélküli.
// A tesztszövegek kitaláltak (kiadói szöveg nem kerülhet a nyilvános repóba).
import assert from 'assert/strict';
import { FELFEDEZO_BE, felfedezoHost, sugoJellegu, felfedezettEngedelyezett, forrasEngedelyezett, felfedez, KERES_MAX, URL_MAX, JELOLT_MAX, SZINT_MAX, IDOKORLAT_MS } from './sugo-felfedezo.js';
import { UA } from './sugo-index.js';

let pass = 0, hiba = 0;
const t = (n, f) => { try { f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } };
// aszinkron változat: a tesztek egymás után futnak, az összegzés megvárja mindet
let lanc = Promise.resolve();
const tt = (n, f) => { lanc = lanc.then(async () => { try { await f(); pass++; console.log('  ✅ ' + n); } catch (e) { hiba++; console.log('  ❌ ' + n + '\n     ' + String(e.message).split('\n')[0]); } }); };
console.log('🧪 súgó-felfedező (engedély + felfedezés)\n');

const TL = { tools: { 'MiniMax Code': 'https://agent.minimax.io', 'Lumo': 'https://lumo.proton.me', 'Brave Leo': 'https://brave.com/leo/',
  'Proba': 'https://www.proton.me', 'Httpes': 'http://example.org', 'Portos': 'https://example.org:8443' } };

t('🔌 kapcsoló bekapcsolva', () => assert.equal(FELFEDEZO_BE, true));
t('pontos host', () => assert.equal(felfedezoHost('MiniMax Code', TL), 'agent.minimax.io'));
t('aldomain nem öröklődik a kizárásból', () => assert.equal(felfedezoHost('Lumo', TL), 'lumo.proton.me'));
t('ENGEDELY-host kizár', () => assert.equal(felfedezoHost('Brave Leo', TL), null));
t('www-eltérés is kizár', () => assert.equal(felfedezoHost('Proba', TL), null));          // proton.me/support/ az ENGEDELY-ben
t('http-cím nem felfedezhető', () => assert.equal(felfedezoHost('Httpes', TL), null));
t('port nem lehet', () => assert.equal(felfedezoHost('Portos', TL), null));
t('ismeretlen eszköz', () => assert.equal(felfedezoHost('Nincs Ilyen', TL), null));

t('súgó-jellegű útvonalak', () => {
  for (const u of ['https://agent.minimax.io/docs/code/welcome', 'https://x.io/help/start', 'https://x.io/faq', 'https://x.io/user-guide/a', 'https://x.io/support/a', 'https://x.io/guides/a'])
    assert.equal(sugoJellegu(u), true, u);
});
t('kizárt szakaszok', () => {
  for (const u of ['https://x.io/docs/api/a', 'https://x.io/docs/api-reference/a', 'https://x.io/developers/docs/a', 'https://x.io/docs/reference/a',
    'https://x.io/docs/sdk/a', 'https://x.io/docs/cookbook/a', 'https://x.io/help/pricing', 'https://x.io/docs/techblog', 'https://x.io/blog/help',
    'https://x.io/news/faq', 'https://x.io/legal/faq', 'https://x.io/help/terms', 'https://x.io/help/privacy', 'https://x.io/careers/faq',
    'https://x.io/features', 'https://platform.x.io/docs/a'])
    assert.equal(sugoJellegu(u), false, u);
});
t('nem angol nyelvi előtag kiesik, az en marad', () => {
  assert.equal(sugoJellegu('https://x.io/zh/docs/a'), false);
  assert.equal(sugoJellegu('https://x.io/en-cn/help/a'), false);
  assert.equal(sugoJellegu('https://x.io/en/help/a'), true);
});

t('felfedezett: csak a tool-host', () => {
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/code/welcome', 'MiniMax Code', TL), true);
  assert.equal(felfedezettEngedelyezett('https://code.minimax.io/docs/code/welcome', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/../api/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://agent.minimax.io/docs/%2e%2e/x', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('https://user@agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
  assert.equal(felfedezettEngedelyezett('http://agent.minimax.io/docs/a', 'MiniMax Code', TL), false);
});
t('felfedezett: a helyes hoston is csak súgó-jellegű útvonal (host + útvonal egy függvényben)', () => {
  const tema = { tool: 'MiniMax Code', company: 'MiniMax' };
  for (const ut of ['/pricing', '/blog/x', '/docs/api/a']) {
    const url = 'https://agent.minimax.io' + ut;
    assert.equal(felfedezettEngedelyezett(url, 'MiniMax Code', TL), false, url);
    assert.equal(forrasEngedelyezett({ url, felfedezett: true }, tema, TL), false, url);
  }
});
t('forrasEngedelyezett: jóváhagyott marad, felfedezett jelöléssel bővül', () => {
  const tema = { tool: 'MiniMax Code', company: 'MiniMax' };
  assert.equal(forrasEngedelyezett({ url: 'https://help.openai.com/en/articles/1-a' }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome' }, tema, TL), false);   // jelölés nélkül nem
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, tema, TL), true);
  assert.equal(forrasEngedelyezett({ url: 'https://agent.minimax.io/docs/code/welcome', felfedezett: true }, { tool: 'Kimi' }, TL), false);   // más eszköz
  assert.equal(forrasEngedelyezett('https://help.openai.com/en/articles/1-a', tema, TL), true);   // sima URL-szöveg is
});

// ---------- felfedezés (hamis fetchFn, hálózat nélkül) ----------
const hamis = (lap, naplo = []) => async url => { naplo.push(url); const r = lap[url]; if (!r) return { ok: false, status: 404, text: async () => '' };
  return { ok: (r.status || 200) === 200, status: r.status || 200, text: async () => r.body }; };
const ROBOTS = 'User-agent: *\nSitemap: https://agent.minimax.io/sitemap.xml\nSitemap: https://masik.io/sitemap.xml';
const IDX = '<sitemapindex><sitemap><loc>https://agent.minimax.io/s-0.xml</loc></sitemap><sitemap><loc>https://code.minimax.io/s-1.xml</loc></sitemap></sitemapindex>';
const URLSET = '<urlset><url><loc>https://agent.minimax.io/docs/code/get-started/first-task</loc></url><url><loc>https://agent.minimax.io/pricing</loc></url><url><loc>https://agent.minimax.io/docs/api/x</loc></url></urlset>';
const LLMS = '# Docs\n- [Create Your First Task](https://agent.minimax.io/docs/code/get-started/first-task.md): x\n- [Coding and Work Modes](https://agent.minimax.io/docs/code/workflows/modes.md)\n- [Kívül](https://code.minimax.io/docs/code/x.md)';
const urlset = urlok => '<urlset>' + urlok.map(u => `<url><loc>${u}</loc></url>`).join('') + '</urlset>';
const index = urlok => '<sitemapindex>' + urlok.map(u => `<sitemap><loc>${u}</loc></sitemap>`).join('') + '</sitemapindex>';

tt('konstansok', () => {
  assert.deepEqual([KERES_MAX, URL_MAX, JELOLT_MAX, SZINT_MAX, IDOKORLAT_MS], [12, 5000, 400, 2, 30000]);
});
tt('sitemap + llms.txt jelöltjei', async () => {
  const naplo = [];
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { body: ROBOTS },
    'https://agent.minimax.io/sitemap.xml': { body: IDX }, 'https://agent.minimax.io/s-0.xml': { body: URLSET },
    'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }, naplo) });
  assert.deepEqual(l.map(x => x.url), ['https://agent.minimax.io/docs/code/get-started/first-task', 'https://agent.minimax.io/docs/code/workflows/modes']);
  assert.equal(l[0].cim, 'Create Your First Task');            // a linkszöveg nyer a slug ellen
  assert.equal(l[1].cim, 'Coding and Work Modes');
  assert.ok(l.every(x => x.felfedezett === true));
  assert.ok(!naplo.includes('https://masik.io/sitemap.xml'));  // más hostú Sitemap-sor nem kérődik le
  assert.ok(naplo.includes('https://agent.minimax.io/llms.txt') && naplo.includes('https://agent.minimax.io/docs/llms.txt'));
});
tt('csak sitemap: a cím a slugból jön', async () => {
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { body: 'Sitemap: https://agent.minimax.io/sitemap.xml' },
    'https://agent.minimax.io/sitemap.xml': { body: URLSET } }) });
  assert.deepEqual(l, [{ url: 'https://agent.minimax.io/docs/code/get-started/first-task', cim: 'First task', felfedezett: true }]);
});
tt('más hostú al-sitemap nem kérődik le', async () => {
  const naplo = [];
  await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { body: ROBOTS },
    'https://agent.minimax.io/sitemap.xml': { body: IDX }, 'https://agent.minimax.io/s-0.xml': { body: URLSET },
    'https://code.minimax.io/s-1.xml': { body: urlset(['https://code.minimax.io/docs/x']) } }, naplo) });
  assert.ok(naplo.includes('https://agent.minimax.io/s-0.xml'));
  assert.ok(!naplo.includes('https://code.minimax.io/s-1.xml'));
  assert.ok(naplo.every(u => new URL(u).hostname === 'agent.minimax.io'));
});
tt('más hostú link nem jelölt', async () => {
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }) });
  assert.ok(l.length > 0);
  assert.ok(!l.some(x => x.url.includes('code.minimax.io')));
  assert.ok(!l.some(x => x.cim === 'Kívül'));
});
tt('query/hash levágva, .md levágva, egyedi, szűrt útvonal kiesik', async () => {
  const body = '[A](https://agent.minimax.io/help/a.md?x=1#y) [A újra](https://agent.minimax.io/help/a) [API](https://agent.minimax.io/docs/api/z.md) [B](https://agent.minimax.io/help/b.md "cím")';
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/llms.txt': { body } }) });
  assert.deepEqual(l.map(x => [x.url, x.cim]), [['https://agent.minimax.io/help/a', 'A'], ['https://agent.minimax.io/help/b', 'B']]);
});
tt('html-hibaoldal llms.txt helyén', async () => {
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/llms.txt': { body: '<!DOCTYPE html><html><head><script src="https://cdn.x/a.js"></script></head></html>' },
    'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }) });
  assert.equal(l.length, 2);
  // az HTML-ben álló markdown-szerű link sem számít
  const m = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/llms.txt': { body: '<html><body>[Titok](https://agent.minimax.io/help/titok)</body></html>' } }) });
  assert.deepEqual(m, []);
});
tt('nem-200 válasz kimarad, a többi lépés megy', async () => {
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { status: 500, body: ROBOTS },
    'https://agent.minimax.io/llms.txt': { status: 503, body: LLMS }, 'https://agent.minimax.io/docs/llms.txt': { body: LLMS } }) });
  assert.equal(l.length, 2);
});
tt('legfeljebb 12 kérés', async () => {
  const alsok = Array.from({ length: 20 }, (_, i) => `https://agent.minimax.io/s-${i}.xml`);
  const lap = { 'https://agent.minimax.io/robots.txt': { body: 'Sitemap: https://agent.minimax.io/sitemap.xml' },
    'https://agent.minimax.io/sitemap.xml': { body: index(['https://agent.minimax.io/sitemap.xml', ...alsok]) } };   // önmagára is mutat
  alsok.forEach((u, i) => { lap[u] = { body: urlset([`https://agent.minimax.io/help/a${i}`]) }; });
  const naplo = [];
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis(lap, naplo) });
  assert.equal(naplo.length, KERES_MAX);
  assert.ok(l.length > 0 && l.length < 20);
  assert.equal(new Set(naplo).size, naplo.length);              // önmagára mutató sitemapot nem kér le újra
});
tt('sitemap-index legfeljebb 2 szint mélyen', async () => {
  const naplo = [];
  await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ 'https://agent.minimax.io/robots.txt': { body: 'Sitemap: https://agent.minimax.io/a.xml' },
    'https://agent.minimax.io/a.xml': { body: index(['https://agent.minimax.io/b.xml']) },
    'https://agent.minimax.io/b.xml': { body: index(['https://agent.minimax.io/c.xml']) },
    'https://agent.minimax.io/c.xml': { body: index(['https://agent.minimax.io/d.xml']) },
    'https://agent.minimax.io/d.xml': { body: urlset(['https://agent.minimax.io/help/d']) } }, naplo) });
  assert.ok(naplo.includes('https://agent.minimax.io/c.xml'));
  assert.ok(!naplo.includes('https://agent.minimax.io/d.xml'));
});
tt('5000 URL felett megáll', async () => {
  const sok = n => Array.from({ length: n }, (_, i) => `https://agent.minimax.io/docs/p${i}`);
  const robots = { 'https://agent.minimax.io/robots.txt': { body: 'Sitemap: https://agent.minimax.io/sitemap.xml' } };
  // 6000 súgó-jellegű <loc> → legfeljebb 400 jelölt
  const l = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ ...robots, 'https://agent.minimax.io/sitemap.xml': { body: urlset(sok(6000)) } }) });
  assert.equal(l.length, JELOLT_MAX);
  // az első 5000 <loc> nem súgó-jellegű, a 6000-ig következők igen → a feldolgozás 5000 után megállt, nincs jelölt
  const hatarlista = [...Array.from({ length: URL_MAX }, (_, i) => `https://agent.minimax.io/pricing/${i}`), ...sok(1000)];
  const m = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ ...robots, 'https://agent.minimax.io/sitemap.xml': { body: urlset(hatarlista) } }) });
  assert.deepEqual(m, []);
  // az 5000. még beolvasódik, a 5001. már nem
  const n = await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: hamis({ ...robots, 'https://agent.minimax.io/sitemap.xml': { body: urlset([...hatarlista.slice(0, URL_MAX - 1), 'https://agent.minimax.io/help/utolso', 'https://agent.minimax.io/help/tul']) } }) });
  assert.deepEqual(n.map(x => x.url), ['https://agent.minimax.io/help/utolso']);
});
tt('kivétel / időtúllépés: üres lista, nem dob', async () => {
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: async () => { throw new Error('x'); } }), []);
  // időtúllépés: a kérés jelzése lejár → a fetch elutasít
  const lassu = (url, o) => o.signal.aborted ? Promise.reject(o.signal.reason) : new Promise((_, nem) => o.signal.addEventListener('abort', () => nem(o.signal.reason)));
  const regi = AbortSignal.timeout;
  AbortSignal.timeout = () => AbortSignal.abort(new Error('timeout'));
  try { assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: lassu }), []); } finally { AbortSignal.timeout = regi; }
});
tt('kérés-fejlécek: közös UA, Accept-Language, időkorlát', async () => {
  const hivasok = [];
  await felfedez('MiniMax Code', { toolLinks: TL, fetchFn: async (u, o) => { hivasok.push(o); return { ok: false, status: 404, text: async () => '' }; } });
  assert.ok(hivasok.length > 0);
  for (const o of hivasok) {
    assert.equal(o.headers['User-Agent'], UA);
    assert.equal(o.headers['Accept-Language'], 'en-US,en;q=0.9');
    assert.ok(o.signal instanceof AbortSignal);
  }
});
tt('cache: második hívás nem kér le semmit', async () => {
  const cache = {}, naplo = [], lap = { 'https://agent.minimax.io/docs/llms.txt': { body: LLMS } };
  const a = await felfedez('MiniMax Code', { toolLinks: TL, cache, fetchFn: hamis(lap, naplo) });
  const elso = naplo.length;
  assert.ok(elso > 0 && a.length === 2);
  const b = await felfedez('MiniMax Code', { toolLinks: TL, cache, fetchFn: hamis(lap, naplo) });
  assert.equal(naplo.length, elso);
  assert.deepEqual(b, a);
  // az üres eredmény is gyorsítótárazódik
  const cache2 = {}, naplo2 = [];
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, cache: cache2, fetchFn: hamis({}, naplo2) }), []);
  const n2 = naplo2.length;
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, cache: cache2, fetchFn: hamis({}, naplo2) }), []);
  assert.equal(naplo2.length, n2);
});
tt('kikapcsolva: egyetlen kérés sem', async () => {
  const naplo = [];
  assert.deepEqual(await felfedez('MiniMax Code', { toolLinks: TL, be: false, fetchFn: hamis({}, naplo) }), []);
  assert.equal(naplo.length, 0);
});
tt('ENGEDELY-hoston nincs kérés', async () => {
  const naplo = [];
  assert.deepEqual(await felfedez('Brave Leo', { toolLinks: { tools: { 'Brave Leo': 'https://brave.com/leo/' } }, fetchFn: hamis({}, naplo) }), []);
  assert.equal(naplo.length, 0);
});
tt('ismeretlen eszköz: nincs kérés', async () => {
  const naplo = [];
  assert.deepEqual(await felfedez('Nincs Ilyen', { toolLinks: TL, fetchFn: hamis({}, naplo) }), []);
  assert.equal(naplo.length, 0);
});

await lanc;

if (hiba) { console.log(`\n❌ sugo-felfedezo.test: ${hiba} hiba`); process.exit(1); }
console.log(`\n✅ sugo-felfedezo.test: mind a ${pass} eset rendben`);
