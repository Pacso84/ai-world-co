// Csalás-sablon + példablokk (2026-11-23, terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 2. rész):
// a csalás-hír kötelező fejezetei, a kitalált példaüzenet blokkjának értelmezése, a kép-őr (csak example.com,
// csak 555-01xx, valódi márkanév soha), a fordítás-egyezés és a blokk HTML-re cserélése.
// Ingyenes, hálózat nélküli. A minta-szöveg egy teljes, valódi szerkezetű csalás-cikk (en + hu).
import assert from 'node:assert/strict';
import {
  CSALAS_FEJEZETEK, PELDA_JELOLES, PELDA_VIZJEL, PELDA_HELYETTES,
  peldaBlokk, peldaBlokkNelkul, csalasSzerkezetHiba, peldaBiztonsag,
  forditasEgyezik, peldaBlokkCsere, tiltottNevek,
} from './csalas-sablon.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-sablon (fejezetek, példablokk, kép-őr, fordítás-egyezés)');

const EN = `---
title: "Fake package-delivery texts ask you to confirm your address"
---

**In short:** Scammers are texting people about a package that is supposedly on hold. The link leads to a fake page that asks for card details.

## What's happening

The FBI says criminals send text messages that claim a delivery could not be completed and ask the recipient to click a link to fix the address.

## Warning signs

> 🧪 [sms]
> 👤 [[1|+1 (555) 555-0199]]
> Your package is on hold because the address is incomplete.
> [[2|It will be deleted in 24 hours!]]
> Confirm here: [[3|parcel-track.example.com]]

1. **Unknown number** — real delivery companies don't text like this.
2. **Pressure** — so you don't have time to think.
3. **Odd link** — it's not the company's own address.

## How to protect yourself

1. Don't click links in unexpected delivery texts.
2. Check the status on the carrier's own website or app, typed in yourself.
3. Delete the message and report it as spam.

## If it already happened

Report it at ic3.gov and reportfraud.ftc.gov, and call your bank or card issuer. Outside the US, contact your local police or consumer protection agency.

## What this means for you

Anyone waiting for a package is a target, especially around the holidays.
`;

const HU = `---
title: "Hamis csomagküldési SMS-ek kérik, hogy erősítsd meg a címed"
---

**Röviden:** Csalók SMS-ben írnak egy állítólag feltartott csomagról. A link hamis oldalra visz, amely bankkártya-adatokat kér.

## Mi történik?

Az FBI szerint a bűnözők olyan SMS-eket küldenek, amelyek szerint a kézbesítés nem sikerült, és a címzettnek egy linkre kell kattintania a cím javításához.

## Figyelmeztető jelek

> 🧪 [sms]
> 👤 [[1|+1 (555) 555-0199]]
> A csomagod fennakadt, mert hiányos a cím.
> [[2|24 órán belül törlődik!]]
> Erősítsd meg itt: [[3|parcel-track.example.com]]

1. **Ismeretlen szám** — a valódi futárcégek nem így írnak.
2. **Sürgetés** — hogy ne legyen időd gondolkodni.
3. **Furcsa link** — nem a cég saját címe.

## Hogyan védekezz?

1. Ne kattints váratlan kézbesítési SMS linkjére.
2. Az állapotot a futárcég saját oldalán vagy appjában nézd meg, a címet magad beírva.
3. Töröld az üzenetet, és jelentsd kéretlen üzenetként.

## Ha már megtörtént

Jelentsd az ic3.gov és a reportfraud.ftc.gov oldalon, és hívd fel a bankodat vagy a kártyakibocsátót. Az USA-n kívül fordulj a helyi rendőrséghez vagy fogyasztóvédelmi hatósághoz.

## Mit jelent ez neked?

Bárki célpont, aki csomagra vár, főleg az ünnepek körül.
`;

const csere = (md, mit, mire) => { assert.ok(md.includes(mit), 'a minta tartalmazza: ' + mit); return md.replace(mit, mire); };

// ── fejezetek ─────────────────────────────────────────────────────────────────
t('📑 a csalás-sablon öt H2-je pontosan, angolul, sorrendben', () => {
  assert.deepEqual(CSALAS_FEJEZETEK, ["What's happening", 'Warning signs', 'How to protect yourself', 'If it already happened', 'What this means for you']);
});

