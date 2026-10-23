// core/kitoltheto-prompt.js — kitölthető prompt az útmutatókban (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a veszély nem az, hogy egy helykitöltő NEM lesz mező, hanem hogy
// (1) a helykitöltő nélküli prompt megváltozik, (2) álhelykitöltőből ([REDACTED], [====>],
// számlista) mező lesz, (3) az üresen hagyott mező lyukat hagy a kimásolt szövegben.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { kitolthetoHtml, kitoltottSzoveg, igaziHelykitolto } from './kitoltheto-prompt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');

// 1) helykitöltő nélkül a doboz BÁJTRA ugyanaz (369-ből ~329 ilyen)
assert.equal(kitolthetoHtml('Summarize this file.'), 'Summarize this file.');

// 2) igazi helykitöltő → mező
{
  const h = kitolthetoHtml('Write to [name] about [topic].');
  assert.equal((h.match(/<input class="g-fill"/g) || []).length, 2);
  assert.match(h, /placeholder="name"/);
  assert.match(h, /data-h="topic"/);
  assert.ok(h.startsWith('Write to <input'), 'a környező szöveg maradjon');
}

// 3) álhelykitöltők szövegként maradnak
for (const x of ['REDACTED', '===============================>', '1200, 350, 80, 45', 'x'.repeat(51), 'A', '', 'email protected'])
  assert.equal(igaziHelykitolto(x), false, 'mező lett belőle: ' + x);
for (const x of ['meeting name', 'paste job ad here', 'oszlop neve', 'nombre', 'PASTE INPUT'])
  assert.equal(igaziHelykitolto(x), true, 'nem lett mező: ' + x);
assert.equal(kitolthetoHtml('[REDACTED] and [1200, 350]'), '[REDACTED] and [1200, 350]');

// 4) markdown-link nem helykitöltő
assert.equal(kitolthetoHtml('see [docs](https://x.example)'), 'see [docs](https://x.example)');

// 5) kill-switch
assert.equal(kitolthetoHtml('Hi [name]', false), 'Hi [name]');

// 6) másolás: üres mező → az eredeti helykitöltő marad, nem lyuk
assert.equal(kitoltottSzoveg('Hi [name], re [topic].', ['Ann', '  ']), 'Hi Ann, re [topic].');
assert.equal(kitoltottSzoveg('No fields.', []), 'No fields.');
assert.equal(kitoltottSzoveg('[REDACTED] for [name]', ['Bob']), '[REDACTED] for Bob', 'az álhelykitöltő nem fogyaszt értéket');

// 7) a bemenet már escape-elt szöveg: az attribútumból nem lehet kitörni
assert.ok(!/placeholder="a"/.test(kitolthetoHtml('[a&quot;b]')));
assert.ok(!kitolthetoHtml('[a"b]').includes('placeholder="a"b"'));

console.log('✅ kitoltheto-prompt: modul rendben');
