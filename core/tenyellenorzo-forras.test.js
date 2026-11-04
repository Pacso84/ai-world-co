// A tény-ellenőrző hír-forrása (2026-11-01): gyorsítótár → közös letöltő; kihagyás-ok a státusszal.
// Ingyenes, hálózat és lemez nélküli: a letöltőt és a gyorsítótár-olvasót hamisítjuk.
import assert from 'node:assert/strict';
import { hirForrasa, cacheDarabok, forrasBlokk, OSSZ_FORRAS_MAX } from './tenyellenorzo-forras.js';
import { MIN_FORRAS } from './friss-tenyellenorzes.js';

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 tenyellenorzo-forras');

const hosszu = (szo, n = 400) => (szo + ' ').repeat(n).trim();          // > MIN_FORRAS karakter
const SEP = '\n\n---\n\n';                                                // a híríró elválasztója (core/iro-forras.js)
// valódi _meta-alak (content/articles/ARTICLE_2026-10-21…_openai-blog_Franchisee…): source_link + source_links
const meta2 = { source_link: 'https://openai.com/index/a', source_links: ['https://openai.com/index/a', 'https://blog.google/b'] };
const letoltoMinta = valaszok => {
  const hivasok = [];
  const f = async (url, o) => { hivasok.push({ url, o }); return valaszok[url]; };
  f.hivasok = hivasok;
  return f;
};
const nincsCache = () => '';

await t('📦 a gyorsítótár az ELSŐ: ha minden forrás teljes szövegű, nincs letöltés', async () => {
  const letolto = letoltoMinta({});
  const meta = { ...meta2, source_text_via: ['html', 'hirfolyam'] };
  const r = await hirForrasa(meta, { letolto, cacheOlvaso: () => hosszu('alfa') + SEP + hosszu('beta') });
  assert.equal(r.via, 'cache'); assert.equal(r.skip, null); assert.equal(letolto.hivasok.length, 0);
  assert.match(r.forras, /^--- SOURCE 1 \(https:\/\/openai\.com\/index\/a\) ---\nalfa/);
  assert.match(r.forras, /--- SOURCE 2 \(https:\/\/blog\.google\/b\) ---\nbeta/);
});

await t('📦 a gyorsítótár NEM használható, ha valamelyik rész csak kivonat / rövid / más a darabszám → letöltés', async () => {
  const urls = ['https://openai.com/index/a', 'https://blog.google/b'];
  assert.equal(cacheDarabok({ source_text_via: ['html', 'kivonat'] }, hosszu('a') + SEP + hosszu('b'), urls), null, 'kivonat');
  assert.equal(cacheDarabok({ source_text_via: ['html', 'html'] }, hosszu('a') + SEP + 'rövid', urls), null, 'rövid rész');
  assert.equal(cacheDarabok({ source_text_via: ['html'] }, hosszu('a'), urls), null, 'más darabszám');
  assert.equal(cacheDarabok({}, hosszu('a') + SEP + hosszu('b'), urls), null, 'via nélkül (régi cikk)');
  assert.equal(cacheDarabok({ source_text_via: ['html', 'rss'] }, '', urls), null, 'nincs szöveg');
  const letolto = letoltoMinta({ 'https://openai.com/index/a': { ok: true, status: 200, text: hosszu('x') }, 'https://blog.google/b': { ok: true, status: 200, text: hosszu('y') } });
  const r = await hirForrasa({ ...meta2, source_text_via: ['html', 'kivonat'] }, { letolto, cacheOlvaso: () => hosszu('a') + SEP + 'rövid' });
  assert.equal(r.via, 'letoltes'); assert.equal(r.skip, null); assert.equal(letolto.hivasok.length, 2);
  assert.equal(letolto.hivasok[0].o.maxChars, Math.floor(OSSZ_FORRAS_MAX / 2), 'forrásonként a keret fele');
});

await t('⛔ ha akár EGY forrás nem olvasható: kihagyás, az okban a sikeres/összes szám és a HTTP-státusz', async () => {
  const letolto = letoltoMinta({
    'https://openai.com/index/a': { ok: false, status: 403, text: '', hiba: 'HTTP 403' },
    'https://blog.google/b': { ok: true, status: 200, text: hosszu('y') }
  });
  const r = await hirForrasa(meta2, { letolto, cacheOlvaso: nincsCache });
  assert.equal(r.forras, null);
  assert.equal(r.skip, 'a forrás nem olvasható (1/2: HTTP 403)');
  assert.equal(r.status, 403);
});

await t('⛔ túl rövid szöveg, kivétel, hiányzó link: mind kihagyás, érthető okkal', async () => {
  const r1 = await hirForrasa({ source_link: 'https://x.com/a' }, { letolto: async () => ({ ok: true, status: 200, text: 'Enable JavaScript' }), cacheOlvaso: nincsCache });
  assert.match(r1.skip, /^a forrás nem olvasható \(0\/1: túl rövid szöveg \(17 karakter\)\)$/);
  const r2 = await hirForrasa({ source_link: 'https://x.com/a' }, { letolto: async () => { throw new Error('bumm'); }, cacheOlvaso: nincsCache });
  assert.match(r2.skip, /0\/1: váratlan hiba: bumm/);
  const r3 = await hirForrasa({ source_link: '   ' }, { letolto: async () => assert.fail('nem hívhat'), cacheOlvaso: nincsCache });
  assert.match(r3.skip, /0\/0/);
  const r4 = await hirForrasa({ source_link: 'https://x.com/a' }, { letolto: async () => ({ ok: true, status: 200, text: hosszu('z') }), cacheOlvaso: () => { throw new Error('lemez'); } });
  assert.equal(r4.skip, null, 'a gyorsítótár hibája nem állít meg semmit');
});

await t('✂️ a szóközzel kezdődő (Dropbox) link levágva kerül a letöltőhöz', async () => {
  const letolto = letoltoMinta({ 'https://blog.dropbox.com/x': { ok: true, status: 200, text: hosszu('d') } });
  const r = await hirForrasa({ source_link: '  https://blog.dropbox.com/x ' }, { letolto, cacheOlvaso: nincsCache });
  assert.equal(r.skip, null); assert.equal(letolto.hivasok[0].url, 'https://blog.dropbox.com/x');
});

await t('🧱 forrasBlokk és a MIN_FORRAS összhangja', async () => {
  assert.ok(hosszu('a').length >= MIN_FORRAS);
  assert.equal(forrasBlokk([{ url: 'u', szoveg: 's' }]), '--- SOURCE 1 (u) ---\ns');
});

if (hiba) { console.log(`\n❌ tenyellenorzo-forras.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ tenyellenorzo-forras.test: mind rendben');