t('🏷️ jelölés és vízjel mindhárom nyelven (a nem angol oldalon nincs angol mondat)', () => {
  assert.equal(PELDA_VIZJEL.en, 'EXAMPLE – SCAM');
  assert.equal(PELDA_VIZJEL.hu, 'PÉLDA – CSALÁS');
  assert.equal(PELDA_VIZJEL.es, 'EJEMPLO – ESTAFA');
  assert.equal(PELDA_JELOLES.en, 'Example — not a real message');
  assert.ok(PELDA_JELOLES.hu && !/not a real/i.test(PELDA_JELOLES.hu));
  assert.ok(PELDA_JELOLES.es && !/not a real/i.test(PELDA_JELOLES.es));
});

// ── példablokk értelmezése ──────────────────────────────────────────────────
t('🧪 a példablokk értelmezése: csatorna, feladó, 2–5 üzenetsor, 3 jel, 3 magyarázat', () => {
  const p = peldaBlokk(EN);
  assert.ok(p);
  assert.equal(p.csatorna, 'sms');
  assert.equal(p.felado, '[[1|+1 (555) 555-0199]]');
  assert.equal(p.targy, null);
  assert.equal(p.sorok.length, 3);
  assert.equal(p.sorok[0], 'Your package is on hold because the address is incomplete.');
  assert.equal(p.jelek[1], '+1 (555) 555-0199');
  assert.equal(p.jelek[2], 'It will be deleted in 24 hours!');
  assert.equal(p.jelek[3], 'parcel-track.example.com');
  assert.equal(p.magyarazat.length, 3);
  assert.deepEqual(p.magyarazat[1], { cimke: 'Pressure', szoveg: "so you don't have time to think." });
});

t('📌 e-mailnél a tárgy-sor külön mezőbe kerül', () => {
  const md = csere(csere(EN, '> 🧪 [sms]', '> 🧪 [email]'), '> 👤 [[1|+1 (555) 555-0199]]', '> 👤 [[1|Delivery Team <notice@parcel-help.example.com>]]\n> 📌 Action needed: your parcel');
  const p = peldaBlokk(md);
  assert.equal(p.csatorna, 'email');
  assert.equal(p.targy, 'Action needed: your parcel');
  assert.equal(p.sorok.length, 3);
});

t('🚫 példablokk nélküli szövegre null', () => {
  assert.equal(peldaBlokk('# Cím\n\nCsak szöveg.\n'), null);
  assert.equal(peldaBlokk(''), null);
  assert.equal(peldaBlokk(undefined), null);
});

// ── szerkezet-hiba ──────────────────────────────────────────────────────────
t('✅ a teljes minta-cikk szerkezete hibátlan', () => {
  assert.deepEqual(csalasSzerkezetHiba(EN), []);
});

