// ===================================================================
// TESZT — a híríró forrásszövege (core/iro-forras.js)
// ===================================================================
// INGYENES, hálózat nélküli (hamis letöltő / hamis fetch). Fut: node core/run-tests.js
//
// MIÉRT VAN (2026-11-01): az író eddig csak a hírfolyam 120–500 karakteres kivonatát kapta, ezért írta
// legalább 12 hírben, hogy „a forrás nem közli” a lépéseket / az árat. Ha a (a) hírfolyam-szöveg →
// (b) letöltés → (c) kivonat sorrend, a keret vagy a vészkapcsoló elromlik, az író csendben visszaesik
// a kivonatra — kívülről ugyanúgy néz ki, mint ha nem lett volna dolga.
// ===================================================================

import assert from 'assert/strict';
import {
  FORRAS_LETOLTES_BE, DRAFT_FORRAS_MAX, OSSZEVONT_FORRAS_MAX, LETOLTES_MAX, ATFEDES_FIGYELMEZTET,
  forrasKeret, vazlatForras, cikkForrasai, forrasOsszefuz, leghosszabbKozosSzosor, cikkForrasMeta, cikkKivonatSzoveg
} from './iro-forras.js';
import { forrasKulcs } from './forras-cache.js';
import { MIN_FORRAS } from './friss-tenyellenorzes.js';

let pass = 0, bukott = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const HOSSZU = n => 'The Pro plan costs $20 per month; open Settings, then Billing, then Upgrade. '.repeat(Math.ceil(n / 77)).slice(0, n);
const KIVONAT = 'OpenAI announced a new feature for teams.';

/** Hamis letöltő: feljegyzi a hívásokat, és a megadott eredményt adja. */
function hamisLetolto(eredmeny) {
  const hivasok = [];
  const f = async (url, opts) => {
    hivasok.push({ url, opts });
    const r = typeof eredmeny === 'function' ? await eredmeny(url, opts) : eredmeny;
    return { url, ...r };
  };
  f.hivasok = hivasok;
  return f;
}
const SIKER = { ok: true, status: 200, via: 'html', text: HOSSZU(7000), hiba: null };
const BUKAS = { ok: false, status: 403, via: null, text: '', hiba: 'HTTP 403' };

const vazlat = (extra = {}) => ({ title: 'New feature', link: 'https://openai.com/index/x', content_snippet: KIVONAT, content_full: KIVONAT, ...extra });

// ── kapcsoló és keret ───────────────────────────────────────────────
await t('🔌 a vészkapcsoló kód-konstans, és BE van kapcsolva', () => {
  assert.equal(typeof FORRAS_LETOLTES_BE, 'boolean');
  assert.equal(FORRAS_LETOLTES_BE, true);
});

await t('🔌 kikapcsolva (letoltesBe:false) tényleg NINCS letöltés, és a napló megmondja, miért rövid a forrás', async () => {
  const l = hamisLetolto(SIKER);
  const r = await cikkForrasai([vazlat()], { letoltesBe: false, letolto: l });
  assert.equal(l.hivasok.length, 0);
  assert.equal(r.reszek[0].via, 'kivonat');
  assert.equal(r.reszek[0].text, KIVONAT);
  assert.equal(r.reszek[0].hiba, 'a letöltés ki van kapcsolva');
});

await t('keret: 1 hír → 6000, összevont cikk → együtt legfeljebb 9000', () => {
  assert.equal(DRAFT_FORRAS_MAX, 6000);
  assert.equal(OSSZEVONT_FORRAS_MAX, 9000);
  assert.equal(forrasKeret(1), 6000);
  assert.equal(forrasKeret(2), 4500);
  assert.equal(forrasKeret(3), 3000);
  assert.equal(forrasKeret(0), 6000);
  assert.equal(forrasKeret(undefined), 6000);
});

// ── (a) → (b) → (c) ────────────────────────────────────────────────
await t('(a) a hírfolyam teljes szövege (≥ MIN_FORRAS) → azt kapja, letöltés NÉLKÜL', async () => {
  const l = hamisLetolto(SIKER);
  const full = '<div><p>' + HOSSZU(5000) + '</p><script>x()</script></div>';
  const r = await vazlatForras(vazlat({ content_full: full }), { letolto: l });
  assert.equal(l.hivasok.length, 0);
  assert.equal(r.via, 'hirfolyam');
  assert.equal(r.text.length, 5000);
  assert.doesNotMatch(r.text, /<p>|x\(\)/);
  assert.equal(r.letoltes, null);
});

await t('(b) rövid hírfolyam-szöveg + link → letöltés (levágott link, maxChars 8000)', async () => {
  const l = hamisLetolto(SIKER);
  const r = await vazlatForras(vazlat({ link: '  https://blog.dropbox.com/topics/news/x ' }), { letolto: l });
  assert.equal(l.hivasok.length, 1);
  assert.equal(l.hivasok[0].url, 'https://blog.dropbox.com/topics/news/x');
  assert.equal(l.hivasok[0].opts.maxChars, LETOLTES_MAX);
  assert.equal(LETOLTES_MAX, 8000);
  assert.equal(r.via, 'html');
  assert.equal(r.text.length, 7000);
  assert.equal(r.letoltes.ok, true);
});

