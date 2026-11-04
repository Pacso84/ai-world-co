// core/lepes-kep.js — a lépés melletti ikon kiválasztása (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA (user 10-23: „a képek tükrözzék a lépéseket … pár helyen nagyon gagyi”):
// a veszély nem az, hogy egy lépésnek NINCS képe, hanem hogy NEM ODAILLŐ kép kerül mellé.
// Mérve 10-23: 2141 lépésből 327 kapott kényszer-ikont (sorban kiosztott vagy dedup-csere),
// ebből 127 céltáblát. Ezért: nincs ciklus, nincs dedup-csere — ha semmi nem illik, null.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { lepesKepKulcs, elsoMondat, elsoMondatKulcs, ismetlesTores } from './lepes-kep.js';

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

// 1b) 10-24 este, élő útmutatókból (user: „csináld az összes lépést meg!”): új ikonok + pontosabb szabályok
assert.equal(lepesKepKulcs('Plan a trip as a day-by-day table'), 'table', 'a „plan” miatt céltábla lett');
assert.equal(lepesKepKulcs('Compare two options side by side'), 'compare', 'az „option” miatt csúszka lett');
assert.equal(lepesKepKulcs('Build a week of meals or chores in a grid'), 'table');
assert.equal(lepesKepKulcs('Get a shopping list of only the missing items'), 'doc', 'a lista 💬 lett');
assert.equal(lepesKepKulcs('Take inventory of your fridge and pantry'), 'doc');
assert.equal(lepesKepKulcs('Plan your week of dinners'), 'calendar');
assert.equal(lepesKepKulcs('Create a simple weekly schedule'), 'calendar');
assert.equal(lepesKepKulcs('Make a chart of your spending'), 'table');
assert.equal(lepesKepKulcs('Hasonlítsd össze a két lehetőséget'), 'compare');
assert.equal(lepesKepKulcs('Készíts heti napirendet'), 'calendar');
assert.equal(lepesKepKulcs('Compara dos opciones'), 'compare');
assert.notEqual(lepesKepKulcs('Sign in to GitHub from inside VS Code'), 'compare', 'a „VS Code” nem „versus”');
assert.equal(lepesKepKulcs('Free vs paid plans'), 'compare');
// a valódi cél-lépés továbbra is céltábla
assert.equal(lepesKepKulcs('Define your goal'), 'target');

// 1c) LEGFELJEBB 2 EGYFORMA EGYMÁS UTÁN (élőben: a vacsoraterv-útmutatóban 5× 💬): a harmadiktól az
//     első mondat adhat MÁSIK illő ikont; ha az sincs (vagy ugyanaz), marad — kitalált kép nincs
assert.deepEqual(ismetlesTores(['chat', 'chat', 'chat', 'chat', 'download'], ['login', null, 'doc', 'chat', null]),
  ['chat', 'chat', 'doc', 'chat', 'download']);
assert.deepEqual(ismetlesTores(['chat', 'chat', 'chat'], [null, null, null]), ['chat', 'chat', 'chat'], 'nincs alternatíva → marad');
assert.deepEqual(ismetlesTores(['a', null, null, null], [null, 'x', 'y', 'z']), ['a', null, null, null], 'a null (nincs kép) nem ismétlés');
assert.deepEqual(ismetlesTores([], []), []);
assert.equal(elsoMondatKulcs('Open a new chat and type a short list of your notes.'), 'chat');
assert.equal(elsoMondatKulcs('Take three slow breaths before you start.'), null);

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
// élő előnézetből (10-23): ezek eddig kép nélkül maradtak volna
assert.equal(lepesKepKulcs('Mondd el az AI-nak, mire van szükséged'), 'chat');
assert.equal(lepesKepKulcs('Tell the AI what you need'), 'chat');
assert.equal(lepesKepKulcs('Másold át az e-mail programodba'), 'download');
assert.equal(lepesKepKulcs('Dile a la IA lo que necesitas'), 'chat');
assert.equal(lepesKepKulcs('Copia el texto a tu correo'), 'download');

// 6) első mondat: markdown nélkül, csak az első mondat
assert.equal(elsoMondat('Tap the **microphone icon** at the bottom. Then speak.'), 'Tap the microphone icon at the bottom.');
assert.equal(elsoMondat(''), '');

// 7) BEKÖTÉS-ŐR: a build a modult használja, a régi ciklus/dedup eltűnt
{
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ lepesKepKulcs, elsoMondat, elsoMondatKulcs, ismetlesTores \} from '\.\.\/core\/lepes-kep\.js'/);
  assert.ok(!/STEP_ART_CYCLE/.test(b), 'a kényszer-ciklus maradt a buildben');
  assert.ok(!/function stepArtKey/.test(b), 'a régi választó maradt a buildben');
  assert.match(b, /g-step__grid--szoveg/, 'kép nélküli lépésnél a szöveg kapja a teljes szélességet');
  // MINDEN NYELVEN AZ ANGOL LÉPÉSBŐL (mérve 10-23: hu-n 292, es-en 259 lépés maradt volna kép nélkül,
  // angolul 48) — így a három nyelven ugyanaz a kép áll ugyanannál a lépésnél
  assert.match(b, /bodyMdEn: body,/, 'a betöltés nem teszi el az angol szöveget');
  assert.match(b, /parseGuideSections\(a\.bodyMdEn/, 'a kép-kulcs nem az angol lépésből jön');
  assert.match(b, /ismetlesTores\(/, 'a build nem töri meg a 3+ egyforma ikont');
}

// 8) MINDEN választható ikonnak van képe (különben a térképen szám, a lépés mellett üres hely lenne)
{
  const src = readFileSync(join(ROOT, 'core', 'lepes-kep.js'), 'utf-8');
  const kulcsok = new Set([...src.matchAll(/,\s*'([a-z]+)'(?:,\s*'cim')?\],/g)].map(m => m[1]));
  assert.ok(kulcsok.has('table') && kulcsok.has('calendar') && kulcsok.has('compare'), 'az új ikonok nincsenek a szabályokban');
  for (const k of kulcsok) assert.ok(existsSync(join(ROOT, 'website', 'assets', 'art', k + '.jpg')), 'hiányzó ikon-kép: ' + k + '.jpg');
}

console.log('✅ lepes-kep: odaillő ikon vagy semmi');
