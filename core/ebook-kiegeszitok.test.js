// TESZT — a PDF-csomagok bővítése a honlap meglévő anyagából (2026-11-16). Ingyenes, hálózat nélküli.
// MIÉRT (user 11-16: „az újraírásnál nézd át, mit tudunk beletenni a meglévő anyagból!” → „oké csináld!”):
//   1) 117 jó útmutató egyik témába sem sorolódott → kimaradt (core/topics.js szólista bővítve)
//   2) a 30 nap top-20 útmutatójából csak 12 volt a PDF-ekben → a legolvasottabb elöl (olvasottsagBetolt)
//   3) „Ha elakadsz” doboz, 4) kitölthető mezők jelölése, 5) szójegyzék, 6) prompt-függelék minden csomagban
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { olvasottsagBetolt, szotarBetolt, mezoJeloles, konyvHtml, utmutatokBetolt, SZOVEG } from './ebook-build.js';
import { valogat, csomag } from './ebook-pack.js';
import { temaOf } from './topics.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n🧪 ebook-kiegeszitok.test');

// ---------- 1) témaminták: a valódi, eddig besorolatlan címek ----------
t('1) a valódi, eddig besorolatlan útmutató-címek most témát kapnak', () => {
  const esetek = {
    'Build a Simple Monthly Budget From Scratch With Any AI Assistant': 'money',
    'How to Write a Polite but Firm Complaint Letter About Bad Service': 'money',
    'Help Your Child With Homework Using AI — Without Giving the Answer': 'home',
    'How to Write a Heartfelt Wedding Speech Using Any AI Assistant': 'home',
    'How to get personalized gift ideas for someone who is hard to shop for': 'home',
    'Turn a casual selfie into a clean LinkedIn headshot with one Gemini prompt': 'create',
    'How to Write a Clear Prompt that Gets Better AI Answers': 'learn',
    'How to set ChatGPT custom instructions so it answers your way': 'learn',
    'Drafting a Polite but Firm Resignation Letter from Your Job': 'work',
    'Create a clear README in 10 minutes with GitHub Copilot': 'work',
    'How to quickly fact‑check any AI answer in under one minute': 'explain',   // nem törő kötőjel (U+2011)!
    'How to clone your own voice with ElevenLabs, safely and with consent': 'safe',
    'Build a Custom Morning Briefing with News, Weather, and Calendar in Alexa+': 'automate'
  };
  for (const [cim, tema] of Object.entries(esetek)) assert.equal(temaOf(cim), tema, cim);
});

t('1) a bővítés NEM sorolta át a régi, jó besorolást (a 11-16-i mérés 3 visszajavított esete)', () => {
  assert.equal(temaOf('Set Up an Alexa+ Routine to Automate Your Everyday Tasks'), 'automate');
  assert.equal(temaOf('How to Create Custom Images with Copilot for Invites and Social Posts'), 'create');
  assert.equal(temaOf('Turn a voice memo into a polished meeting summary with Hugging Face’s free speech-to-text'), 'work');
});

t('1) szóhatár: a rövid új szavak nem illeszkednek szórészre', () => {
  assert.equal(temaOf('Stay focused with a cost-free timer'), 'money');      // „cost” egész szó → jogos
  assert.equal(temaOf('Write a costume party invitation'), 'home');         // „costume” NEM „cost”, a „party” dönt
  assert.equal(temaOf('Get faster at typing'), null);                       // „tv” nincs a „typing”-ban
});

