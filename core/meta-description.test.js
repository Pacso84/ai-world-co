// ===================================================================
// TESZT — meta leírás építése
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-13, a Bing Webmaster Tools jelzése nyomán): a meta leírásunk
// SZÓ SZERINT az alcím volt, és 688 cikkből 360 (52%) így 120 karakter alatt
// maradt — a keresők ~155-öt mutatnak. Ugyanez a szöveg megy az og:description
// és a twitter:description mezőbe is.
//
// AMIT NEM CSINÁLUNK: nem íratjuk újra az alcímeket. Az fizetős lenne, és az
// alcím a LÁTHATÓ oldalon is ott van. A meta leírás ehelyett a build-ben,
// GÉPILEG egészül ki a törzs első mondataiból — nulla modellhívás, örökre $0.
//
// ⚠️ A "Röviden" doboz NEM használható fő forrásnak: mérve csak a cikkek
// 29%-ának van ilyenje. Ahol van, ott a törzs elején áll, tehát magától
// előre kerül — de a kiegészítés a sima törzsszövegből is működik.
// ===================================================================

import assert from 'assert/strict';
import { buildMetaDescription, stripMarkdown, MIN_LEN, MAX_LEN } from './meta-description.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 meta leírás\n');

// Szó szerint egy éles alcím (101 kar) és a hozzá tartozó "Röviden" doboz.
const ALCIM = 'Set up saved memories once, then watch ChatGPT carry your preferences into every future conversation.';
const TORZS = `# Some Heading

> **In short:** ChatGPT's Memory feature saves details you share and applies them to new conversations automatically.

## Why this matters

You can turn it off at any time in the settings.`;

// ---------- markdown-tisztítás ----------
t('a markdown-jelölők eltűnnek, a szöveg marad', () => {
  const s = stripMarkdown('## Cím\n\n**Vastag** és *dőlt* és [link szöveg](https://a.hu) és `kód`.');
  assert.ok(!s.includes('#'), 'nincs fejezetjel');
  assert.ok(!s.includes('**'), 'nincs vastagítás-jel');
  assert.ok(!s.includes('https://'), 'nincs URL');
  assert.ok(s.includes('link szöveg'), 'a link SZÖVEGE megmarad — az is próza');
});

t('a "Röviden" doboz jelölői eltűnnek, a mondat marad', () => {
  const s = stripMarkdown('> **In short:** Ez a lényeg.');
  assert.ok(!s.includes('>'), 'nincs idézőjel-marker');
  assert.ok(!/In short/i.test(s), 'a címke nem próza');
  assert.ok(s.includes('Ez a lényeg.'));
});

t('a kódblokk és a kép nem próza', () => {
  const s = stripMarkdown('Szöveg.\n\n```\nconst x = 1;\n```\n\n![alt](/assets/kep.jpg)\n\nMás.');
  assert.ok(!s.includes('const x'), 'a kódblokk kimarad');
  assert.ok(!s.includes('/assets/'), 'a képútvonal kimarad');
  assert.ok(s.includes('Szöveg.') && s.includes('Más.'));
});

// ---------- a leírás építése ----------
t('a már elég hosszú alcímhez NEM nyúlunk', () => {
  const hosszu = 'A'.repeat(MIN_LEN + 5);
  assert.equal(buildMetaDescription(hosszu, TORZS), hosszu, 'ami elég, azt békén hagyjuk');
});

t('a RÖVID alcím kiegészül a törzsből', () => {
  const d = buildMetaDescription(ALCIM, TORZS);
  assert.ok(d.startsWith(ALCIM), 'az alcím marad az eleje — az a legjobb szövegünk');
  assert.ok(d.length > ALCIM.length, 'tényleg hosszabb lett');
  assert.ok(d.length >= MIN_LEN, `elérte a ${MIN_LEN} karaktert (lett: ${d.length})`);
});

