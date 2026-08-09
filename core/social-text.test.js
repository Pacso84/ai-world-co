// ===================================================================
// TESZT — poszt-szöveg csatornánként (karakterkorlát, link, csonkítás)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { composePost, stripUrl, CHANNELS } from './social-text.js';

const URL = 'https://aiworldhq.com/article/getting-started-with-deepseek-for-everyday-help';

// --- stripUrl: a link kiszedése a szövegtörzsből ---------------------
// A social agent a linket BELEÍRJA a szövegbe; mi külön sorba tesszük,
// különben kétszer szerepelne.
assert.equal(
  stripUrl('Worth a look. ' + URL + ' #AIHelp', URL),
  'Worth a look. #AIHelp',
  'a link helyén ne maradjon dupla szóköz');

assert.equal(stripUrl('Nincs benne link.', URL), 'Nincs benne link.');
assert.equal(stripUrl('', URL), '', 'üres szöveg nem borul fel');

// --- X: a link FIX 23 karakter, bármilyen hosszú is -------------------
// Ez nem becslés: az X minden linket t.co-ra rövidít, és 23-nak számol.
{
  const short = 'Rövid poszt.';
  const r = composePost({ text: short, url: URL, channel: 'x' });
  assert.ok(r.body.includes(short), 'a rövid szöveg érintetlen');
  assert.ok(r.body.endsWith(URL), 'a link a végén áll');
  assert.equal(r.weight, short.length + 2 + 23, 'a súly a 23-as linkkel számol');
  assert.ok(r.weight <= CHANNELS.x.limit);
}

// --- X: hosszú szöveg csonkítása -------------------------------------
{
  const long = 'szó '.repeat(120).trim();          // 479 karakter
  const r = composePost({ text: long, url: URL, channel: 'x' });
  assert.ok(r.weight <= CHANNELS.x.limit, 'belefér a 280-ba: ' + r.weight);
  assert.ok(r.body.includes('…'), 'a csonkítást jelezzük');
  assert.ok(r.body.endsWith(URL), 'a link csonkítás után is megvan');
  // SZÓHATÁRON vágunk — félbevágott szó olvashatatlan és bizalomromboló.
  // A pontos megfogalmazás: a "…" nélküli rész az eredeti szöveg PREFIXE, és
  // ott ér véget, ahol az eredetiben szóköz (vagy a szöveg vége) következik.
  // (A regexes \b itt nem használható: az ASCII-alapú, az "ó" nem szóhatár.)
  const textPart = r.body.split('\n\n')[0];
  const kept = textPart.slice(0, -1);
  assert.ok(long.startsWith(kept), 'a megtartott rész az eredeti eleje');
  assert.ok(long[kept.length] === undefined || long[kept.length] === ' ',
    'a vágás pontosan szóhatáron van, nem szó közepén');
}

// --- Threads: 500 karakter, a link VALÓDI hossza számít ---------------
{
  const r = composePost({ text: 'Rövid.', url: URL, channel: 'threads' });
  assert.equal(r.weight, 'Rövid.'.length + 2 + URL.length,
    'a Threads a link teljes hosszát számolja');
  assert.equal(CHANNELS.threads.limit, 500);
}

// --- Threads: ami az X-en nem fér el, itt még elfér -------------------
{
  const mid = 'a'.repeat(300);
  const x = composePost({ text: mid, url: URL, channel: 'x' });
  const th = composePost({ text: mid, url: URL, channel: 'threads' });
  assert.ok(x.truncated, 'az X-en csonkul');
  assert.ok(!th.truncated, 'a Threadsen nem csonkul');
}

// --- a link SOHA nem eshet ki ----------------------------------------
// Ez a legfontosabb: link nélkül a poszt nem hoz látogatót, tehát értelmetlen.
{
  const absurd = 'x'.repeat(5000);
  const r = composePost({ text: absurd, url: URL, channel: 'x' });
  assert.ok(r.body.endsWith(URL), 'link mindig marad');
  assert.ok(r.weight <= CHANNELS.x.limit);
}

// --- ismeretlen csatorna: inkább semmi, mint rossz --------------------
assert.equal(composePost({ text: 'a', url: URL, channel: 'nincs-ilyen' }), null,
  'ismeretlen csatornára nem gyártunk posztot');
assert.equal(composePost({ text: '', url: URL, channel: 'x' }), null,
  'üres szövegből nincs poszt');
assert.equal(composePost({ text: 'a', url: '', channel: 'x' }), null,
  'link nélkül nincs poszt');

console.log('✅ social-text: minden teszt átment');
