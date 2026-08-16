// ===================================================================
// TESZT — nyitómondat-változatosság
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-16, mérve): a betiltott „Imagine…" nyitás eltűnt (23,6% →
// 0,6%), de részben rokon fordulatok léptek a helyére („Picture this…",
// „You've been…"). A modell a SZÓT kerüli meg, nem a SZOKÁST — ezért a
// szokást mérjük, így a jövőbeli divatszavak is fennakadnak.
// ===================================================================

import assert from 'assert/strict';
import {
  firstParagraph, openingSignature, repetitionIssue,
  WINDOW, MAX_SAME, SIGNATURE_WORDS
} from './opening-variety.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 nyitómondat-változatosság\n');

const CIKK = `---
title: "How to Spot a Deepfake"
subtitle: "A short guide"
tags: ["ai-safety"]
---

# How to Spot a Deepfake

> **In short:** check the eyes, the audio and the source.

You have been scrolling for an hour when a familiar face says something odd.
`;

t('⚠️ a nyitómondat NEM a címsor', () => {
  // EZ FOGOTT MEG (2026-08-16): az első mérésem a `# How to…` H1-et vette
  // nyitómondatnak, és „55× how to" jött ki — értelmetlen eredmény.
  const p = firstParagraph(CIKK);
  assert.ok(p.startsWith('You have been scrolling'), 'a valódi első bekezdés jön');
  assert.ok(!/^#/.test(p), 'nem címsor');
  assert.ok(!/In short/.test(p), 'nem a Röviden-doboz');
});

t('a frontmattert levágja', () => {
  // A frontmatter önmagában 400+ karakter lehet — enélkül a mérés a cikk
  // szövegébe bele sem néz. (Ez is megfogott.)
  assert.ok(!firstParagraph(CIKK).includes('title:'));
  assert.equal(firstParagraph('---\na: 1\n---\n\nPlain opening here.'), 'Plain opening here.');
});

t('listát, képet, táblázatot is átlép', () => {
  const md = '# Cím\n\n- első pont\n- második\n\n![kep](a.jpg)\n\n| a | b |\n\nEz az igazi kezdés.';
  assert.equal(firstParagraph(md), 'Ez az igazi kezdés.');
});

t('az ujjlenyomat az első három szó, kisbetűsen', () => {
  assert.equal(openingSignature('Picture this: your inbox is full.'), 'picture this your');
  assert.equal(openingSignature('PICTURE THIS — your inbox!'), 'picture this your');
  assert.equal(SIGNATURE_WORDS, 3);
});

t('túl rövid vagy hiányzó nyitásra NEM ítélünk', () => {
  assert.equal(openingSignature('Hi there'), '', 'két szó kevés');
  assert.equal(openingSignature(''), '');
  assert.equal(openingSignature(null), '');
  assert.equal(repetitionIssue('', ['a b c']), null);
});

t('🔁 a sokadik azonos kezdést jelzi (szoros háló)', () => {
  // A MAI valódi modrunk: "By the end of…" — 60 friss cikkből 7×.
  const uj = 'By the end of this guide you will have a working setup.';
  const regi = [
    'By the end of this article you will know the answer.',
    'By the end of the week you can finish the whole thing.',
    'By the end of today you will have sent the email.',
    'A completely different opening sentence here.'
  ];
  const r = repetitionIssue(uj, regi, { window: 20, maxSame: 2 });
  assert.ok(r, 'három korábbi ugyanígy kezd — ez már modor');
  assert.equal(r.signature, 'by the end');
  assert.equal(r.count, 3);
  assert.equal(r.loose, false);
});

t('🕸️ a LAZA háló fogja, aminek a 3. szava változik', () => {
  // EZ FOGOTT MEG A TESZTÍRÁSNÁL: a "Picture this: it's…" és a
  // "Picture this: you've…" két KÜLÖN 3 szavas ujjlenyomat, mégis EGY szokás.
  // A 3 szavas háló alatt átcsúszna; a 2 szavas elkapja.
  const uj = 'Picture this your inbox is full again today.';
  const regi = [
    'Picture this a cluttered desktop full of files.',
    "Picture this it's late and the report is due.",
    "Picture this you've just opened a long email.",
    'Picture this the phone rings during dinner time.'
  ];
  const szoros = repetitionIssue(uj, regi, { maxSame: 99, maxSameLoose: 99 });
  assert.equal(szoros, null, 'a 3 szavas háló önmagában ezt NEM fogná');
  const r = repetitionIssue(uj, regi, { maxSame: 2, maxSameLoose: 3 });
  assert.ok(r, 'a laza háló viszont igen');
  assert.equal(r.signature, 'picture this');
  assert.equal(r.loose, true);
});

t('a megengedett ismétlődés belefér', () => {
  const uj = 'By the end of this you are done.';
  const regi = ['By the end of the day it works.', 'Something else entirely different here.'];
  assert.equal(repetitionIssue(uj, regi), null, '1 ismétlés még nem modor');
});

t('csak az ABLAKON belülre néz', () => {
  // A régi cikkek kezdése nem érdekes — a mostani termés egyhangúsága számít.
  const uj = 'Picture this: your inbox is full.';
  const regi = [
    'Fresh and different opening one.',
    'Fresh and different opening two.',
    'By the end of old article three.',
    'By the end of old article four.',
    'By the end of old article five.'
  ];
  assert.equal(repetitionIssue(uj, regi, { window: 2, maxSame: 2 }), null,
    'a két legfrissebb más — az ablakon kívüli nem számít');
});

t('MINDEN divatszót elkap, nem csak a maiakat', () => {
  // A lényeg: nincs tiltólista. Bármilyen ÚJ, ismétlődő fordulat fennakad.
  const uj = 'Zorblax the quantum wombat arrives.';
  const regi = Array(4).fill('Zorblax the quantum llama arrives.');
  const r = repetitionIssue(uj, regi);
  assert.ok(r, 'kitalált fordulat is fennakad — nem kell hozzá szótár');
  assert.equal(r.count, 4);
});

t('rossz bemenetre nem esik szét', () => {
  assert.equal(repetitionIssue('Some opening words here', null), null);
  assert.equal(repetitionIssue('Some opening words here', 'nem tömb'), null);
  assert.equal(repetitionIssue(null, []), null);
  assert.equal(repetitionIssue(), null);
});

t('⚖️ a küszöb MEGENGEDŐBB, mint a mért maximum', () => {
  // EZ CSÚSZOTT EL (2026-08-16, kódellenőrzés): MAX_SAME = 2 volt, vagyis már
  // 3 egyezésnél riasztott — pontosan annyinál, amennyi a VÁLTOZATLAN élő
  // anyagon a mért maximum („by the end", 20 cikkes ablakban 3×). A modul
  // tehát a saját kalibrációjának mondott ellent: az első futásától kezdve
  // riasztott volna olyanra, amit a mérés még normálisnak talált.
  const MERT_MAXIMUM = 3;        // 60 éles cikken mérve, 2026-08-16
  assert.ok(MAX_SAME >= MERT_MAXIMUM,
    `a küszöb (${MAX_SAME}) nem lehet szigorúbb a mért maximumnál (${MERT_MAXIMUM})`);

  const uj = 'By the end of this guide you are done.';
  const meg = Array(MERT_MAXIMUM).fill('By the end of the day it works.');
  assert.equal(repetitionIssue(uj, meg), null,
    'a mért maximum még NEM modor — alapértékkel sem riaszthat');

  const mar = [...meg, 'By the end of the week it works too.'];
  assert.ok(repetitionIssue(uj, mar), 'eggyel több viszont már igen');
});

t('a vízszintes vonal NEM nyitómondat', () => {
  // 725-ből 6 cikknél a házi `---` (a Röviden-doboz és a szöveg között) lett
  // a "nyitómondat", és ott a mérés NÉMÁN kikapcsolt (2026-08-16).
  // Egy őr, ami csendben nem őriz, rosszabb a semminél: azt hisszük, véd.
  const kulon = '# Cím\n\n> **In short:** rövid.\n\n---\n\nEz az igazi kezdés itt.';
  assert.equal(firstParagraph(kulon), 'Ez az igazi kezdés itt.', 'önálló vonal');

  const tapadt = '# Cím\n\n> **In short:** rövid.\n\n---\nEz az igazi kezdés itt.';
  assert.equal(firstParagraph(tapadt), 'Ez az igazi kezdés itt.', 'a bekezdéshez tapadó vonal');

  assert.equal(firstParagraph('# Cím\n\n***\n\nCsillagos vonal után jön.'), 'Csillagos vonal után jön.');
  assert.notEqual(openingSignature(kulon), '', 'van értelmezhető ujjlenyomat');
});

t('az alapértékek épek', () => {
  assert.ok(WINDOW >= 10 && WINDOW <= 60, 'se túl szűk, se értelmetlenül tág');
  assert.ok(MAX_SAME >= 1, 'egy véletlen egyezés ne riasszon');
});

console.log('\n✅ opening-variety.test: mind a ' + pass + ' eset rendben');