t('❗ hiányzó fejezet név szerint jelezve', () => {
  const md = EN.replace(/## If it already happened[\s\S]*?(?=## What this means)/, '');
  const h = csalasSzerkezetHiba(md);
  assert.ok(h.some(x => x.includes('If it already happened')), h.join(' | '));
});

t('❗ példablokk-hibák: nincs blokk / nem 3 jel / nem 3 magyarázat / ismeretlen csatorna', () => {
  const nincs = EN.replace(/> 🧪[\s\S]*?3\. \*\*Odd link\*\*[^\n]*\n/, 'Nincs példa.\n');
  assert.ok(csalasSzerkezetHiba(nincs).includes('nincs példablokk'));
  const ketJel = csere(EN, '[[2|It will be deleted in 24 hours!]]', 'It will be deleted in 24 hours!');
  assert.ok(csalasSzerkezetHiba(ketJel).includes('nem 3 jel'));
  const dupla = csere(EN, 'Confirm here: [[3|parcel-track.example.com]]', 'Confirm here: [[2|parcel-track.example.com]]');
  assert.ok(csalasSzerkezetHiba(dupla).includes('nem 3 jel'));
  const ketMagy = csere(EN, "3. **Odd link** — it's not the company's own address.\n", '');
  assert.ok(csalasSzerkezetHiba(ketMagy).includes('nem 3 magyarázat'));
  const fax = csere(EN, '> 🧪 [sms]', '> 🧪 [fax]');
  assert.ok(csalasSzerkezetHiba(fax).includes('ismeretlen csatorna'));
});

t('❗ a példablokk a „Warning signs” alatt kell legyen; üzenet 2–5 sor', () => {
  const rosszHely = EN.replace('## Warning signs\n', '').replace('## How to protect yourself', '## Warning signs\n\nSee above.\n\n## How to protect yourself');
  assert.ok(csalasSzerkezetHiba(rosszHely).includes('a példablokk nem a „Warning signs” alatt van'));
  const egySor = EN.replace('> Your package is on hold because the address is incomplete.\n', '').replace('> [[2|It will be deleted in 24 hours!]]\n', '> [[2|It will be deleted in 24 hours!]] ');
  assert.ok(csalasSzerkezetHiba(egySor).includes('nem 2–5 üzenetsor'), csalasSzerkezetHiba(egySor).join(' | '));
});

// ── kép-őr ──────────────────────────────────────────────────────────────────
t('🛡️ a minta biztonságos (example.com, 555-01xx, nincs márkanév)', () => {
  assert.deepEqual(peldaBiztonsag(peldaBlokk(EN)), []);
  assert.deepEqual(peldaBiztonsag(peldaBlokk(HU)), []);
});

t('🛡️ valódi domain → hiba', () => {
  const h = peldaBiztonsag(peldaBlokk(csere(EN, 'parcel-track.example.com', 'paypal-help.com')));
  assert.ok(h.some(x => x.includes('paypal-help.com')), h.join(' | '));
  const csapda = peldaBiztonsag(peldaBlokk(csere(EN, 'parcel-track.example.com', 'example.com.parcel-help.net')));
  assert.ok(csapda.length > 0, 'example.com.<valódi> is hiba');
  const email = peldaBiztonsag(peldaBlokk(csere(EN, 'Confirm here:', 'Write to help@parcel-desk.net or confirm here:')));
  assert.ok(email.some(x => x.includes('parcel-desk.net')), email.join(' | '));
});

t('🛡️ valódi márkanév → hiba (szóhatáros, kisbetű-érzéketlen)', () => {
  const h = peldaBiztonsag(peldaBlokk(csere(EN, 'Your package', 'Your Amazon package')));
  assert.ok(h.some(x => x.includes('Amazon')), h.join(' | '));
  const kis = peldaBiztonsag(peldaBlokk(csere(EN, 'Your package', 'Your usps package')));
  assert.ok(kis.some(x => x.includes('USPS')), kis.join(' | '));
  const eszkoz = peldaBiztonsag(peldaBlokk(csere(EN, 'Your package', 'Your ChatGPT package')));
  assert.ok(eszkoz.some(x => x.includes('ChatGPT')), eszkoz.join(' | '));
  // szóhatár: a „Citizen” nem „Citi”, a „targeted” nem „Target”
  const szohatar = peldaBiztonsag(peldaBlokk(csere(EN, 'Your package', 'Dear citizen, your targeted package')));
  assert.deepEqual(szohatar, []);
});

t('🛡️ a márkalista a tool-links.json eszközeit és cégeit is tartalmazza', () => {
  const nevek = tiltottNevek();
  for (const n of ['ChatGPT', 'OpenAI', 'Amazon', 'PayPal', 'IRS', 'Social Security']) assert.ok(nevek.includes(n), n);
});

t('🛡️ nem 555-01xx telefonszám → hiba; a kitalált tartomány rendben', () => {
  const h = peldaBiztonsag(peldaBlokk(csere(EN, '+1 (555) 555-0199', '+1 (800) 555-1234')));
  assert.ok(h.some(x => x.includes('800')), h.join(' | '));
  const valodiKozep = peldaBiztonsag(peldaBlokk(csere(EN, '+1 (555) 555-0199', '(312) 555-2368')));
  assert.ok(valodiKozep.length > 0, '555-2368 nem a kitalált tartomány');
  for (const jo of ['(555) 555-0100', '202-555-0147', '555-0123', '+1 312 555 0188']) {
    assert.deepEqual(peldaBiztonsag(peldaBlokk(csere(EN, '+1 (555) 555-0199', jo))), [], jo);
  }
  const rendelesSzam = peldaBiztonsag(peldaBlokk(csere(EN, 'Your package', 'Your package #48213977')));
  assert.ok(rendelesSzam.length > 0, 'hosszú számsor is telefonszámnak számít (óvatosság)');
});

t('🛡️ null bemenet → hiba, nem dob', () => {
  assert.ok(peldaBiztonsag(null).length > 0);
});

// ── fordítás-egyezés ────────────────────────────────────────────────────────
t('🌐 a hibátlan magyar fordítás egyezik', () => {
  assert.equal(forditasEgyezik(EN, HU), true);
});

t('🌐 a jelet elhagyó / a domaint lefordító / angolul hagyott fordítás NEM egyezik', () => {
  assert.equal(forditasEgyezik(EN, csere(HU, '[[2|24 órán belül törlődik!]]', '24 órán belül törlődik!')), false);
  assert.equal(forditasEgyezik(EN, csere(HU, 'parcel-track.example.com', 'pelda.hu')), false);
  assert.equal(forditasEgyezik(EN, csere(HU, '+1 (555) 555-0199', '+36 1 555 0199')), false);
  assert.equal(forditasEgyezik(EN, csere(HU, '> 🧪 [sms]', '> 🧪 [e-mail]')), false);
  assert.equal(forditasEgyezik(EN, HU.replace(/> 🧪[\s\S]*?3\. \*\*Furcsa link\*\*[^\n]*\n/, '')), false);
  // angolul hagyott blokk (a fejezetek magyarok, a példa angol)
  const angolBlokk = HU.replace(/> 🧪[\s\S]*?3\. \*\*Furcsa link\*\*[^\n]*\n/, EN.match(/> 🧪[\s\S]*?3\. \*\*Odd link\*\*[^\n]*\n/)[0]);
  assert.equal(forditasEgyezik(EN, angolBlokk), false);
});

t('🌐 ha az angolban nincs példablokk, a fordítás-egyezés igaz', () => {
  assert.equal(forditasEgyezik('# A\n\nSzöveg.\n', '# A\n\nSzöveg.\n'), true);
});

// ── blokk nélkül (az igazság-kapunak) ──────────────────────────────────────
t('✂️ peldaBlokkNelkul: a blokk és a 3 elemű lista egyetlen jelölt sorra cserélődik', () => {
  const md = peldaBlokkNelkul(EN);
  assert.ok(!md.includes('parcel-track'));
  assert.ok(!md.includes('Odd link'));
  assert.ok(md.includes('Illustrative example'));
  assert.ok(md.includes(PELDA_HELYETTES));
  assert.ok(md.includes('## How to protect yourself'), 'a többi szöveg marad');
  assert.ok(md.includes("1. Don't click links"), 'a védekezés számozott listája marad');
  assert.equal(peldaBlokkNelkul('# A\n\nSzöveg.\n'), '# A\n\nSzöveg.\n');
});

// ── csere HTML-re ───────────────────────────────────────────────────────────
t('🖼️ peldaBlokkCsere képpel: figure + img + figcaption, nincs [[ maradék', () => {
  const md = peldaBlokkCsere(EN, { kepUt: '/x.jpg', alt: 'a "fake" <text>' });
  assert.ok(md.includes('<figure class="csalas-pelda">'));
  assert.ok(md.includes('src="/x.jpg"'));
  assert.ok(md.includes('width="1080" height="1350"'));
  assert.ok(md.includes('alt="a &quot;fake&quot; &lt;text&gt;"'), 'az alt escape-elve');
  assert.ok(md.includes('<figcaption'));
  assert.ok(md.includes('Pressure'));
  assert.ok(!md.includes('[['));
  assert.ok(!md.includes('> 🧪'));
  assert.ok(md.includes('## How to protect yourself'));
});

t('🖼️ peldaBlokkCsere kép nélkül: szöveges, jelölt változat a cikk nyelvén', () => {
  const md = peldaBlokkCsere(HU, { kepUt: '', alt: '', nyelv: 'hu' });
  assert.ok(md.includes('csalas-pelda--szoveg'));
  assert.ok(md.includes(PELDA_JELOLES.hu));
  assert.ok(!md.includes(PELDA_JELOLES.en), 'magyar oldalon nincs angol jelölés');
  assert.ok(md.includes('<mark'), 'a jelölt szövegrészek kiemelve');
  assert.ok(md.includes('24 órán belül törlődik!'));
  assert.ok(!md.includes('[['));
});

t('🖼️ a HTML-blokkban nincs üres sor (különben a marked szétszedi)', () => {
  for (const md of [peldaBlokkCsere(EN, { kepUt: '/x.jpg', alt: 'a' }), peldaBlokkCsere(EN, { kepUt: '' })]) {
    const html = md.match(/<(figure|div) class="csalas-pelda[\s\S]*?<\/\1>/)[0];
    assert.ok(!/\n\s*\n/.test(html));
  }
});

t('🖼️ peldaBlokkCsere: ha nincs blokk, a szöveg változatlan', () => {
  assert.equal(peldaBlokkCsere('# A\n\nSzöveg.\n', { kepUt: '/x.jpg', alt: 'a' }), '# A\n\nSzöveg.\n');
});

if (hiba) { console.log(`\n❌ csalas-sablon: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ csalas-sablon: minden zöld');