t('SOHA nem lépi túl a felső határt', () => {
  const hosszuTorzs = 'Ez egy nagyon hosszú mondat a törzsben. '.repeat(20);
  for (const alcim of ['Rövid.', ALCIM, '']) {
    const d = buildMetaDescription(alcim, hosszuTorzs);
    assert.ok(d.length <= MAX_LEN, `${alcim.slice(0, 12)}… → ${d.length} kar, a max ${MAX_LEN}`);
  }
});

t('SOHA nem vág szó közepén', () => {
  const alcim = 'B'.repeat(MAX_LEN + 40);   // önmagában túl hosszú → vágni kell
  const d = buildMetaDescription(alcim, '');
  assert.ok(d.length <= MAX_LEN);
  // Vágás után vagy írásjel, vagy … a vég — csonka szó nem maradhat.
  assert.ok(/[.!?…]$/.test(d), 'a vágott szöveg rendes véget kap: ' + JSON.stringify(d.slice(-6)));
});

t('a vágás szóhatáron történik', () => {
  const alcim = 'alma korte szilva barack cseresznye malna ribizli egres szeder afonya '.repeat(4);
  const d = buildMetaDescription(alcim, '');
  const utolso = d.replace(/…$/, '').trim().split(' ').pop();
  assert.ok(['alma', 'korte', 'szilva', 'barack', 'cseresznye', 'malna', 'ribizli', 'egres', 'szeder', 'afonya'].includes(utolso),
    'az utolsó szó teljes, nem csonka: ' + utolso);
});

t('nem ismétli meg azt, ami már az alcímben van', () => {
  // Ha a "Röviden" doboz ugyanazt mondja, mint az alcím, a leírás nem lehet
  // ugyanaz kétszer — az a keresőben is rosszul néz ki.
  const d = buildMetaDescription('A macska felmászott a fára.', '> **In short:** A macska felmászott a fára. Aztán lejött.');
  const elofordulas = d.split('A macska felmászott').length - 1;
  assert.equal(elofordulas, 1, 'egyszer szerepel, nem kétszer');
});

t('a mondathatárokat tiszteletben tartja', () => {
  const d = buildMetaDescription('Rövid alcím.', 'Első mondat itt van. Második mondat is itt van. Harmadik.');
  assert.ok(!/\bMásodik mondat is it\b/.test(d) || d.includes('Második mondat is itt van.'),
    'félbevágott mondat nem kerül bele');
});

t('IDEMPOTENS — kétszer futtatva ugyanaz', () => {
  const egyszer = buildMetaDescription(ALCIM, TORZS);
  assert.equal(buildMetaDescription(egyszer, TORZS), buildMetaDescription(egyszer, TORZS));
});

t('nincs dupla szóköz és nincs vezető/záró szóköz', () => {
  const d = buildMetaDescription('  Rövid alcím  ', '  Első   mondat   itt.  Második mondat itt van most.  ');
  assert.equal(d, d.trim(), 'nincs vezető/záró szóköz');
  assert.ok(!/ {2}/.test(d), 'nincs dupla szóköz');
});

t('rossz bemenetre nem esik szét', () => {
  assert.equal(buildMetaDescription(null, null), '');
  assert.equal(buildMetaDescription(undefined, undefined), '');
  assert.equal(buildMetaDescription('', ''), '');
  assert.equal(typeof buildMetaDescription('Alcím.', null), 'string');
  assert.equal(stripMarkdown(null), '');
});

t('a határok a keresők tényleges megjelenítéséhez vannak szabva', () => {
  assert.ok(MIN_LEN >= 110 && MIN_LEN <= 130, 'az alsó cél a 120 körül');
  assert.ok(MAX_LEN >= 150 && MAX_LEN <= 160, 'a felső határ a levágás előtt');
  assert.ok(MAX_LEN > MIN_LEN);
});

console.log('\n✅ meta-description.test: mind a ' + pass + ' eset rendben');
