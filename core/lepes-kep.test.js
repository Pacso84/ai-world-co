// core/lepes-kep.js — a lépés melletti ikon kiválasztása (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA (user 10-23: „a képek tükrözzék a lépéseket … pár helyen nagyon gagyi”):
// a veszély nem az, hogy egy lépésnek NINCS képe, hanem hogy NEM ODAILLŐ kép kerül mellé.
// Mérve 10-23: 2141 lépésből 327 kapott kényszer-ikont (sorban kiosztott vagy dedup-csere),
// ebből 127 céltáblát. Ezért: nincs ciklus, nincs dedup-csere — ha semmi nem illik, null.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lepesKepKulcs, elsoMondat } from './lepes-kep.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1) a valódi rossz esetek (10-23 mérésből) most odaillő ikont kapnak
assert.equal(lepesKepKulcs('Verify facts and add personal touches'), 'check', 'a dedup miatt céltábla lett');
assert.equal(lepesKepKulcs('Write your first clear question (your \'prompt\')'), 'chat');
assert.equal(lepesKepKulcs('Upload your file'), 'doc');
assert.equal(lepesKepKulcs('Get Your Secret Key (API Key)'), 'login');
assert.equal(lepesKepKulcs('Spot the Copilot icon'), 'search');
assert.equal(lepesKepKulcs('Pick your playlist and devices'), 'sliders');
assert.equal(lepesKepKulcs('Paste the formulas into your sheet'), 'doc');

assert.equal(lepesKepKulcs('Brainstorm social media posts'), 'bulb');
assert.equal(lepesKepKulcs('Use Apple Intelligence to summarize an email in Mail'), 'doc');

// 2) ha a cím semmitmondó, az első mondat dönt
assert.equal(lepesKepKulcs('Capture what you already have', 'Open a new chat and type a short list of your notes.'), 'chat');

// 3) ha semmi nem illik → null (NINCS kitalált kép), nem céltábla
assert.equal(lepesKepKulcs('Calm your pre-interview nerves', 'Take three slow breaths before you start.'), null);
assert.equal(lepesKepKulcs('', ''), null);

// 4) a céltábla CSAK valódi cél-lépésnél
assert.equal(lepesKepKulcs('Define your goal'), 'target');

// 5) magyar / spanyol fejléc
assert.equal(lepesKepKulcs('Ellenőrizd a tényeket'), 'check');
assert.equal(lepesKepKulcs('Töltsd fel a fájlt'), 'doc');
assert.equal(lepesKepKulcs('Sube tu archivo'), 'doc');

// 6) első mondat: markdown nélkül, csak az első mondat
assert.equal(elsoMondat('Tap the **microphone icon** at the bottom. Then speak.'), 'Tap the microphone icon at the bottom.');
assert.equal(elsoMondat(''), '');

// 7) BEKÖTÉS-ŐR: a build a modult használja, a régi ciklus/dedup eltűnt
{
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ lepesKepKulcs, elsoMondat \} from '\.\.\/core\/lepes-kep\.js'/);
  assert.ok(!/STEP_ART_CYCLE/.test(b), 'a kényszer-ciklus maradt a buildben');
  assert.ok(!/function stepArtKey/.test(b), 'a régi választó maradt a buildben');
  assert.match(b, /g-step__grid--szoveg/, 'kép nélküli lépésnél a szöveg kapja a teljes szélességet');
}

console.log('✅ lepes-kep: odaillő ikon vagy semmi');
