// ===================================================================
// TESZT — a közös forrás-letöltő (core/forras-letoltes.js)
// ===================================================================
// INGYENES, hálózat nélküli: minden letöltés hamis `fetchImpl`-en megy. Fut: node core/run-tests.js
//
// MIÉRT VAN (2026-11-01): a híríró eddig csak a hírfolyam rövid összefoglalóját kapta, a forrásoldalt
// soha nem töltötte le → legalább 12 hírben írta, hogy „a forrás nem közli” a lépéseket / az árat,
// holott közölte. A letöltő mostantól az íróé ÉS a tény-ellenőrzőé is — ha itt elromlik valami
// (újrapróba, szóközös link, Blogger-tartalék), mindkettő vakon marad, és ezt kívülről nem látni.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import {
  BONGESZO_FEJLEC, tisztaUrl, forrasLetoltes, bloggerBlog, bloggerHirfolyamUrl, linkKulcs, hirfolyamTetelek,
  latottLinkek, htmlSzoveg
} from './forras-letoltes.js';
import { MIN_FORRAS } from './friss-tenyellenorzes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0, bukott = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

// ── hamis hálózat ───────────────────────────────────────────────────
const valasz = (status, body = '', tipus = 'text/html; charset=utf-8') =>
  new Response(status === 204 ? null : body, { status, headers: { 'content-type': tipus } });
const idotullepes = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const halozati = kod => Object.assign(new TypeError('fetch failed'), { cause: { code: kod } });

/** Sorban adja a válaszokat (függvény = dobás vagy egyedi válasz), és feljegyzi a hívásokat. */
function hamisFetch(...lepesek) {
  const hivasok = [];
  const f = async (url, opts) => {
    hivasok.push({ url, opts });
    const l = lepesek[Math.min(hivasok.length - 1, lepesek.length - 1)];
    if (typeof l === 'function') return l(url, opts);
    return l;
  };
  f.hivasok = hivasok;
  return f;
}

const HOSSZU_HTML = '<html><head><script>var x=1;</script><style>p{}</style></head><body><nav>Menü Menü</nav><main><h1>New plan</h1><p>'
  + 'The new Pro plan costs $20 per month and you turn it on under Settings, then Billing. '.repeat(20)
  + '</p></main><footer>Lábléc</footer></body></html>';
const ROVID_HTML = '<html><body><p>Please enable JavaScript to continue.</p></body></html>';
const GYORS = { varakozasMs: 0 };

// ── tisztaUrl ───────────────────────────────────────────────────────
await t('tisztaUrl: a Dropbox-hírfolyam szóközös linkje levágva', () => {
  assert.equal(tisztaUrl('  https://blog.dropbox.com/topics/news/work-seamlessly-with-dropbox-in-claude '), 'https://blog.dropbox.com/topics/news/work-seamlessly-with-dropbox-in-claude');
  assert.equal(tisztaUrl('\n\thttp://workspaceupdates.googleblog.com/2026/07/x.html\n'), 'http://workspaceupdates.googleblog.com/2026/07/x.html');
});

await t('tisztaUrl: nem http(s) → null', () => {
  for (const rossz of ['', '   ', 'ftp://x.com/a', 'javascript:alert(1)', '/relativ/ut', 'https://', 'blog.dropbox.com/x', null, undefined, 42, {}]) {
    assert.equal(tisztaUrl(rossz), null, JSON.stringify(rossz));
  }
});

await t('latottLinkek: a RÉGI, szóközös seen-items bejegyzés a levágott új linkre is talál (különben a régi Dropbox-hírek újként jönnének vissza)', () => {
  const latott = latottLinkek(['  https://blog.dropbox.com/topics/company/a ', 'https://openai.com/index/b', null]);
  assert.equal(latott.has('https://blog.dropbox.com/topics/company/a'), true);
  assert.equal(latott.has('https://openai.com/index/b'), true);
  assert.equal(latott.has(tisztaUrl('  https://blog.dropbox.com/topics/company/a ')), true);
  assert.equal(latottLinkek(undefined).size, 0);
});

