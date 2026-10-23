// core/kitoltheto-prompt.js — kitölthető prompt az útmutatókban (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a veszély nem az, hogy egy helykitöltő NEM lesz mező, hanem hogy
// (1) a helykitöltő nélküli prompt megváltozik, (2) álhelykitöltőből ([REDACTED], [====>],
// számlista) mező lesz, (3) az üresen hagyott mező lyukat hagy a kimásolt szövegben.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { kitolthetoHtml, kitoltottSzoveg, igaziHelykitolto, promptJelolt } from './kitoltheto-prompt.js';

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

// 7b) dőlt idézet (*"…"*) is beírandó prompt — a Prompt-tár (core/prompt-library.js) szabályával egyezően;
//     a burkoló csillag/aláhúzás eltűnik (élőben 10-23 nyersen látszott: *"Tervezz…"*)
assert.deepEqual(promptJelolt('"Hello [name]"'), { prompt: true, szoveg: '"Hello [name]"' });
assert.deepEqual(promptJelolt('*"Plan a trip from [your city]."*'), { prompt: true, szoveg: '"Plan a trip from [your city]."' });
assert.deepEqual(promptJelolt('**„Írj levelet [név] részére.”**'), { prompt: true, szoveg: '„Írj levelet [név] részére.”' });
assert.deepEqual(promptJelolt('_"Hola [nombre]"_ '), { prompt: true, szoveg: '"Hola [nombre]"' });
assert.deepEqual(promptJelolt('nevezd el a chatet *"Smith"* néven.'), { prompt: false, szoveg: 'nevezd el a chatet *"Smith"* néven.' });
// félig burkolt sor (élőben 40 db, pl. *"Google launches …"* → magyarázat) NEM prompt — a régi „Példa” marad
assert.deepEqual(promptJelolt('*"Starts quoted"* but continues after.'), { prompt: false, szoveg: '*"Starts quoted"* but continues after.' });
assert.deepEqual(promptJelolt('*"Google launches Gemini 2.5 Flash-Lite"* → Fast, cheap model'), { prompt: false, szoveg: '*"Google launches Gemini 2.5 Flash-Lite"* → Fast, cheap model' });

// 8) BEKÖTÉS-ŐR (Task 2): a build és a böngészős szkript tényleg használja
{
  const build = olvas('website/build.js'), app = olvas('website/assets/app.js');
  assert.match(build, /import \{[^}]*kitolthetoHtml[^}]*\} from '\.\.\/core\/kitoltheto-prompt\.js'/, 'a build nem importálja');
  assert.equal((build.match(/kitolthetoHtml\(/g) || []).length, 2, 'mindkét prompt-ágban kell');
  assert.match(build, /promptJelolt\(eredeti\)/,'az egysoros ág a közös prompt-felismerőt használja');
  // a 💬 utáni kódblokk MINDIG másolható (a Prompt-tár 1. szabálya), akkor is, ha nem idézőjellel kezdődik
  assert.match(build, /\+ masolGomb\(true\) \+/);
  assert.match(build, /class="g-vote" hidden/);
  assert.match(build, /class="g-tovabb"/);
  assert.ok(build.indexOf('${reszek.siker ?') < build.indexOf('${reszek.maskepp ?'), 'a ✅ a 🔄 elé kerüljön');
  for (const k of ['voteQ', 'voteThanks', 'fillHint', 'tovWiz', 'tovPb'])
    assert.equal((build.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' mindhárom nyelven');
  // a lecsatolt klón innerText-je = textContent → a <br> eltűnne; a másoló sortörésre cseréli (átnézés 10-23)
  assert.match(app, /clone\.querySelectorAll\('br'\)\.forEach\(function \(br\) \{ br\.replaceWith\('\\n'\); \}\)/);
  assert.match(app, /fbp-hit/); assert.match(app, /\.g-fill/); assert.match(app, /g-vote/); assert.match(app, /data-h/);
}

console.log('✅ kitoltheto-prompt: modul rendben');