// ---------- 2) olvasottság ----------
t('2) olvasottság: 30 nap a napló UTOLSÓ napjától; /es/ számít, /hu/ NEM; .html és perjel mindegy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'olv-'));
  try {
    const ut = join(dir, 'tl.json');
    writeFileSync(ut, JSON.stringify({ days: {
      '2026-09-01': [{ path: '/article/regi', visits: 99 }],                       // 30 napon kívül
      '2026-10-01': [{ path: '/article/a', visits: 2 }],                            // a 30. nap → bent
      '2026-10-30': [{ path: '/article/a', visits: 3 }, { path: '/es/article/a.html', visits: 4 },
        { path: '/hu/article/a', visits: 50 }, { path: '/article/b/', visits: 1 }, { path: '/guides', visits: 7 }]
    } }));
    assert.deepEqual(olvasottsagBetolt(ut, 30), { a: 9, b: 1 });
    assert.deepEqual(olvasottsagBetolt(join(dir, 'nincs.json')), {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

t('2) a válogatás a legolvasottabbat teszi előre (olvasottság nélkül a régi rend)', () => {
  const cikk = (slug, cim, lep) => ({ slug, tool: slug, md: `---\ntitle: "${cim}"\n---\n` +
    Array.from({ length: lep }, (_, i) => `## Step ${i + 1}: x\n` + 'szó '.repeat(250)).join('\n') +
    '\n## Common mistakes\nx\n## What this means for you\nx\n' });
  const k = [cikk('reszletes', 'Sort your inbox fast', 9), cikk('olvasott', 'Clean up a flooded inbox', 4)];
  assert.deepEqual(valogat(k, { tema: 'work' })[0].cikkek.map(c => c.slug), ['reszletes', 'olvasott']);
  assert.deepEqual(valogat(k, { tema: 'work', olvasott: { olvasott: 40, reszletes: 2 } })[0].cikkek.map(c => c.slug), ['olvasott', 'reszletes']);
  const k3 = [...k, cikk('harmadik', 'Draft a meeting note', 5)];   // a csomag legalább 3 útmutatóból áll (MIN_CSOMAG)
  assert.equal(csomag(k3, { tema: 'work', olvasott: { olvasott: 40 } }).szakaszok[0].cikkek[0].slug, 'olvasott');
});

// ---------- 4) kitölthető mezők ----------
t('4) mező-jelölés: a példaszó marad, mellé kerül a „mit írj ide”; csak EGYSZER előforduló szónál', () => {
  const mezok = { k1: [{ eredeti: 'Chicago', hely: 'your city' }, { eredeti: 'pasta', hely: 'your dish' }] };
  const h = mezoJeloles('<p>Plan a trip to Chicago. We love pasta and more pasta.</p>', mezok);
  assert.ok(h.includes('<span class="fill">Chicago</span><span class="fill__h">your city</span>'));
  assert.ok(!h.includes('fill">pasta'), 'kétszer előforduló szót jelölt');
  assert.equal(h.replace(/<span class="fill__h">[^<]*<\/span>/g, '').replace(/<\/?span[^>]*>/g, ''),
    '<p>Plan a trip to Chicago. We love pasta and more pasta.</p>', 'a szöveg megváltozott');
});

t('4) mező-jelölés: címkében/linkben soha; a „$” a feliratban nem rontja el; üres bemenet változatlan', () => {
  const h = mezoJeloles('<a href="/article/chicago-trip">trip</a> to chicago-trip', { k: [{ eredeti: 'chicago-trip', hely: 'your $& place' }] });
  assert.ok(h.startsWith('<a href="/article/chicago-trip">'), 'a linkbe nyúlt');
  assert.ok(h.includes('<span class="fill__h">your $&amp; place</span>') || h.includes('<span class="fill__h">your $& place</span>'));
  assert.equal(mezoJeloles('<p>x</p>', null), '<p>x</p>');
  assert.equal(mezoJeloles('<p>x</p>', {}), '<p>x</p>');
});

// ---------- 5) szójegyzék ----------
t('5) szójegyzék: angolul és spanyolul is mind a 46 szó, ábécérendben, a spanyolban nincs angol tartalék', () => {
  const en = szotarBetolt('en'), es = szotarBetolt('es');
  assert.ok(en.length >= 40 && es.length === en.length, `${en.length} / ${es.length}`);
  assert.deepEqual(en.map(x => x.term), [...en.map(x => x.term)].sort((a, b) => a.localeCompare(b, 'en')));
  const enSzavak = new Set(en.map(x => x.def));
  assert.ok(!es.some(x => enSzavak.has(x.def)), 'angol meghatározás a spanyol szójegyzékben');
});

// ---------- 3)+5)+6) a kész könyvben, VALÓDI útmutatókkal ----------
const elo = utmutatokBetolt();
t('3) VALÓDI útmutatóval: a „Ha elakadsz” doboz a PDF-be is bekerül, angolul és spanyolul a saját nyelvén', () => {
  const c = elo.find(x => x.slug === 'how-to-plan-meals-and-a-grocery-budget-with-ai');
  if (!c) { console.log('     (az útmutató nincs fent — kihagyva)'); return; }
  const sz = [{ id: 'home', cim: 'Home & family', cikkek: [c] }];
  const en = konyvHtml(sz, { nyelv: 'en', tema: 'home' }), es = konyvHtml(sz, { nyelv: 'es', tema: 'home' });
  assert.match(en, /<section class="g-elakad"><h2 class="g-elakad__cim">🔧 If you get stuck<\/h2>/);
  assert.match(es, /<section class="g-elakad"><h2 class="g-elakad__cim">🔧 Si te atascas<\/h2>/);
  assert.ok(!/If you get stuck|What to do:/.test(es), 'angol felirat a spanyol csomagban');
});

t('5)+6) minden csomagban: szójegyzék + prompt-függelék a jegyzékben is; az őszinte oldal elmagyarázza a jelölést', () => {
  for (const nyelv of ['en', 'es']) {
    for (const tema of ['all', 'safe', 'work']) {
      const c = csomag(elo, { tema, nyelv });
      if (!c.ok) continue;
      const html = konyvHtml(c.szakaszok, { nyelv, tema });
      assert.match(html, /id="glossary"/, `${tema}-${nyelv}: nincs szójegyzék`);
      assert.match(html, /href="#glossary"/, `${tema}-${nyelv}: a jegyzékből hiányzik a szójegyzék`);
      assert.match(html, /id="prompts"/, `${tema}-${nyelv}: nincs prompt-függelék`);
      assert.ok(html.includes(SZOVEG[nyelv].kitoltes), `${tema}-${nyelv}: az őszinte oldalról hiányzik a jelölés magyarázata`);
      assert.ok(!/<input/.test(html), `${tema}-${nyelv}: beviteli mező került a PDF-be`);
    }
  }
});

t('1)+2) VALÓDI adaton: a nagy gyűjteménybe a besorolt, alkalmas útmutatók legalább 90%-a bekerül', () => {
  const c = csomag(elo, { tema: 'all', nyelv: 'en' });
  assert.ok(c.ok && c.db >= Math.floor(elo.length * 0.9), `csak ${c.db} útmutató a ${elo.length}-ből`);   // 11-16: 354 / 385
});

console.log(`\n${hiba === 0 ? '✅' : '❌'} ebook-kiegeszitok.test: ${hiba} bukott`);
if (hiba) process.exit(1);