await t('htmlSzoveg: megjegyzés és szkript nélkül, max karakterre vágva', () => {
  assert.equal(htmlSzoveg('<!-- <a href="x"> --><p>Hello <b>world</b></p><script>x()</script>', 100), 'Hello world');
  assert.equal(htmlSzoveg('<p>' + 'a'.repeat(50) + '</p>', 10), 'a'.repeat(10));
  assert.equal(htmlSzoveg(null, 10), '');
});

await t('htmlSzoveg: a számmal kódolt aposztróf / per jel megmarad („that s” helyett „that’s”), a < > & nem lesz tag', () => {
  assert.equal(htmlSzoveg('<p>that&#x27;s $20&#x2F;month &#8212; ok&hellip;</p>', 100), "that's $20/month — ok…");
  // A kódolt „<b>” szövegként (nem tagként) érkezik: a közös tisztító az entitást szóközre cseréli, tag nem lesz belőle.
  assert.equal(htmlSzoveg('<p>a &#60;b&#62;vastag&#60;/b&#62;</p>', 100), 'a b vastag /b');
});

// ── forrasLetoltes: alap ────────────────────────────────────────────
await t('szóközös link: a LEVÁGOTT címet tölti le, böngésző-fejléccel és időkorláttal', async () => {
  const f = hamisFetch(valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('  https://blog.dropbox.com/topics/news/x ', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 1);
  assert.equal(f.hivasok[0].url, 'https://blog.dropbox.com/topics/news/x');
  assert.equal(f.hivasok[0].opts.headers['User-Agent'], BONGESZO_FEJLEC['User-Agent']);
  assert.ok(f.hivasok[0].opts.signal, 'nincs AbortSignal → egy lógó oldal megállíthatná az írót');
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://blog.dropbox.com/topics/news/x');
  assert.equal(r.status, 200);
  assert.equal(r.via, 'html');
  assert.equal(r.hiba, null);
  assert.ok(r.text.length >= MIN_FORRAS);
  assert.match(r.text, /\$20 per month/);
  assert.doesNotMatch(r.text, /var x=1|Menü|Lábléc/, 'szkript / menü / lábléc maradt a szövegben');
});

await t('HTML-megjegyzés (belső „>”-vel is) nem hagy „-->” maradékot a szövegben', async () => {
  const html = '<!-- <link rel="preload" href="x.css"> --><!--[if IE]><p>régi</p><![endif]-->' + HOSSZU_HTML;
  const r = await forrasLetoltes('https://blog.dropbox.com/x', { fetchImpl: hamisFetch(valasz(200, html)), ...GYORS });
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.text, /-->|régi/);
  assert.match(r.text, /^New plan/);
});

await t('a böngésző-fejléc UGYANAZ a Chrome-azonosító, mint a core/guide-links.js-ben', () => {
  const gl = readFileSync(join(__dirname, 'guide-links.js'), 'utf-8');
  assert.ok(gl.includes(BONGESZO_FEJLEC['User-Agent']), 'eltért a guide-links.js böngésző-azonosítójától');
  assert.equal(BONGESZO_FEJLEC['Accept-Language'], 'en-US,en;q=0.9');
  assert.match(BONGESZO_FEJLEC.Accept, /^text\/html/);
});

