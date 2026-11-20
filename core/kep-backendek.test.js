// ===================================================================
// TESZT — borítókép-backendek (core/kep-backendek.js)
// ===================================================================
// INGYENES, hálózat nélküli (a fetch-et kicseréljük). Fut: node core/run-tests.js
//
// MIÉRT (2026-11-20): a borító-TARTALÉK (Hugging Face) hónapok óta halott volt
// (api-inference.huggingface.co nem létezik), ezért a 11-20-i Cloudflare-hiba
// után egy cikk borító nélkül maradt. Most mindkét backend Cloudflare-modell,
// és ez a teszt őrzi a sorrendet + a kérésformát (a klein CSAK multipartot fogad).
// ===================================================================

import assert from 'assert/strict';
import { kepBackendek, KLEIN_FO_MODELL, KLEIN_W, KLEIN_H } from './kep-backendek.js';

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('  ✅ ' + name); };
const ENV = { CLOUDFLARE_FLUX_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acct' };
const KEP = Buffer.alloc(5000, 7).toString('base64');

// Hamis fetch: felírja a hívásokat, és modellenként előre megadott választ ad.
function hamisFetch(valaszok) {
  const hivasok = [];
  const fn = async (url, opts) => {
    hivasok.push({ url, opts });
    const modell = url.split('/').pop();
    const v = valaszok[modell] || { status: 200, body: { result: { image: KEP } } };
    if (v.dob) throw v.dob;
    return { ok: v.status < 300, status: v.status, json: async () => v.body, text: async () => JSON.stringify(v.body) };
  };
  return { fn, hivasok };
}

console.log('🧪 borítókép-backendek\n');

await t('a kapcsoló alapból BE: klein a fő, schnell a tartalék (user 11-20: „rád bízom!”)', () => {
  assert.equal(KLEIN_FO_MODELL, true);
  const nevek = kepBackendek(ENV, hamisFetch({}).fn).map(b => b.name);
  assert.deepEqual(nevek, ['Cloudflare FLUX.2 klein 4B', 'Cloudflare FLUX.1 schnell']);
});

await t('kapcsoló KI → schnell elöl, klein tartalék', () => {
  const nevek = kepBackendek(ENV, hamisFetch({}).fn, { kleinFo: false }).map(b => b.name);
  assert.deepEqual(nevek, ['Cloudflare FLUX.1 schnell', 'Cloudflare FLUX.2 klein 4B']);
});

await t('a halott Hugging Face NINCS a listán (api-inference.huggingface.co megszűnt)', () => {
  const nevek = kepBackendek({ ...ENV, HF_API_KEY: 'x' }, hamisFetch({}).fn).map(b => b.name).join(' ');
  assert.ok(!/hugging/i.test(nevek));
});

await t('klein: multipart (FormData) + 1280×720, a schnell: JSON méret nélkül', async () => {
  const f = hamisFetch({});
  const [klein, schnell] = kepBackendek(ENV, f.fn);
  await klein.fn('egy alma');
  await schnell.fn('egy alma');
  const [k, s] = f.hivasok;
  assert.ok(k.url.endsWith('/ai/run/@cf/black-forest-labs/flux-2-klein-4b'));
  assert.ok(k.opts.body instanceof FormData);
  assert.equal(k.opts.body.get('prompt'), 'egy alma');
  assert.equal(k.opts.body.get('width'), String(KLEIN_W));
  assert.equal(k.opts.body.get('height'), String(KLEIN_H));
  assert.equal(k.opts.headers['Content-Type'], undefined); // a FormData maga teszi a határolót
  assert.ok(k.opts.signal, 'a kleinnek időkorlát kell (lassú, 10–16 mp)');
  assert.ok(s.url.endsWith('/ai/run/@cf/black-forest-labs/flux-1-schnell'));
  assert.deepEqual(JSON.parse(s.opts.body), { prompt: 'egy alma' }); // width/height 08-14 óta TILOS
});

await t('a kép Bufferként jön vissza', async () => {
  const [klein] = kepBackendek(ENV, hamisFetch({}).fn);
  const buf = await klein.fn('x');
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.length, 5000);
});

await t('HTTP-hiba: a hibaüzenet a válasz törzsét is hozza (ne vakon találgassunk)', async () => {
  const [klein] = kepBackendek(ENV, hamisFetch({ 'flux-2-klein-4b': { status: 400, body: { errors: [{ message: 'AiError: rossz' }] } } }).fn);
  await assert.rejects(() => klein.fn('x'), /HTTP 400.*AiError: rossz/);
});

await t('üres eredmény → hiba (nem néma siker)', async () => {
  const [, schnell] = kepBackendek(ENV, hamisFetch({ 'flux-1-schnell': { status: 200, body: { result: {} } } }).fn);
  await assert.rejects(() => schnell.fn('x'), /nincs kép/);
});

await t('kulcs nélkül null (a router továbblép), nem dob', async () => {
  for (const b of kepBackendek({}, hamisFetch({}).fn)) assert.equal(await b.fn('x'), null);
});

console.log(`\n✅ ${pass} teszt rendben`);
