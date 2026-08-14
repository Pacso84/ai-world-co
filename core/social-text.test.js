// ===================================================================
// TESZT — poszt-szöveg csatornánként (karakterkorlát, link, csonkítás)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// ===================================================================

import assert from 'assert/strict';
import { composePost, stripUrl, followCta, CHANNELS, BIO_LINE } from './social-text.js';

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

// --- követésre hívás: determinisztikus, de váltakozó -----------------
{
  // Ugyanaz a cikk MINDIG ugyanazt kapja — enélkül egy újraposztolás más
  // szöveget adna, és nem lehetne se kiszámítani, se tesztelni.
  assert.equal(followCta('valami-slug'), followCta('valami-slug'), 'ugyanarra a slugra ugyanaz');

  // De a hírfolyamban váltakozzon: három egyforma poszt egymás után gépies.
  const slugs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
  const seen = new Set(slugs.map(followCta));
  assert.ok(seen.size >= 2, '12 cikkre legalább kétféle szöveg jut, nem mindig ugyanaz');

  // Nem lájkvadászat: a Meta a "lájkolj és oszd meg!" felszólítást bünteti.
  for (const s of slugs) {
    const c = followCta(s);
    assert.ok(c.length > 0 && c.length < 80, 'rövid marad: ' + c);
    assert.ok(!/\blike\b|\bshare\b|\btag\b|\bcomment\b/i.test(c),
      'nem kér lájkot/megosztást/címkézést: ' + c);
  }

  assert.equal(followCta(''), followCta(''), 'üres slug sem borul fel');
}

// --- INSTAGRAM: a link NEM kattintható, ezért nem is tesszük ki -------
// Mérve 2026-08-11: a feed-poszt szövegében az Instagram nem tesz élő linket
// (a 2026-03-i teszt csak Meta Verified + creator fióknak szólt, havi 10
// posztra, és asztali gépen sem működött). Egy nyers URL a caption végén
// tehát NEM visz sehová: csak helyet foglal, és elrontottnak látszik.
// Helyette a bevált "link in bio" forma megy, a domainnel kiírva — azt a
// olvasó be tudja gépelni, és a profilban ott a valódi link.
{
  const text = 'Így írd meg az első promptodat.';
  const r = composePost({ text, url: URL, channel: 'instagram' });

  assert.ok(r, 'az Instagram ismert csatorna');
  assert.ok(!r.body.includes(URL), 'a NYERS cikk-URL nem kerül a caption-be');
  assert.ok(!/https?:\/\//.test(r.body), 'semmilyen http(s) link nincs a szövegben');
  assert.ok(r.body.includes(BIO_LINE), 'a "link in bio" sor viszont ott van');
  assert.ok(r.body.startsWith(text), 'a mondanivaló marad elöl');
  assert.equal(r.label, 'Instagram');

  // A caption-korlát 2200 — bőven elég, de a csonkítás itt is működjön.
  assert.equal(CHANNELS.instagram.limit, 2200);
  const hosszu = 'szó '.repeat(900);                     // ~3600 kar
  const h = composePost({ text: hosszu, url: URL, channel: 'instagram' });
  assert.ok(h.body.length <= 2200, 'a 2200-as korlátot nem lépi túl: ' + h.body.length);
  assert.ok(h.truncated, 'jelzi, hogy csonkított');
  assert.ok(h.body.includes(BIO_LINE), 'csonkításnál SEM eshet ki a bio-sor');
}

// --- A LINK SOHA nem eshet ki egyik csatornán sem ---------------------
// A poszt egyetlen célja, hogy olvasót hozzon (az Instagramon a bio-n át).
{
  const hosszu = 'szó '.repeat(400);
  for (const ch of Object.keys(CHANNELS)) {
    const r = composePost({ text: hosszu, url: URL, channel: ch });
    assert.ok(r, ch + ': születik poszt');
    const vanUt = r.body.includes(URL) || r.body.includes(BIO_LINE);
    assert.ok(vanUt, ch + ': marad út az olvasónak a cikkhez');
    // ⚠️ A KORLÁTOT a `weight` méri, NEM a body.length: az X minden linket
    // 23 karakternek számol, hiába 78 a miénk. Az első változatom a nyers
    // hosszt nézte, és emiatt HAMISAN bukott el az X-en.
    assert.ok(r.weight <= CHANNELS[ch].limit, ch + ': a csatorna szerint belefér (' + r.weight + ')');
  }
}

console.log('✅ social-text: minden teszt átment');