await t('nem http(s) link → hiba, letöltés nélkül', async () => {
  const f = hamisFetch(valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('mailto:x@example.com', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 0);
  assert.deepEqual({ ok: r.ok, status: r.status, via: r.via, text: r.text, hiba: r.hiba }, { ok: false, status: null, via: null, text: '', hiba: 'nem http(s) link' });
});

await t('HTTP 403 → hiba „HTTP 403”, NINCS újrapróba', async () => {
  const f = hamisFetch(valasz(403, 'Forbidden'), valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://openai.com/index/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 1);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.hiba, 'HTTP 403');
  assert.equal(r.text, '');
});

await t('HTTP 404 → nincs újrapróba', async () => {
  const f = hamisFetch(valasz(404, 'Not found'), valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 1);
  assert.equal(r.hiba, 'HTTP 404');
});

await t('HTTP 429 → egy újrapróba, utána siker', async () => {
  const f = hamisFetch(valasz(429, 'Too many'), valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 2);
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.via, 'html');
});

await t('HTTP 429 kétszer → „HTTP 429”, legfeljebb `ujraproba` újrapróba', async () => {
  const f = hamisFetch(valasz(429, ''), valasz(429, ''), valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 2);
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.equal(r.hiba, 'HTTP 429');
  const f0 = hamisFetch(valasz(503, ''), valasz(200, HOSSZU_HTML));
  const r0 = await forrasLetoltes('https://example.com/x', { fetchImpl: f0, ujraproba: 0, ...GYORS });
  assert.equal(f0.hivasok.length, 1, 'ujraproba: 0 mellett is újrapróbált');
  assert.equal(r0.hiba, 'HTTP 503');
});

await t('HTTP 503 → újrapróba', async () => {
  const f = hamisFetch(valasz(503, ''), valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 2);
  assert.equal(r.ok, true);
});

await t('a várakozás tényleg megtörténik az újrapróba előtt (varakozasMs)', async () => {
  const f = hamisFetch(valasz(429, ''), valasz(200, HOSSZU_HTML));
  const t0 = Date.now();
  await forrasLetoltes('https://example.com/x', { fetchImpl: f, varakozasMs: 60 });
  assert.ok(Date.now() - t0 >= 50, `csak ${Date.now() - t0} ms telt el`);
});

await t('időtúllépés → „időtúllépés (20 mp)”, egy újrapróbával', async () => {
  const f = hamisFetch(() => { throw idotullepes(); });
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 2);
  assert.deepEqual({ ok: r.ok, status: r.status, via: r.via, hiba: r.hiba }, { ok: false, status: null, via: null, hiba: 'időtúllépés (20 mp)' });
  const r5 = await forrasLetoltes('https://example.com/x', { fetchImpl: hamisFetch(() => { throw idotullepes(); }), timeoutMs: 5000, ...GYORS });
  assert.equal(r5.hiba, 'időtúllépés (5 mp)');
});

await t('időtúllépés után a második próba sikerül → ok', async () => {
  const f = hamisFetch(() => { throw idotullepes(); }, valasz(200, HOSSZU_HTML));
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(r.ok, true);
});

await t('hálózati hiba → „hálózati hiba (ECONNRESET)”, újrapróbával', async () => {
  const f = hamisFetch(() => { throw halozati('ECONNRESET'); });
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 2);
  assert.equal(r.ok, false);
  assert.match(r.hiba, /^hálózati hiba/);
  assert.equal(r.hiba, 'hálózati hiba (ECONNRESET)');
});

await t('a fetch furcsa dobása (nem Error) sem dob kivételt a hívóra', async () => {
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: async () => { throw 'valami'; }, ...GYORS });   // eslint-disable-line no-throw-literal
  assert.equal(r.ok, false);
  assert.equal(r.hiba, 'hálózati hiba');
});

