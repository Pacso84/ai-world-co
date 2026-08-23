// ===================================================================
// ÁLLÓ RÖVIDVIDEÓ — a szkript-kinyerés tesztjei
// ===================================================================
//
// MIÉRT INGYENES A SZKRIPT. Mérve (2026-08-23): a 352 útmutató MINDEGYIKE
// legalább 3 lépéses, és a 2026 lépés-cím MIND ugyanabban a formában áll:
// „Step N — <cím>". Ezért a videó szövegéhez NEM kell AI — a cikk saját
// szerkezete adja. A hang (msedge-tts), a kép (sharp) és az összerakás
// (ffmpeg) is ingyenes, tehát a teljes lánc $0.
//
// Ez a fájl CSAK a tiszta logikát nézi: hálózat, ffmpeg és fájlírás nélkül.
// ===================================================================

import assert from 'assert/strict';
import { cardsFromGuide, splitHeading, MIN_LEPES } from './short-video.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 álló rövidvideó — szkript\n');

const CIKK = `---
title: "How to Spot a Deepfake Video or Voice Clone Before You Share It"
subtitle: "Five quick checks anyone can run in under two minutes"
---

# How to Spot a Deepfake Video or Voice Clone Before You Share It

> **In short:** Look at the eyes, mouth and face edges.

## Before you start

Semmi különös.

## Step 1 — Watch the face for small glitches

Szöveg.

## Step 2 — Listen to the voice for flat delivery

Szöveg.

## Step 3 — Read the message around the clip

Szöveg.

## Step 4 — Run a quick source check

Szöveg.

## Step 5 — Decide what to do next

Szöveg.

## Common mistakes
`;

// ── a cím kettévágása: nagy szöveg + alcím ──────────────────────────
//
// A kézzel írt mintában a „Step 1 — Watch the face for small glitches"
// ebből lett: NAGY „Watch the face", kicsi „for small glitches". Ez nem
// ötlet volt, hanem a mondat természetes törése — és gépiesíthető: a
// vágás ott jó, ahol a nagy szöveg ~18 karakter körül van.

t('a hosszú lépés-címet természetes ponton vágja ketté', () => {
  const r = splitHeading('Watch the face for small glitches');
  assert.equal(r.nagy, 'Watch the face');
  assert.equal(r.kicsi, 'for small glitches');
});

t('nem az ELSŐ töréspontnál vág, hanem a legjobbnál', () => {
  // A „to" hamarabb jön, de utána 1 szó maradna: „Listen".
  const r = splitHeading('Listen to the voice for flat delivery');
  assert.equal(r.nagy, 'Listen to the voice');
  assert.equal(r.kicsi, 'for flat delivery');
});

t('a rövid címet nem darabolja', () => {
  const r = splitHeading('Run a quick source check');
  assert.equal(r.nagy, 'Run a quick source check');
  assert.equal(r.kicsi, '');
});

t('a zárójeles kiegészítés lekerül — a kártyán is, a hangban is', () => {
  const r = splitHeading('Meet the friendly all-rounders (ChatGPT and Gemini)');
  assert.ok(!r.nagy.includes('('), 'zárójel nem fér a kártyára');
  assert.ok(!r.kicsi.includes('('));
});

// ── a kártyák ───────────────────────────────────────────────────────

t('🎬 a horog, a lépések és a záró kártya sorban állnak elő', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.equal(cards.length, 6, 'horog + 4 lépés + záró');
  assert.equal(cards[0].cimke, '', 'a horgon nincs sorszám');
  assert.deepEqual(cards.slice(1, 5).map(c => c.cimke), ['01', '02', '03', '04']);
  assert.match(cards[5].nagy, /aiworldhq/, 'a végén a domain');
});

t('🎬 a horog FELSZÓLÍTÓ, nem körülírás — az első két másodperc dönt', () => {
  // Az első változat „Here is how to Spot a Deepfake…"-et mondott: hosszabb,
  // sutább, és a lényeg csak a negyedik szó után jött.
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards[0].mond, /^Spot a Deepfake/, 'a „How to" lekerül');
  assert.ok(!/here is how/i.test(cards[0].mond));
  assert.match(cards[0].mond, /four fast steps/i, 'mondja meg, mennyi jön');
});

t('🎬 a „Before you start" és a „Common mistakes" NEM lépés', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  const szoveg = cards.map(c => c.nagy + ' ' + c.kicsi).join(' ');
  assert.ok(!/Before you start/i.test(szoveg));
  assert.ok(!/Common mistakes/i.test(szoveg));
});

t('🎬 a kimondott mondat sorszámot kap, hogy követhető legyen', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards[1].mond, /^One[.,]/);
  assert.match(cards[2].mond, /^Two[.,]/);
});

t('🎬 a domain KIMONDVA is érthető — „dot com", nem pont', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  assert.match(cards.at(-1).mond, /dot com/, 'a felolvasó a pontot nem mondja ki');
});

// ── amikor NEM készül videó ─────────────────────────────────────────
//
// A hallgatás a biztonságos irány: rossz videót kitenni rosszabb, mint
// nem kitenni semmit.

t('⛔ három lépésnél kevesebből nem lesz videó', () => {
  const rovid = CIKK.replace(/## Step [3-5][\s\S]*?(?=## |$)/g, '');
  const r = cardsFromGuide(rovid, { maxSteps: 4 });
  assert.equal(r.cards, null);
  assert.match(r.reason, /lépés/i, 'mondja meg, miért nem');
});

t('⛔ cím nélküli cikkből nem lesz videó', () => {
  const r = cardsFromGuide(CIKK.replace(/title: ".*"/, ''), { maxSteps: 4 });
  assert.equal(r.cards, null);
});

t('⛔ üres vagy hiányzó bemenetre nem borulunk', () => {
  for (const x of ['', null, undefined, 12]) {
    const r = cardsFromGuide(x, {});
    assert.equal(r.cards, null);
  }
});

t('a MIN_LEPES egy helyen él, nem szórva a kódban', () => {
  assert.equal(typeof MIN_LEPES, 'number');
  assert.ok(MIN_LEPES >= 3);
});

// ── hossz: a Reels rövid műfaj ──────────────────────────────────────

t('⏱️ négy lépésnél a felolvasandó szöveg belefér ~30 másodpercbe', () => {
  const { cards } = cardsFromGuide(CIKK, { maxSteps: 4 });
  const szavak = cards.map(c => c.mond).join(' ').split(/\s+/).length;
  // ~2,6 szó/másodperc a mért felolvasási tempó
  const mp = szavak / 2.6;
  assert.ok(mp < 34, 'túl hosszú lenne: ' + mp.toFixed(1) + ' mp (' + szavak + ' szó)');
  assert.ok(mp > 12, 'túl rövid: ' + mp.toFixed(1) + ' mp');
});

t('⏱️ a maxSteps tényleg korlátoz', () => {
  assert.equal(cardsFromGuide(CIKK, { maxSteps: 3 }).cards.length, 5);
  assert.equal(cardsFromGuide(CIKK, { maxSteps: 5 }).cards.length, 7);
});

console.log('\n✅ short-video.test: mind a ' + pass + ' eset rendben');