await t('(b) a Blogger-tartalék (via:"rss") is átjön', async () => {
  const r = await vazlatForras(vazlat({ link: 'http://workspaceupdates.googleblog.com/2026/10/x.html' }), { letolto: hamisLetolto({ ...SIKER, via: 'rss' }) });
  assert.equal(r.via, 'rss');
});

await t('🔒 a vázlat-objektumot NEM módosítja (a content/drafts a nyilvános gitben van)', async () => {
  const v = vazlat();
  const elotte = JSON.stringify(v);
  await cikkForrasai([v], { letolto: hamisLetolto(SIKER) });
  assert.equal(JSON.stringify(v), elotte);
});

await t('🔒 a cikk _meta-jába NEM kerül forrásSZÖVEG — csak kulcs, hossz, fajta (nyilvános repó)', async () => {
  const lista = [vazlat({ link: '  https://openai.com/index/x ' }), vazlat({ link: 'https://openai.com/index/y' })];
  const forras = await cikkForrasai(lista, { letolto: hamisLetolto(SIKER) });
  const meta = cikkForrasMeta(lista, forras);
  assert.equal('source_text' in meta, false);
  const json = JSON.stringify(meta);
  assert.ok(!json.includes(HOSSZU(200)), 'a letöltött szöveg egy darabja a _meta-ba szivárgott');
  assert.ok(json.length < 1500, 'gyanúsan nagy _meta: ' + json.length + ' kar.');
  assert.deepEqual(meta.source_text_via, ['html', 'html']);
  assert.equal(meta.source_text_len, forras.osszes.length);
  assert.equal(meta.source_text_key, forrasKulcs(['https://openai.com/index/x', 'https://openai.com/index/y']));
  assert.equal(meta.source_link, 'https://openai.com/index/x');
  // 🔒 2026-11-03: a kivonat sem kerül a _meta-ba (privát tár) — csak a hossza; a szöveg a cikkKivonatSzoveg-ből jön.
  assert.equal('source_snippet' in meta, false);
  assert.equal(cikkKivonatSzoveg(lista), KIVONAT + '\n\n---\n\n' + KIVONAT);
  assert.equal(meta.source_snippet_len, cikkKivonatSzoveg(lista).length);
});

await t('(c) a letöltés elbukik (403) → a régi kivonat, a hiba megmarad a naplónak', async () => {
  const r = await vazlatForras(vazlat(), { letolto: hamisLetolto(BUKAS) });
  assert.equal(r.via, 'kivonat');
  assert.equal(r.text, KIVONAT);
  assert.equal(r.letoltes.hiba, 'HTTP 403');
});

await t('(c) a letöltő kivételt dob → az író NEM áll meg, kivonat', async () => {
  const r = await vazlatForras(vazlat(), { letolto: async () => { throw new Error('bumm'); } });
  assert.equal(r.via, 'kivonat');
  assert.equal(r.letoltes.ok, false);
  assert.match(r.letoltes.hiba, /bumm/);
});

await t('(c) nincs (http) link → nincs letöltés, kivonat', async () => {
  const l = hamisLetolto(SIKER);
  const r = await cikkForrasai([vazlat({ link: '' })], { letolto: l });
  assert.equal(l.hivasok.length, 0);
  assert.equal(r.reszek[0].via, 'kivonat');
  assert.equal(r.reszek[0].hiba, 'nincs http(s) link');
});

await t('(c) ha a rövid hírfolyam-szöveg hosszabb a kivonatnál, azt kapja', async () => {
  const full = '<p>' + 'Longer feed text with the real price of $20. '.repeat(10) + '</p>';   // < 600 kar., de hosszabb a kivonatnál
  const r = await vazlatForras(vazlat({ content_full: full }), { letolto: hamisLetolto(BUKAS) });
  assert.equal(r.via, 'hirfolyam');
  assert.match(r.text, /\$20/);
});

// ── egy cikk forrásai ───────────────────────────────────────────────
await t('egy hír: a prompt legfeljebb 6000 karaktert kap', async () => {
  const r = await cikkForrasai([vazlat()], { letolto: hamisLetolto(SIKER) });
  assert.equal(r.reszek.length, 1);
  assert.ok(r.reszek[0].text.length <= 6000 && r.reszek[0].text.length >= 5990, String(r.reszek[0].text.length));
  assert.equal(r.reszek[0].letoltve, true);
  assert.equal(r.reszek[0].hiba, null);
  assert.equal(r.osszes, r.reszek[0].text);
});

await t('összevont cikk (2 hír): darabonként 4500, együtt ≤ 9000 + elválasztó', async () => {
  const r = await cikkForrasai([vazlat(), vazlat({ link: 'https://openai.com/index/y' })], { letolto: hamisLetolto(SIKER) });
  for (const x of r.reszek) assert.ok(x.text.length <= 4500 && x.text.length >= 4490, String(x.text.length));
  assert.equal(r.osszes, r.reszek[0].text + '\n\n---\n\n' + r.reszek[1].text);
  assert.ok(r.osszes.length <= OSSZEVONT_FORRAS_MAX + 200);
});