await t('rövid szöveg → ok:false, „túl rövid szöveg (N karakter)”, a szöveg megmarad', async () => {
  const f = hamisFetch(valasz(200, ROVID_HTML));
  const r = await forrasLetoltes('https://openai.com/index/x', { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 1, 'nem-Blogger oldalnál nincs tartalék-letöltés');
  assert.equal(r.ok, false);
  assert.equal(r.via, 'html');
  assert.equal(r.status, 200);
  assert.equal(r.text, 'Please enable JavaScript to continue.');
  assert.equal(r.hiba, `túl rövid szöveg (${r.text.length} karakter)`);
});

await t('maxChars: a szöveg legfeljebb ennyi karakter', async () => {
  const r = await forrasLetoltes('https://example.com/x', { fetchImpl: hamisFetch(valasz(200, HOSSZU_HTML)), maxChars: 700, ...GYORS });
  assert.equal(r.ok, true);
  assert.equal(r.text.length, 700);
});

await t('nem szöveges tartalom (PDF) → ok:false, nem lesz belőle szemét-szöveg', async () => {
  const r = await forrasLetoltes('https://example.com/x.pdf', { fetchImpl: hamisFetch(valasz(200, '%PDF-1.7 ...', 'application/pdf')), ...GYORS });
  assert.equal(r.ok, false);
  assert.equal(r.text, '');
  assert.equal(r.hiba, 'nem szöveges tartalom (application/pdf)');
});

// ── Blogger-tartalék ────────────────────────────────────────────────
const CIKK = 'http://workspaceupdates.googleblog.com/2026/07/use-gemini-in-google-forms-to-quickly-create-a-new-quiz.html';
const BEJEGYZES = '<p>' + 'Gemini in Google Forms can now draft a quiz from your Docs. Admins: available by default. '.repeat(12) + '</p>';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const RSS = `<?xml version='1.0' encoding='UTF-8'?><rss version="2.0"><channel><title>Workspace Updates</title>
<item><guid isPermaLink="false">tag:blogger.com,1999:blog-1.post-1</guid><title>Weekly Recap</title><description>${esc('<p>' + 'Other post. '.repeat(80) + '</p>')}</description><link>https://workspaceupdates.googleblog.com/2026/07/weekly-recap-07-31-2026.html</link></item>
<item><guid isPermaLink="false">tag:blogger.com,1999:blog-1.post-2</guid><title>Use Gemini in Google Forms to quickly create a new quiz</title><description>${esc(BEJEGYZES)}</description><link>https://workspaceupdates.googleblog.com/2026/07/use-gemini-in-google-forms-to-quickly-create-a-new-quiz.html</link></item>
</channel></rss>`;

await t('Blogger: a host felismerése', () => {
  assert.equal(bloggerBlog('http://workspaceupdates.googleblog.com/2026/07/x.html'), true);
  assert.equal(bloggerBlog('https://developers.googleblog.com/x'), true);
  assert.equal(bloggerBlog('https://blog.google/products/gemini/x/'), false);
  assert.equal(bloggerBlog('https://googleblog.com.evil.example/x'), false);
  assert.equal(bloggerBlog('nem url'), false);
});

await t('Blogger: hírcsatorna-cím redirect=false-szal (különben FeedBurner) és a hónap dátumablakával', () => {
  const u = new URL(bloggerHirfolyamUrl(CIKK));
  assert.equal(u.origin + u.pathname, 'https://workspaceupdates.googleblog.com/feeds/posts/default');
  assert.equal(u.searchParams.get('alt'), 'rss');
  assert.equal(u.searchParams.get('redirect'), 'false');
  assert.equal(u.searchParams.get('published-min'), '2026-06-28T00:00:00Z');
  assert.equal(u.searchParams.get('published-max'), '2026-08-04T00:00:00Z');
  const dec = new URL(bloggerHirfolyamUrl('https://workspaceupdates.googleblog.com/2026/12/x.html'));
  assert.equal(dec.searchParams.get('published-max'), '2027-01-04T00:00:00Z', 'decemberből januárba átfordulás');
  const nincsDatum = new URL(bloggerHirfolyamUrl('https://x.blogspot.com/p/rolunk.html'));
  assert.equal(nincsDatum.searchParams.get('max-results'), '50');
  assert.equal(nincsDatum.searchParams.get('published-min'), null);
});

await t('linkKulcs: protokoll, query, hash, záró perjel és kis-nagybetű nem számít', () => {
  assert.equal(linkKulcs('http://WorkspaceUpdates.googleblog.com/2026/07/A-b.html?m=1#more'), linkKulcs('https://workspaceupdates.googleblog.com/2026/07/a-b.html'));
  assert.equal(linkKulcs('https://www.blog.dropbox.com/x/'), linkKulcs('https://blog.dropbox.com/x'));
  assert.notEqual(linkKulcs('https://a.googleblog.com/2026/07/x.html'), linkKulcs('https://a.googleblog.com/2026/07/y.html'));
  assert.equal(linkKulcs('nem url'), null);
});

await t('Blogger-tartalék: a HTML elbukik (429 kétszer) → a bejegyzés a hírcsatornából, via:"rss"', async () => {
  const f = hamisFetch(valasz(429, ''), valasz(429, ''), valasz(200, RSS, 'text/xml; charset=utf-8'));
  const r = await forrasLetoltes(CIKK, { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 3);
  assert.match(f.hivasok[2].url, /\/feeds\/posts\/default\?.*redirect=false/);
  assert.equal(r.ok, true, r.hiba);
  assert.equal(r.via, 'rss');
  assert.equal(r.status, 200);
  assert.equal(r.url, CIKK);
  assert.equal(r.hiba, null);
  assert.match(r.text, /^Use Gemini in Google Forms to quickly create a new quiz/, 'a cím a szöveg elején');
  assert.match(r.text, /draft a quiz from your Docs/);
  assert.doesNotMatch(r.text, /Other post|&lt;|<p>/, 'másik bejegyzés vagy dekódolatlan HTML került a szövegbe');
});

await t('Blogger-tartalék: a HTML túl rövid (pl. JS-oldal) → szintén a hírcsatorna', async () => {
  const f = hamisFetch(valasz(200, ROVID_HTML), valasz(200, RSS, 'application/rss+xml'));
  const r = await forrasLetoltes(CIKK, { fetchImpl: f, ...GYORS });
  assert.equal(r.ok, true, r.hiba);
  assert.equal(r.via, 'rss');
});

await t('Blogger-tartalék: Atom-formátum (entry + rel=alternate link + content) is működik', async () => {
  const atom = `<feed xmlns='http://www.w3.org/2005/Atom'><entry><title type='text'>Use Gemini in Google Forms</title>
<content type='html'>${esc(BEJEGYZES)}</content><link rel='replies' type='text/html' href='http://workspaceupdates.googleblog.com/2026/07/masik.html#comment-form'/>
<link rel='alternate' type='text/html' href='http://workspaceupdates.googleblog.com/2026/07/use-gemini-in-google-forms-to-quickly-create-a-new-quiz.html' title='x'/></entry></feed>`;
  const tetelek = hirfolyamTetelek(atom);
  assert.equal(tetelek.length, 1);
  assert.deepEqual(tetelek[0].linkek, ['http://workspaceupdates.googleblog.com/2026/07/use-gemini-in-google-forms-to-quickly-create-a-new-quiz.html']);
  const r = await forrasLetoltes(CIKK, { fetchImpl: hamisFetch(valasz(403, ''), valasz(200, atom, 'application/atom+xml')), ...GYORS });
  assert.equal(r.ok, true, r.hiba);
  assert.equal(r.via, 'rss');
});

await t('Blogger-tartalék: CDATA-tartalom is', () => {
  const xml = `<rss><channel><item><title><![CDATA[Cím & más]]></title><link>https://a.googleblog.com/2026/07/x.html</link><description><![CDATA[<p>Szöveg &amp; kód</p>]]></description></item></channel></rss>`;
  const [e] = hirfolyamTetelek(xml);
  assert.equal(e.cim, 'Cím & más');
  assert.equal(e.html, '<p>Szöveg &amp; kód</p>');
});

await t('Blogger-tartalék: nincs a hírcsatornában → ok:false, mindkét ok a hibában', async () => {
  const f = hamisFetch(valasz(403, ''), valasz(200, RSS, 'text/xml'));
  const r = await forrasLetoltes('http://workspaceupdates.googleblog.com/2026/07/nem-letezik.html', { fetchImpl: f, ...GYORS });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.hiba, 'HTTP 403; RSS-tartalék: nincs a hírcsatornában');
});

await t('Blogger-tartalék: ha a HTML rendben van, a hírcsatornát le sem tölti', async () => {
  const f = hamisFetch(valasz(200, HOSSZU_HTML), valasz(200, RSS, 'text/xml'));
  const r = await forrasLetoltes(CIKK, { fetchImpl: f, ...GYORS });
  assert.equal(f.hivasok.length, 1);
  assert.equal(r.via, 'html');
});

// ── CLI-őr ──────────────────────────────────────────────────────────
const MODUL = join(__dirname, 'forras-letoltes.js');

await t('importkor NEM fut a CLI (akkor sem, ha a parancssorban --proba áll)', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(pathToFileURL(MODUL).href)}); console.log('IMPORT-OK');`, '--', '--proba', 'nem-url'],
    { encoding: 'utf-8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'IMPORT-OK', 'az import a CLI-t is lefuttatta: ' + r.stdout.slice(0, 200));
});

await t('közvetlen futtatáskor a CLI fut (hálózat nélkül: nem-http linkkel)', () => {
  const r = spawnSync(process.execPath, [MODUL, '--proba', 'nem-url ftp://x'], { encoding: 'utf-8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nem http\(s\) link {2}"nem-url"/);
  assert.match(r.stdout, /"ftp:\/\/x"/);
  assert.match(r.stdout, /0\/2 forrás rendben/);
  const ures = spawnSync(process.execPath, [MODUL], { encoding: 'utf-8', timeout: 30000 });
  assert.equal(ures.status, 2);
  assert.match(ures.stdout, /Használat/);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} forras-letoltes.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
