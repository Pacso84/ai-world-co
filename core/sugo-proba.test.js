// core/sugo-proba.test.js — a CI-próba logikája. Ingyenes, HÁLÓZAT NÉLKÜLI (a letöltés be van adva).
// A fixtúrák saját, kitalált címek — valódi súgószöveg nincs bennük.
import assert from 'node:assert/strict';
import { probaKulcs, MIN_HOSSZ } from './sugo-proba.js';

const index = async () => ({ ok: true, text: async () => '<loc>https://www.perplexity.ai/help-center/en/articles/1-a</loc><loc>https://www.perplexity.ai/help-center/en/articles/2-b</loc>' });
const hosszu = async url => ({ szoveg: 'x'.repeat(400), cim: url });
const ures = async () => null;

let r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: hosszu });
assert.equal(r.ok, true); assert.equal(r.cikkek, 2); assert.equal(r.minta.length, 2);
assert.equal(r.minta[0].hossz, 400); assert.equal(r.miert, 'rendben');

r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: ures });
assert.equal(r.ok, false); assert.match(r.miert, /szöveg/);

r = await probaKulcs('perplexity', { fetchFn: async () => { throw new Error('403'); }, cikkSzovegFn: hosszu });
assert.equal(r.ok, false); assert.equal(r.cikkek, 0); assert.match(r.miert, /0 cikk/);

r = await probaKulcs('nincs-ilyen', { fetchFn: index, cikkSzovegFn: hosszu });
assert.equal(r.ok, false);

// rövid szöveg (a küszöb alatt) nem számít olvashatónak
r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: async u => ({ szoveg: 'x'.repeat(MIN_HOSSZ - 1), cim: u }) });
assert.equal(r.ok, false);

// kivétel a szövegletöltőben sem állítja meg a próbát
r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: async () => { throw new Error('x'); } });
assert.equal(r.ok, false);

// mintavétel: n=2 → az első és a KÖZÉPSŐ; sok cikknél nem az első kettő
const sok = async () => ({ ok: true, text: async () => Array.from({ length: 9 }, (_, i) => `<loc>https://www.perplexity.ai/help-center/en/articles/${i + 1}-x</loc>`).join('') });
r = await probaKulcs('perplexity', { fetchFn: sok, cikkSzovegFn: hosszu });
assert.equal(r.cikkek, 9); assert.equal(r.minta.length, 2);
assert.match(r.minta[0].url, /articles\/1-x/); assert.match(r.minta[1].url, /articles\/5-x/);

console.log('sugo-proba.test.js: minden rendben');