await t('⏱️ a futás letöltési időkerete elfogy → a következő hír már NEM tölt le', async () => {
  let ora = 0;
  const l = hamisLetolto(async () => { ora += 150; return SIKER; });
  const ido = { maradekMs: 100 };
  const r = await cikkForrasai([vazlat(), vazlat({ link: 'https://openai.com/index/y' })], { letolto: l, ido, most: () => ora });
  assert.equal(l.hivasok.length, 1, 'a keret elfogyása után is letöltött');
  assert.equal(r.reszek[0].via, 'html');
  assert.equal(r.reszek[1].via, 'kivonat');
  assert.equal(r.reszek[1].hiba, 'elfogyott a futás letöltési időkerete');
  assert.ok(ido.maradekMs <= 0);
});

await t('⏱️ letöltés nélküli hír (hírfolyam-szöveg) nem fogyasztja az időkeretet', async () => {
  let ora = 0;
  const ido = { maradekMs: 100 };
  await cikkForrasai([vazlat({ content_full: HOSSZU(2000) })], { letolto: hamisLetolto(SIKER), ido, most: () => (ora += 500) });
  assert.equal(ido.maradekMs, 100);
});

await t('a VALÓDI letöltővel (hamis fetch-csel) is végigmegy — az opciók átjutnak', async () => {
  const html = '<html><body><nav>Menü</nav><article><p>' + HOSSZU(2500) + '</p></article></body></html>';
  const hivott = [];
  const fetchImpl = async (url) => { hivott.push(url); return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }); };
  const r = await cikkForrasai([vazlat({ link: ' https://openai.com/index/z ' })], { opciok: { fetchImpl, varakozasMs: 0 } });
  assert.deepEqual(hivott, ['https://openai.com/index/z']);
  assert.equal(r.reszek[0].via, 'html');
  assert.ok(r.reszek[0].text.length >= MIN_FORRAS);
  assert.doesNotMatch(r.reszek[0].text, /Menü/);
});

await t('forrasOsszefuz: üres darabok kimaradnak', () => {
  assert.equal(forrasOsszefuz(['a', '', '  ', 'b']), 'a\n\n---\n\nb');
  assert.equal(forrasOsszefuz([]), '');
});

// ── eredetiség: szó szerinti átfedés ────────────────────────────────
const FORRAS = 'Starting today, Gemini in Google Slides can edit multiple slides or an entire presentation at once with a single prompt in the side panel. Admins can turn it off.';

await t('átfedés: a szó szerint átvett 15+ szavas szakaszt megtalálja (kis-nagybetű, írásjel nem számít)', () => {
  const cikk = `---\ntitle: "Gemini edits whole decks"\n---\n# Gemini edits whole decks\n\nGoogle says that **Gemini in Google Slides can edit multiple slides — or an entire presentation at once, with a single prompt** in the panel.`;
  const r = leghosszabbKozosSzosor(cikk, FORRAS);
  // A közös szakasz az „in the”-vel folytatódik („…prompt in the panel” vs „…prompt in the side panel”).
  assert.equal(r.minta, 'gemini in google slides can edit multiple slides or an entire presentation at once with a single prompt in the');
  assert.equal(r.szavak, 20);
  assert.ok(r.szavak >= ATFEDES_FIGYELMEZTET);
  assert.equal(ATFEDES_FIGYELMEZTET, 15);
});

await t('átfedés: saját szavakkal írt szöveg → rövid közös szakasz, nincs figyelmeztetés', () => {
  const cikk = '# Slides gets bigger edits\n\nYou can now ask Gemini to rework a whole deck in one go from the side panel. Your admin decides whether it is on.';
  const r = leghosszabbKozosSzosor(cikk, FORRAS);
  assert.ok(r.szavak < 8, `túl hosszú közös szakasz: ${r.szavak} („${r.minta}”)`);
});

await t('átfedés: a frontmatter nem számít bele; üres bemenet → 0', () => {
  const r = leghosszabbKozosSzosor(`---\ntitle: "${FORRAS}"\n---\nSemmi közös.`, FORRAS);
  assert.ok(r.szavak <= 1);
  assert.deepEqual(leghosszabbKozosSzosor('', FORRAS), { szavak: 0, minta: '' });
  assert.deepEqual(leghosszabbKozosSzosor('valami', ''), { szavak: 0, minta: '' });
});

await t('átfedés: gyors — 2500 szavas cikk × 1600 szavas forrás 1 mp alatt', () => {
  const szo = i => 'w' + ((i * 7919) % 3001);
  const cikk = Array.from({ length: 2500 }, (_, i) => szo(i)).join(' ');
  const forras = Array.from({ length: 1600 }, (_, i) => szo(i + 100000)).join(' ');
  const t0 = Date.now();
  leghosszabbKozosSzosor(cikk, forras);
  assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} iro-forras.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
