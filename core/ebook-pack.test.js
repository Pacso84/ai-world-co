// ===================================================================
// TESZT — FIZETŐS CSOMAG (Everyday AI Starter Pack), 2026-09-09
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// User-döntés: PDF-csomag · angolul · Ko-fi · $9 · vegyes téma.
//
// 🔑 ITT A VÁLOGATÁS MINŐSÉGE MAGA A TERMÉK. Egy rosszul besorolt vagy
// használhatatlan útmutató nem szépséghiba: a vevő ezért fizetett.
// Ezért fut a záró szakasz a VALÓDI `content/articles/` tartalmán.
// ===================================================================

import assert from 'assert/strict';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  valogat, csomag, alkalmas, teruletOf, cimBol, lepesSzam, szovegNyelven,
  horgony, horgonyok, promptok, promptLista, promptBeirhato, PROMPT_CIMKE,
  TERULETEK, SZUK_ESZKOZ, DB_TERULETENKENT, DB_MINI, DB_NAGY, MIN_CSOMAG, SZO_PER_OLDAL
} from './ebook-pack.js';
import { torzs, konyvHtml, utmutatokBetolt, csomagCim } from './ebook-build.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 fizetős csomag — a válogatás minősége MAGA a termék\n');

const cikk = (cim, { tool = '', lep = 5, szo = 1200 } = {}) => ({
  slug: cim.toLowerCase().replace(/[^a-z0-9]+/g, '-'), tool,
  md: `---\ntitle: "${cim}"\n---\n\n`
    + Array.from({ length: lep }, (_, i) => `## Step ${i + 1} — do it\n${'word '.repeat(Math.ceil(szo / lep))}`).join('\n')
    + '\n\n## Common mistakes\nx\n\n## What this means for you\ny\n'
});

/**
 * Ugyanaz a cikk KÉSZ spanyol fordítással. A spanyol cím SZÁNDÉKOSAN más —
 * a valódi fordításokban is az, és éppen az azonosság a néma-visszaesés jele.
 */
const esCikk = (cim, esCim, opt) => {
  const c = cikk(cim, opt);
  return { ...c, es: c.md.replace(cim, esCim).replace(/## Step /g, '## Paso ') };
};

/** Az élő tartalom — EGY betöltéssel, ugyanazzal a függvénnyel, mint a gyártás. */
const eloCikkek = (() => {
  let gyorsitott = null;
  return () => (gyorsitott ||= existsSync(join(ROOT, 'content', 'articles')) ? utmutatokBetolt() : []);
})();

// ===================================================================
// 1. A MINŐSÉGI MÉRCE
// ===================================================================
t('a hiányos útmutató NEM kerül fizetős csomagba', () => {
  assert.equal(alkalmas(cikk('Good one')), true);
  assert.equal(alkalmas(cikk('Too few steps', { lep: 2 })), false, '2 lépés átment');
  assert.equal(alkalmas(cikk('Too short', { szo: 300 })), false, '300 szó átment');
  const nincsHiba = { ...cikk('No mistakes section') };
  nincsHiba.md = nincsHiba.md.replace('## Common mistakes', '## Wrap up');
  assert.equal(alkalmas(nincsHiba), false, 'a „Common mistakes" nélküli átment');
});

t('🔑 KÜLÖNLEGES HARDVERT igénylő eszköz kimarad (valódi lelet)', () => {
  // Az első válogatásom élére egy „home-assistant chatbot NVIDIA ChatRTX-szel"
  // került, mert az volt a legrészletesebb — ahhoz viszont RTX videokártya
  // kell. 🔑 A LEGRÉSZLETESEBB NEM A LEGHASZNÁLHATÓBB. A vevő azt kérdezi:
  // „ezt én meg tudom csinálni?"
  for (const eszkoz of SZUK_ESZKOZ) {
    assert.equal(alkalmas(cikk('Set up something', { tool: eszkoz })), false, eszkoz + ' bekerült');
  }
  assert.equal(alkalmas(cikk('Set up something', { tool: 'ChatGPT' })), true);
});

t('hibás bemenet nem dob', () => {
  for (const rossz of [null, undefined, {}, { md: 42 }, 'szöveg']) {
    assert.doesNotThrow(() => alkalmas(rossz));
    assert.equal(alkalmas(rossz), false);
  }
  assert.doesNotThrow(() => valogat(null));
  assert.doesNotThrow(() => valogat('nem tömb'));
});

// ===================================================================
// 2. A BESOROLÁS — ezt két valódi hiba tanította meg
// ===================================================================
t('🔑 a SORREND számít: a phishing-útmutató BIZTONSÁG, nem „email"', () => {
  // VALÓDI HIBA: a „How to Spot a Phishing **Email**…" a Work területre
  // esett, mert az „email" hamarabb illeszkedett, mint a „phishing".
  assert.equal(teruletOf(cikk('How to Spot a Phishing Email or Scam Text')), 'safe');
  assert.equal(teruletOf(cikk('Turn Off AI Chat History and Data Saving')), 'safe');
  // …de a valódi e-mailes munkacikk MARAD a Work területen.
  assert.equal(teruletOf(cikk('Automate Email Drafts for Faster Inbox Management')), 'work');
});

t('🔑 a „shopping list" NEM pénzügy (valódi hiba volt)', () => {
  // Az első változatban a Money-terület öt cikkéből HÁROM étkezés-tervezés
  // és nyaralás lett, mert a „shopping list" és a „budget-friendly"
  // ráillett a mintára.
  assert.equal(teruletOf(cikk('Plan Your Weekly Meals and Shopping List')), 'home');
  assert.equal(teruletOf(cikk('Plan a Budget-Friendly City Vacation')), 'home');
  assert.equal(teruletOf(cikk('Build a Simple Personal Budget Spreadsheet')), 'money');
});

t('🔑 NINCS ÁTSZIVÁRGÁS: ami az egyik terület top-5-jéből kimarad, nem esik a másikba', () => {
  // Ez volt a gyökérok: a kód területenként a TELJES készletből válogatott.
  // Hat home-cikk közül öt fér be — a hatodik SEHOVA nem mehet át.
  // ⚠️ A LÉPÉSSZÁM MIND A HATNÁL A MÉRCE FÖLÖTT VAN. Az első változatomban
  // `lep: 7-i` volt, így az utolsó kettő 3 és 2 lépéssel KIESETT a minőségi
  // mércén — és a teszt nem azt mérte, amit hittem (a rangsort a hossz adja).
  const sok = Array.from({ length: 6 }, (_, i) => cikk(`Plan a family dinner number ${i}`, { lep: 5, szo: 2000 - i * 100 }));
  const v = valogat([...sok, cikk('Build a Simple Personal Budget Spreadsheet')]);
  const home = v.find(x => x.id === 'home'), money = v.find(x => x.id === 'money');
  assert.equal(home.cikkek.length, DB_TERULETENKENT);
  assert.equal(money.cikkek.length, 1, 'a home hatodik cikke átszivárgott a money-ba');
  assert.ok(!money.cikkek.some(c => /family dinner/.test(cimBol(c.md))), 'family-cikk a pénzügyi részben');
});

// ===================================================================
// 3. VÁLTOZATOSSÁG A CSOMAGON BELÜL
// ===================================================================
t('🔑 nem lesz öt „Getting started with…" egymás mellett', () => {
  // Ugyanaz a lecke, mint a Reel-sornál (ugyanaznap): a tartalmunk
  // kötegekben készült, ezért a puszta „legrészletesebb N" ismételne.
  // ⚠️ A RÖGZÍTŐ 2026-09-10-én ELAVULT: a „Getting started with…" címek azóta
  // a `learn` témára esnek (a közös `core/topics.js` bevezetésekor), nem a
  // `work`-re. A teszt SZÁNDÉKA jó volt, a mintája nem — ezért most olyan
  // címeket használ, amelyek egyértelműen EGY témán belül maradnak.
  const jeloltek = [
    ...Array.from({ length: 5 }, (_, i) => cikk(`Sort your inbox with tool ${i}`, { lep: 9 - i })),
    cikk('Clean up a flooded inbox', { lep: 4 }),
    cikk('Write a polite complaint email', { lep: 4 })
  ];
  const work = valogat(jeloltek).find(x => x.id === 'work');
  const kezdetek = work.cikkek.map(c => cimBol(c.md).toLowerCase().split(' ').slice(0, 3).join(' '));
  const egyedi = new Set(kezdetek);
  assert.ok(egyedi.size >= 3, 'a csomag ' + kezdetek.length + ' cikkéből csak ' + egyedi.size + ' különböző kezdet');
});

t('🚨 a változatosság NEM tehet hiányossá: ha nincs más, feltölt', () => {
  // A vevő 25 útmutatót vásárolt. A változatosság kényelem, a DARABSZÁM
  // az ígéret — ha minden jelölt hasonlít, akkor is tele kell lennie.
  const egyformak = Array.from({ length: 5 }, (_, i) => cikk(`Sort your inbox fast ${i}`, { tool: 'ChatGPT', lep: 9 - i }));
  const work = valogat(egyformak).find(x => x.id === 'work');
  assert.equal(work.cikkek.length, DB_TERULETENKENT, 'a terület hiányos maradt a változatosság miatt');
});

// ===================================================================
// 4. A HÁROM „NEM ALKU TÁRGYA" SZABÁLY A KÖNYVBEN
// ===================================================================
t('🚨 a könyv KIMONDJA, hogy a tartalom ingyen is elérhető', () => {
  // Egy fizetős csomag, ami elhallgatja, hogy a tartalma ingyen is megvan,
  // MEGTÉVESZTÉS. Ez nem stílus-kérdés.
  const html = konyvHtml(valogat([cikk('Automate Email Drafts')]));
  assert.match(html, /also free on our website/i, '⚠️ a csomag elhallgatja, hogy a tartalom ingyenes');
});

t('🚨 a könyv KIMONDJA: MI írta, EMBER nem szerkesztette', () => {
  // 2026-09-19: a régi mondat („written by our AI editorial team and reviewed
  // for accuracy and clarity") KÉT olyat állított, amit nem tudunk fedezni:
  // emberi felülvizsgálatot (NINCS) és egy „csapatot" (eufemizmus). A honlap
  // lábléce és a cikk-címkék pont az ellenkezőjét mondják. Egy FIZETŐS termék
  // nem állíthat többet, mint az ingyenes oldal — se az EU MI-rendelet 50.
  // cikke, se a fogyasztóvédelem szerint.
  const html = konyvHtml(valogat([cikk('Automate Email Drafts')]));
  assert.match(html, /written by AI\b/,
    '⚠️ eltűnt az AI-szerzőség — épp gépi tartalom miatt vagyunk keresői büntetésben');
  assert.match(html, /No human editor reviewed the text/i,
    '🔴 nincs kimondva, hogy emberi szerkesztő NEM nézte át (a honlap kimondja)');
  // A jel FŐ ELEME a nagybetűs, ANGOL „AI" — Gyakorlati Kódex 1.1(a), ugyanaz,
  // amit a honlap kártyáin az `aiMark()` ad.
  assert.match(html, /class="ai-mark">AI</, '🔴 eltűnt a nagybetűs „AI" jel');
  // 🔴 ÉS A TÚLÍGÉRÉS NE SZIVÁROGHASSON VISSZA. A mérce IRÁNYA itt is számít:
  // a „van-e jelölés" kérdés ZÖLD volt a régi, félrevezető szövegre is.
  assert.ok(!/reviewed for accuracy/i.test(html),
    '🔴 visszajött a „reviewed for accuracy and clarity" — ilyen felülvizsgálat NINCS');
  assert.ok(!/AI editorial team/i.test(html),
    '🔴 visszajött az „AI editorial team" — a honlapon 2026-09-12-én pont ezt cseréltük le');
});

t('🚨 a csomag NEM ígér olyan előnyt, ami az INGYENES oldalon is megvan', () => {
  // A régi szöveg „a version with no ads and no cookie banners"-t ígért. A
  // honlapon SEM hirdetés, SEM fizetőfal, SEM cookie-sáv nincs (a cikkek alja
  // szó szerint azt írja: „no ads, no paywall" — teszt is őrzi). Vagyis a
  // mondat olyan előnyt sugallt, amiért nem kellett fizetni.
  for (const nyelv of ['en', 'es']) {
    const html = konyvHtml(valogat([esCikk('Sort your inbox fast', 'Ordena tu bandeja')], { nyelv }),
      { nyelv, tema: 'work' });
    assert.ok(!/cookie/i.test(html), `${nyelv}: visszajött a cookie-sáv mint fizetős előny`);
  }
  const en = konyvHtml(valogat([cikk('Automate Email Drafts')]));
  assert.match(en, /no ads and no paywall either/i,
    '🔴 a csomag elhallgatja, hogy a honlap MAGA is hirdetés- és fizetőfal-mentes');
});

t('minden útmutatóhoz van HONLAP-LINK (a friss változat ott van)', () => {
  const v = valogat([cikk('Automate Email Drafts'), cikk('Plan a family dinner')]);
  const html = konyvHtml(v);
  const db = v.reduce((s, x) => s + x.cikkek.length, 0);
  assert.equal((html.match(/Read online/g) || []).length, db);
  assert.match(html, /https:\/\/aiworldhq\.com\/article\//);
});

t('a törzs a frontmatter és a H1 NÉLKÜL megy be (a címet mi adjuk)', () => {
  const md = '---\ntitle: "X"\n---\n\n# X\n\n## Step 1 — go\nszöveg';
  const b = torzs(md);
  assert.ok(!/^---/.test(b), 'a frontmatter bent maradt');
  assert.ok(!/^#\s/.test(b), 'a H1 duplikálódna a saját címünkkel');
  assert.match(b, /## Step 1/);
});

// ===================================================================
// 5. A TERMÉKSZERKEZET: 8 MINI + 1 NAGY (2026-09-18)
// ===================================================================
// ⚠️ Az itteni címek SZÁNDÉKOSAN kerülik a korábbi témák kulcsszavait: a
// besorolásban az ELSŐ illeszkedő téma nyer (safe → money → home → create →
// learn → work → explain → automate). Egy „Explain your **contract**" cím
// például a WORK témára esne, nem az explainre.
const MINTA_TEMAK = {
  safe: 'Spot a phishing message fast',
  money: 'Track a monthly bill with AI',
  home: 'Plan a family dinner',
  create: 'Make a photo look better',
  learn: 'Study a new language faster',
  work: 'Sort your inbox',
  // ⚠️ „Explain a tricky idea **simply**" NEM jó: a `simply` a LEARN téma
  // szava, és a learn HAMARABB fut. A fixtúra-hitelesítő teszt fogta meg —
  // pontosan ezért van.
  explain: 'Explain a tricky idea in plain words',
  automate: 'Automate a weekly routine'
};
/** Témánként N jelölt, mind a mérce fölött. */
const mintaKeszlet = (n = 14) => Object.values(MINTA_TEMAK)
  .flatMap(cim => Array.from({ length: n }, (_, i) => cikk(`${cim} ${i}`, { lep: 9 - (i % 5) })));

t('a MINTA-készlet tényleg mind a 8 témát lefedi (a mérce hitelesítése)', () => {
  // Ismert esettel hitelesítünk: ha a fixtúra besorolása elcsúszik, az alábbi
  // tesztek „zöldek" lennének anélkül, hogy bármit is mérnének.
  for (const [id, cim] of Object.entries(MINTA_TEMAK)) {
    assert.equal(teruletOf(cikk(cim)), id, `a(z) „${cim}" nem a(z) ${id} témára esik`);
  }
  assert.equal(Object.keys(MINTA_TEMAK).length, TERULETEK.length, 'új téma jött, a fixtúra nem követte');
});

t('a téma-csomag CSAK a saját témája cikkeit tartalmazza', () => {
  for (const id of ['work', 'home', 'safe']) {
    const v = valogat(mintaKeszlet(), { tema: id });
    assert.equal(v.length, 1, 'egy téma = egy szakasz');
    assert.equal(v[0].id, id);
    assert.equal(v[0].cikkek.length, DB_MINI, `a(z) ${id} mini nem telt ki`);
    for (const c of v[0].cikkek) {
      assert.equal(teruletOf(c), id, `idegen téma a(z) ${id} csomagban: ${cimBol(c.md)}`);
    }
  }
});

t('ahol kevés az alkalmas, ANNYI lesz — de a mérce alá nem megy', () => {
  // A safe/money/automate témán élesben is kevesebb van, mint 12: a csomag
  // ilyenkor RÖVIDEBB, nem gyengébb. Feltölteni idegen témával tilos.
  const keves = [...Array.from({ length: 4 }, (_, i) => cikk(`Spot a phishing message fast ${i}`)),
    ...mintaKeszlet(14).filter(c => teruletOf(c) === 'work')];
  const v = valogat(keves, { tema: 'safe' });
  assert.equal(v[0].cikkek.length, 4, 'idegen témával töltötte fel a hiányt');
});

t('🚫 NINCS TERMÉK 3 CIKK ALATT — okot ad vissza, nem üres fájlt', () => {
  // Ugyanaz az elv, mint a heti videónál: inkább ne legyen termék, mint
  // rossz termék. Egy 2 cikkes „csomag" a boltban nem szépséghiba: panasz.
  const ketto = [cikk('Spot a phishing message fast'), cikk('Spot a scam text early')];
  const r = csomag(ketto, { tema: 'safe' });
  assert.equal(r.ok, false, 'két cikkből is terméket gyártott');
  assert.equal(r.db, 2);
  assert.match(r.indok, /2/, 'az ok nem mondja meg, hány cikk van');
  assert.equal(csomag([], { tema: 'money' }).ok, false, 'üres bemenetből is terméket gyártott');
  assert.equal(MIN_CSOMAG, 3, 'a mérce elmozdult — a teszt fixtúrái is ehhez vannak szabva');
  assert.equal(csomag([...ketto, cikk('Keep your password private')], { tema: 'safe' }).ok, true,
    'három cikkből MÁR van termék');
});

t('ismeretlen téma és ismeretlen nyelv OKOT ad, nem dob', () => {
  const k = mintaKeszlet();
  assert.equal(csomag(k, { tema: 'nincs-ilyen-tema' }).ok, false);
  // A `de`/`fr` 2026-08-25-én VÉGLEG kivezetett nyelv — ha valaki mégis
  // kéri, magyarázatot kapjon, ne egy üres angol csomagot.
  assert.equal(csomag(k, { nyelv: 'de' }).ok, false, 'kivezetett nyelvre is gyártott');
  assert.match(csomag(k, { nyelv: 'de' }).indok, /nyelv/);
});

t('🔑 A TERMÉKÍGÉRET: a nagy gyűjtemény MARADÉKTALANUL tartalmazza mind a 8 minit', () => {
  // Ez maga a termék-szerkezet: aki megveszi a „work" minit ÉS a
  // gyűjteményt, ne találjon bejelentetlen átfedést. Ha ez elcsúszik, a
  // VEVŐNEK tűnik fel, nem nekünk.
  const k = mintaKeszlet();
  const nagy = valogat(k, { tema: 'all' });
  const nagySlug = new Set(nagy.flatMap(s => s.cikkek.map(c => c.slug)));
  for (const ter of TERULETEK) {
    const mini = valogat(k, { tema: ter.id })[0].cikkek;
    assert.ok(mini.length > 0, `üres mini: ${ter.id}`);
    for (const c of mini) {
      assert.ok(nagySlug.has(c.slug),
        `🔴 a(z) ${ter.id} mini cikke KIMARADT a gyűjteményből: ${cimBol(c.md)}`);
    }
    // …és nem csak benne van: a szakasz ELEJÉN áll, ugyanabban a sorrendben.
    const szakasz = nagy.find(s => s.id === ter.id).cikkek.slice(0, mini.length);
    assert.deepEqual(szakasz.map(c => c.slug), mini.map(c => c.slug),
      `a(z) ${ter.id} szakasz nem a mini-csomaggal kezdődik`);
  }
});

t('🔑 a PLAFON a mélyítést fogja vissza, a minikbe SOHA nem vág bele', () => {
  // A plafon a gyűjtemény MÉRETÉT szabályozza. Ha a nyolc mini önmagában
  // túllépné, akkor is teljes marad: a termékígéret erősebb, mint a méret.
  const k = mintaKeszlet();
  const szoros = valogat(k, { tema: 'all', dbNagy: 5 });
  const db = szoros.reduce((s, x) => s + x.cikkek.length, 0);
  assert.equal(db, TERULETEK.length * DB_MINI, 'a plafon megcsonkította a mini-csomagokat');
  // …a bőséges plafon viszont TÖBBET hoz, mint a puszta minik összege.
  assert.ok(valogat(mintaKeszlet(30), { tema: 'all' }).reduce((s, x) => s + x.cikkek.length, 0) > db,
    'a gyűjtemény nem mélyít a minik fölé');
  assert.ok(DB_NAGY > TERULETEK.length * DB_MINI, 'a plafon a minik összege alatt van');
});

t('nincs ÁTFEDÉS két MINI-csomag között (egy cikk EGY témában van)', () => {
  const k = mintaKeszlet();
  const hol = new Map();
  for (const ter of TERULETEK) for (const c of valogat(k, { tema: ter.id })[0].cikkek) {
    assert.ok(!hol.has(c.slug),
      `🔴 ${cimBol(c.md)} két csomagban is szerepel: ${hol.get(c.slug)} és ${ter.id}`);
    hol.set(c.slug, ter.id);
  }
});

// ===================================================================
// 6. A SPANYOL ÁG — SOHA NE ESSEN VISSZA NÉMÁN AZ ANGOLRA
// ===================================================================
// 🔴 EZ A PROJEKT VISSZATÉRŐ HIBÁJA: 2026-08-04-én a fordító TITLE-sor híján
// NÉMÁN az angolt mentette spanyol cikknek — 611-ből 3 cím, és egy közülük a
// kapcsolódó-dobozokon át 47 oldalra ült ki. Egy FIZETŐS spanyol csomagnál
// ugyanez visszatérítés. Ezért a hiányzó fordítás KIESIK, nem visszaesik.
t('🔴 a spanyol csomagba SPANYOL szöveg kerül', () => {
  const k = [
    esCikk('Sort your inbox fast', 'Ordena tu bandeja de entrada'),
    esCikk('Write a polite complaint email', 'Escribe una queja educada'),
    esCikk('Draft a meeting note', 'Redacta una nota de reunión')
  ];
  const v = valogat(k, { tema: 'work', nyelv: 'es' });
  assert.equal(v[0].cikkek.length, 3);
  for (const c of v[0].cikkek) {
    const sz = szovegNyelven(c, 'es');
    assert.ok(sz && sz !== c.md, 'az angol eredeti ment volna a spanyol csomagba');
  }
  const html = konyvHtml(v, { nyelv: 'es', tema: 'work' });
  assert.match(html, /<html lang="es"/, 'a spanyol csomag angol nyelvi jelölést kapott');
  assert.match(html, /Ordena tu bandeja de entrada/, 'nincs benne a spanyol cím');
  assert.ok(!/Sort your inbox fast/.test(html), '🔴 az ANGOL cím került a spanyol csomagba');
  assert.match(html, /aiworldhq\.com\/es\/article\//, 'a link az angol oldalra visz');
});

t('🔴 a NÉMA VISSZAESÉS három alakja mind kiesik a spanyol csomagból', () => {
  const jo = esCikk('Sort your inbox fast', 'Ordena tu bandeja de entrada');
  const angolMasolat = { ...cikk('Clean a flooded inbox'), es: cikk('Clean a flooded inbox').md };
  const cimtelen = (() => { const c = cikk('Archive old inbox mail'); return { ...c, es: c.md.replace(/^title:.*$/m, 'x: y') }; })();
  const csonka = (() => { const c = cikk('Reply to inbox mail fast'); return { ...c, es: c.md.slice(0, Math.floor(c.md.length * 0.4)).replace(c.md.match(/title: "(.+)"/)[1], 'Responde rápido') }; })();
  const v = valogat([jo, angolMasolat, cimtelen, csonka], { tema: 'work', nyelv: 'es' });
  assert.deepEqual(v[0].cikkek.map(c => c.slug), [jo.slug],
    '🔴 néma angol/címtelen/csonka fordítás került a spanyol csomagba');
  // …angolul viszont MIND A NÉGY jó cikk.
  assert.equal(valogat([jo, angolMasolat, cimtelen, csonka], { tema: 'work' })[0].cikkek.length, 4);
});

t('a spanyol felületi szöveg a NYELVI TÁBLÁBÓL jön, nem helyszíni fordításból', () => {
  const k = [esCikk('Sort your inbox fast', 'Ordena tu bandeja de entrada'),
    esCikk('Write a polite complaint email', 'Escribe una queja educada'),
    esCikk('Draft a meeting note', 'Redacta una nota de reunión')];
  const html = konyvHtml(valogat(k, { tema: 'work', nyelv: 'es' }), { nyelv: 'es', tema: 'work' });
  // 🇪🇺 A MI-JELÖLÉS ÉS AZ ŐSZINTE NYITÓ RÉSZ MINDKÉT NYELVEN KÖTELEZŐ.
  assert.match(html, /Antes de empezar/, 'eltűnt az őszinte nyitó rész spanyolul');
  // 🇪🇺 A PRÓZA a honlap SPANYOL szövegével egyezik („escritas por IA … ningún
  // editor humano"), a JEL viszont a nagybetűs ANGOL „AI" — ugyanaz a kettősség,
  // mint a honlap kártyáin. A régi „equipo editorial de IA" mindkettőt elmosta.
  assert.match(html, /escritas por IA/, '⚠️ eltűnt a MI-JELÖLÉS a spanyol csomagból');
  assert.match(html, /Ningún editor humano revisó el texto/,
    '🔴 a spanyol csomag elhallgatja, hogy emberi szerkesztő nem nézte át');
  assert.match(html, /class="ai-mark">AI</, '🔴 a spanyol csomagból eltűnt a nagybetűs „AI" jel');
  assert.ok(!/equipo editorial de IA/.test(html), '🔴 visszajött az eufemizmus');
  assert.match(html, /gratis en nuestra web/, 'a spanyol csomag elhallgatja, hogy a tartalom ingyenes');
  assert.match(html, /Trabajo y correo/, 'a szakasz-cím angolul maradt');
  // ⚠️ A LÉPÉSSZÁM AZ ANGOL EREDETIBŐL JÖN: a spanyol „## Paso 1" a
  // `lepesSzam()` angol mintájára NEM illeszkedik — a fordításból mérve MINDEN
  // spanyol cikk „0 pasos"-t írna ki.
  assert.match(html, /[1-9]\d* pasos/, '🔴 „0 pasos" — a lépésszámot a fordításból mérte');
});

t('a csomag CÍME témára és nyelvre szabott, paraméter nélkül a RÉGI név', () => {
  assert.equal(csomagCim(null), 'The Everyday AI Starter Pack');   // visszafelé kompatibilitás
  assert.match(csomagCim('all', 'es'), /colección/);
  assert.match(csomagCim('work', 'es'), /Trabajo y correo/);
  assert.match(csomagCim('work', 'en'), /Work & email/);
});

// ===================================================================
// 7. KATTINTHATÓ TARTALOMJEGYZÉK + PROMPT-FÜGGELÉK (2026-09-19)
// ===================================================================
// MIÉRT: a termékszöveg HÁROM extrát ígért a nagy csomagnál, és kettő nem
// létezett (kattintható jegyzék: 0 belső horgony; prompt-gyűjtemény: 0 — pedig
// 719 példa-prompt VAN a szövegben). Vagy megépítjük, vagy kihúzzuk az
// ígéretet; a user az építést kérte.
const belsoLinkek = (html) => [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
const azonositok = (html) => [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
/** A jegyzék (nav.toc) önmagában — a többi belső link a függelékből jön. */
const tocResz = (html) => (html.match(/<nav class="toc">[\s\S]*?<\/nav>/) || [''])[0];

t('🔗 a jegyzék minden eleme LÉTEZŐ horgonyra mutat (nincs halott belső link)', () => {
  // Ugyanaz az elv, mint a cikkek halott-link kapujánál: egy jegyzék, ami
  // sehova nem visz, egy 376 oldalas PDF-ben nem szépséghiba.
  const k = mintaKeszlet();
  for (const tema of [null, 'all', ...TERULETEK.map(x => x.id)]) {
    const v = valogat(k, tema ? { tema } : {});
    const html = konyvHtml(v, { tema });
    const ids = azonositok(html), linkek = belsoLinkek(html);
    assert.ok(linkek.length > 0, `${tema}: EGYETLEN belső link sincs — a jegyzék sima szöveg`);
    const halott = linkek.filter(x => !ids.includes(x));
    assert.deepEqual(halott, [], `${tema}: halott belső link(ek)`);
    // …és a jegyzék MINDEN pontja link, nem csak néhány.
    const toc = tocResz(html);
    assert.equal((toc.match(/<li/g) || []).length, (toc.match(/href="#/g) || []).length,
      `${tema}: a jegyzékben van link NÉLKÜLI pont`);
  }
});

t('🔑 a horgony a SLUG-ból jön, NEM a címből (a kettő a cikkek ~11%-ánál eltér)', () => {
  // A `_meta.slug` a kanonikus azonosítónk: a cím átírása sosem költöztet
  // oldalt. Címből képzett horgony egy cím-javításkor ELMOZDULNA, és két
  // hasonló cím ÜTKÖZHETNE — a PDF-ben az ütközés CSENDBEN rossz fejezetre visz.
  const c = cikk('Sort your inbox fast');
  c.slug = 'kanonikus-slug-2026';
  const html = konyvHtml([{ id: 'work', cim: 'Work & email', cikkek: [c] }]);
  assert.match(html, /id="g-kanonikus-slug-2026"/);
  assert.match(html, /href="#g-kanonikus-slug-2026"/);
  assert.ok(!/g-sort-your-inbox/.test(html), '🔴 a címből képzett azonosító került a PDF-be');
});

t('🔑 az azonosítók EGYEDIEK — két EGYFORMA slug is két külön horgonyt kap', () => {
  const a = cikk('Sort your inbox one'), b = cikk('Write a polite complaint email');
  b.slug = a.slug;                                     // szándékos ütközés
  const m = horgonyok([{ id: 'work', cikkek: [a, b] }]);
  assert.equal(new Set(m.values()).size, 2, '🔴 két cikk UGYANAZT a horgonyt kapta');
  assert.equal(m.get(a), horgony(a.slug));
  assert.match(m.get(b), /-2$/, 'az ütközés-feloldás nem sorszámoz');
  // A számmal kezdődő slug is érvényes HTML-azonosítót ad (`g-` előtag).
  assert.match(horgony('2026-guide'), /^g-2026-guide$/);
  assert.match(horgony(''), /^g-/, 'slug nélkül sincs csupasz azonosító');
});

// ── A PROMPT-KINYERŐ HITELESÍTÉSE ISMERT ESETTEL ────────────────────
// ⚠️ ENÉLKÜL A TÖBBI PROMPT-TESZT VAKON FUTNA: egy „N promptot találtam"
// állítás önmagában nem mond semmit arról, hogy a HELYES N-t találta-e meg.
// A fixtúra alakja a VALÓDI cikkekből van (a 💬 sor, a címke, és a címke +
// kódkerítés hármas) — nem kitalált formátum.
const PROMPT_FIXTURA = [
  '## Step 1 — ask for a note',
  '',
  '💬 *"Write a thank-you note to my neighbour."*',
  '',
  'Some prose in between that must not become a prompt.',
  '',
  '## Step 2 — plan a trip',
  '',
  '💬 Example: Type into the box:',
  '```',
  'Plan a 3-day trip to Lisbon.',
  'Keep it under $400.',
  'I travel with a toddler.',
  '```',
  '',
  'More prose.',
  '',
  '## Step 3 — summarize',
  '',
  '💬 **Example prompt:**',
  '"Summarize this email in two sentences."',
  ''
].join('\n');

t('🔑 A KINYERŐ HITELESÍTÉSE: 3 prompt van, a TÖBBSOROS pedig EGÉSZBEN jön', () => {
  const p = promptok(PROMPT_FIXTURA);
  assert.equal(p.length, 3, `3 prompt helyett ${p.length}: ` + JSON.stringify(p.map(x => x.szoveg)));
  assert.equal(p[0].szoveg, '*"Write a thank-you note to my neighbour."*');
  // A többsoros: MIND A HÁROM sor, az ELSŐ és az UTOLSÓ is. A csonkítás pont
  // azért alattomos, mert a részleges találat SIKERNEK látszik.
  assert.equal(p[1].kod, true, 'a kerítésből jött prompt nincs kód-jelölve');
  assert.equal(p[1].szoveg.split('\n').length, 3, '🔴 a többsoros prompt CSONKÁN jött ki');
  assert.match(p[1].szoveg, /^Plan a 3-day trip to Lisbon\./, 'elveszett a prompt ELSŐ sora');
  assert.match(p[1].szoveg, /toddler\.$/, '🔴 elveszett a prompt UTOLSÓ sora');
  assert.equal(p[1].bevezeto, 'Type into the box:', 'a felvezetés a prompt szövegébe folyt');
  assert.equal(p[2].szoveg, '"Summarize this email in two sentences."');
  for (const x of p) assert.ok(x.szoveg.trim(), 'ÜRES prompt került a listába');
  // A prózából SOHA nem lesz prompt, és a címke sem marad benne.
  assert.ok(!p.some(x => /prose/i.test(x.szoveg)), 'a próza promptként jött ki');
  assert.ok(!p.some(x => /^Example|^\*\*Example/i.test(x.szoveg)), 'a címke bent maradt a promptban');
  // Hibás/üres bemenet nem dob és nem gyárt promptot.
  for (const rossz of ['', null, undefined, 42, 'nincs benne jel']) {
    assert.doesNotThrow(() => promptok(rossz));
    assert.deepEqual(promptok(rossz), []);
  }
});

t('🔑 a BEÍRHATÓ prompt és a szemléltető példa különválik', () => {
  // A honlap ugyanezzel a jellel választ a „Try typing" és az „Example"
  // címke közt: idézőjellel kezdődik-e. Ezért nem hívjuk a függeléket
  // „719 promptnak" — 719 PÉLDA, amiből 266 beírható.
  assert.equal(promptBeirhato('"Write me a poem"'), true);
  assert.equal(promptBeirhato('*"Write me a poem"*'), true, 'a dőlt prompt is prompt');
  assert.equal(promptBeirhato('a "USPS" tracking link points to a fake domain'), false);
  assert.equal(promptBeirhato('Menu label to look for: *"Settings"*'), false);
});

t('💬 prompt nélküli útmutató KIMARAD a függelékből (nem kap üres helyet)', () => {
  const nincs = cikk('Sort your inbox fast');
  const van = cikk('Write a polite complaint email');
  van.md += '\n💬 *"Draft a polite complaint about a late delivery."*\n';
  const lista = promptLista([{ id: 'work', cikkek: [nincs, van] }], 'en');
  assert.equal(lista.length, 1, 'a prompt nélküli útmutató is bekerült a függelékbe');
  assert.equal(lista[0].cikk, van);
});

t('💬 a függelék CSAK a nagy gyűjteményben van (a termékszöveg is csak ott ígéri)', () => {
  const k = mintaKeszlet().map(c => ({ ...c, md: c.md + '\n💬 *"Do the thing."*\n' }));
  const nagy = konyvHtml(valogat(k, { tema: 'all' }), { tema: 'all' });
  assert.match(nagy, /id="prompts"/, '🔴 a nagy csomagból hiányzik a prompt-függelék');
  assert.match(nagy, /Every prompt and example in this pack/);
  for (const tema of [null, 'work']) {
    assert.ok(!/id="prompts"/.test(konyvHtml(valogat(k, tema ? { tema } : {}), { tema })),
      `${tema}: a mini csomagba is bekerült a függelék`);
  }
});

t('💬 a spanyol függelék SPANYOL promptokat és SPANYOL feliratot kap', () => {
  // 🔴 Ugyanaz a visszatérő hiba, mint a törzsnél: a néma angol visszaesés
  // SIKERNEK látszik. Egy fizetős spanyol csomagban ez visszatérítés.
  const k = Array.from({ length: 3 }, (_, i) => {
    const c = esCikk(`Sort your inbox fast ${i}`, `Ordena tu bandeja ${i}`);
    return { ...c, md: c.md + '\n💬 *"Draft a polite reply."*\n', es: c.es + '\n💬 *"Redacta una respuesta amable."*\n' };
  });
  const html = konyvHtml(valogat(k, { tema: 'all', nyelv: 'es' }), { tema: 'all', nyelv: 'es' });
  assert.match(html, /Todos los prompts y ejemplos/, 'a függelék felirata angolul maradt');
  assert.match(html, /Redacta una respuesta amable/, 'nincs benne a spanyol prompt');
  assert.ok(!/Draft a polite reply/.test(html), '🔴 ANGOL prompt a spanyol függelékben');
});

t('🔀 a 💬 címke-minta BETŰRE ugyanaz, mint a honlapon (másolat-csúszás ellen)', () => {
  // A kinyerő minta TUDATOS MÁSOLAT a `website/build.js` guideSectionHtml()-ből:
  // ugyanazt a 💬 blokkot kell megtalálnia, amit az olvasó a honlapon LÁT.
  // Importálni nem lehet (a build.js puszta importja épít és publikál), ezért
  // ez a teszt olvassa a fájlt SZÖVEGKÉNT. A másolat akkor ér valamit, ha
  // BETŰRE ugyanaz — a néma szétcsúszás a projekt visszatérő hibája.
  const web = join(ROOT, 'website', 'build.js');
  if (!existsSync(web)) { console.log('     (nincs website/build.js — kihagyva)'); return; }
  assert.ok(readFileSync(web, 'utf-8').includes(PROMPT_CIMKE),
    '🔴 a 💬 címke-minta ELCSÚSZOTT a honlapétól — a függelék más promptokat talál, mint amit az olvasó lát');
});

t('🏷️ a csomag darabszáma GÉPILEG is kiolvasható, és EGYEZIK a borítóval', () => {
  // A bolti feltöltési lista eddig csak találgatásból tudta a darabszámot —
  // és a találgatott szám pont az a fajta állítás, amit itt most javítunk.
  const html = konyvHtml(valogat(mintaKeszlet(), { tema: 'work' }), { tema: 'work' });
  assert.match(html, new RegExp(`<meta name="aiworld-guides" content="${DB_MINI}">`));
  assert.match(html, new RegExp(`${DB_MINI} step-by-step guides`),
    '🔴 a gépi szám és a borító EMBERI szövege szétcsúszott');
  assert.match(html, /<meta name="aiworld-lang" content="en">/);
});

// ===================================================================
// 8. A VALÓDI TARTALMON — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
console.log('\n🧪 a valódi útmutatókon');

t('🔑 ÉLES: a csomag TELJES és minden terület kitelik', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) { console.log('     (nincs útmutató — kihagyva)'); return; }

  const v = valogat(cikkek);
  const db = v.reduce((s, x) => s + x.cikkek.length, 0);
  const szo = v.reduce((s, x) => s + x.cikkek.reduce((n, c) => n + c.md.split(/\s+/).length, 0), 0);
  console.log(`     ↳ régi csomag: ${db} útmutató, ${szo} szó, ${v.length} terület`);
  assert.equal(v.length, TERULETEK.length);
  for (const ter of v) {
    assert.equal(ter.cikkek.length, DB_TERULETENKENT,
      `a(z) „${ter.cim}" területen csak ${ter.cikkek.length} útmutató van — hiányos a termék`);
  }
  assert.ok(szo > 25000, 'a csomag csak ' + szo + ' szó — vékony egy fizetős termékhez');
});

t('🔑 ÉLES: EGYETLEN útmutató sem szerepel KÉTSZER', () => {
  if (!eloCikkek().length) return;
  const slugok = valogat(eloCikkek()).flatMap(x => x.cikkek.map(c => c.slug));
  assert.equal(new Set(slugok).size, slugok.length, 'ugyanaz az útmutató kétszer van a csomagban');
});

t('🔑 ÉLES: minden kiválasztott útmutató átmegy a minőségi mércén', () => {
  if (!eloCikkek().length) return;
  for (const ter of valogat(eloCikkek())) for (const c of ter.cikkek) {
    assert.ok(alkalmas(c), cimBol(c.md) + ' nem felel meg a mércének');
    assert.ok(lepesSzam(c.md) >= 4, cimBol(c.md) + ' kevés lépés');
  }
});

// ⚠️ MÉRCE-KIÜRÜLÉS ELLENI KÜSZÖB. Ez a szakasz a VALÓDI tartalmon fut, és
// egy ilyen teszt attól a naptól kezdve hazudik, amikor a bemenete elfogy:
// „minden csomag rendben" — mert nulla csomagot nézett. Pontosan ez történt a
// magyar helyesírás-őrszemmel (773 cikkből 12-t nézett, és 0 hibát jelentett).
// Kimérve 2026-09-18-án: 399 alkalmas útmutató. A küszöb jóval alatta van,
// hogy a Házmester normál törlései ne buktassák — de a kiürülést elkapja.
const MIN_BEMENET = 300;

t('⚠️ a mérce TÉNYLEG lát elég bemenetet (különben a zöld semmit nem ér)', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) { console.log('     (nincs cikk-mappa — kihagyva)'); return; }
  const jo = cikkek.filter(alkalmas);
  console.log(`     ↳ ${cikkek.length} útmutató, ebből ${jo.length} alkalmas fizetős csomagba`);
  assert.ok(jo.length >= MIN_BEMENET,
    `csak ${jo.length} alkalmas útmutató (a mérce ${MIN_BEMENET}) — az élő tesztek vakon futnának`);
});

t('🔑 ÉLES: a nagy gyűjtemény mind a 9 csomagot lefedi, MINDKÉT nyelven', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) return;
  for (const nyelv of ['en', 'es']) {
    const nagy = csomag(cikkek, { tema: 'all', nyelv });
    assert.equal(nagy.ok, true, `nincs nagy csomag (${nyelv}): ${nagy.indok}`);
    const nagySlug = new Set(nagy.szakaszok.flatMap(s => s.cikkek.map(c => c.slug)));
    const sorok = [];
    for (const ter of TERULETEK) {
      const mini = csomag(cikkek, { tema: ter.id, nyelv });
      assert.equal(mini.ok, true, `nincs ${ter.id} mini (${nyelv}): ${mini.indok}`);
      sorok.push(`${ter.id} ${mini.db}/${mini.oldal}o`);
      for (const c of mini.szakaszok[0].cikkek) {
        assert.ok(nagySlug.has(c.slug),
          `🔴 ${nyelv}: a(z) ${ter.id} mini cikke kimaradt a gyűjteményből (${c.slug})`);
      }
    }
    console.log(`     ↳ ${nyelv}: all ${nagy.db} cikk / ${nagy.szo} szó / ~${nagy.oldal} oldal · ` + sorok.join(' · '));
  }
});

t('🔑 ÉLES: két mini-csomag SOHA nem fed át', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) return;
  for (const nyelv of ['en', 'es']) {
    const hol = new Map();
    for (const ter of TERULETEK) for (const c of csomag(cikkek, { tema: ter.id, nyelv }).szakaszok[0].cikkek) {
      assert.ok(!hol.has(c.slug), `${nyelv}: ${c.slug} két csomagban (${hol.get(c.slug)} + ${ter.id})`);
      hol.set(c.slug, ter.id);
    }
  }
});

t('🔴 ÉLES: a spanyol csomagok EGYETLEN cikke sem angol', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) return;
  let db = 0;
  for (const tema of ['all', ...TERULETEK.map(t => t.id)]) {
    for (const c of csomag(cikkek, { tema, nyelv: 'es' }).szakaszok.flatMap(s => s.cikkek)) {
      const sz = szovegNyelven(c, 'es');
      assert.ok(sz, `nincs spanyol szöveg: ${c.slug}`);
      assert.notEqual(cimBol(sz), cimBol(c.md), `🔴 ANGOL cím a spanyol csomagban: ${c.slug}`);
      db++;
    }
  }
  console.log(`     ↳ ${db} spanyol szakasz-cikk ellenőrizve, 0 angol visszaesés`);
});

// ⚠️ MÉRCE-KIÜRÜLÉS ELLENI KÜSZÖB A PROMPTOKRA. Ugyanaz a csapda, mint a
// bemenet-küszöbnél: ha a kinyerő egyszer elhallgat (egy elrontott minta, egy
// megváltozott írói szokás), a „minden prompt bekerült" állítás akkor is ZÖLD
// lenne, ha NULLA promptot néz. Kimérve 2026-09-19-én: 719 (en) / 723 (es).
const MIN_PROMPT = 300;

t('🔗 ÉLES: MIND A 18 csomagban 0 halott belső link és 0 ütköző azonosító', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) { console.log('     (nincs útmutató — kihagyva)'); return; }
  let linkDb = 0;
  for (const nyelv of ['en', 'es']) {
    for (const tema of ['all', ...TERULETEK.map(t => t.id)]) {
      const c = csomag(cikkek, { tema, nyelv });
      const html = konyvHtml(c.szakaszok, { nyelv, tema });
      const ids = azonositok(html), linkek = belsoLinkek(html);
      linkDb += linkek.length;
      assert.equal(ids.length, new Set(ids).size, `${tema}-${nyelv}: ÜTKÖZŐ azonosító`);
      const halott = linkek.filter(x => !ids.includes(x));
      assert.deepEqual(halott, [], `${tema}-${nyelv}: ${halott.length} halott belső link`);
      // A jegyzékben MINDEN útmutató szerepel, és mind link.
      const toc = tocResz(html);
      assert.equal((toc.match(/href="#/g) || []).length, c.db + c.szakaszok.length + (tema === 'all' ? 1 : 0),
        `${tema}-${nyelv}: a jegyzék nem a teljes csomagot sorolja fel`);
    }
  }
  console.log(`     ↳ 18 csomag, ${linkDb} belső link, 0 halott, 0 ütközés`);
});

t('💬 ÉLES: a függelékben MINDEN 💬 példa ott van, egy sem üresen', () => {
  const cikkek = eloCikkek();
  if (!cikkek.length) return;
  for (const nyelv of ['en', 'es']) {
    const c = csomag(cikkek, { tema: 'all', nyelv });
    const lista = promptLista(c.szakaszok, nyelv);
    const db = lista.reduce((s, x) => s + x.promptok.length, 0);
    const beir = lista.reduce((s, x) => s + x.promptok.filter(p => p.beir).length, 0);
    // A FÜGGETLEN MÉRCE: hány 💬 jel van magában a csomagba kerülő szövegben?
    // Ha a kinyerő elhallgat, ez a szám NEM mozdul vele — ezért mérce.
    const jel = c.szakaszok.flatMap(s => s.cikkek)
      .reduce((s, x) => s + ((szovegNyelven(x, nyelv) || '').match(/💬/g) || []).length, 0);
    assert.equal(db, jel,
      `🔴 ${nyelv}: ${jel} db 💬 van a csomag szövegében, de ${db} került a függelékbe`);
    for (const x of lista) for (const p of x.promptok) {
      assert.ok(p.szoveg.trim(), `🔴 ÜRES prompt a függelékben: ${x.cim}`);
    }
    assert.ok(db >= MIN_PROMPT,
      `csak ${db} prompt (a mérce ${MIN_PROMPT}) — a függelék-tesztek vakon futnának`);
    // …és a legyártott HTML-ben PONTOSAN ennyi pont van.
    const html = konyvHtml(c.szakaszok, { nyelv, tema: 'all' });
    assert.equal((html.match(/class="pr__i/g) || []).length, db,
      `${nyelv}: a függelék HTML-je nem a kinyert promptokat tartalmazza`);
    assert.equal((html.match(/class="pr__h"/g) || []).length, lista.length);
    assert.match(html, new RegExp(`<meta name="aiworld-prompts" content="${db}">`));
    console.log(`     ↳ ${nyelv}: ${db} példa (${beir} beírható) ${lista.length} útmutatóból, 0 üres`);
  }
});

t('a mért oldalszám a MÉRT 600 szó/oldal arányból jön', () => {
  // ⚠️ Az első becslésem 380 szó/oldal volt, a legyártott PDF 600-at adott —
  // a 104 oldalas jóslatból 66 lett. A hitelesítetlen jóslat marketing-szám.
  assert.equal(SZO_PER_OLDAL, 600);
  const cikkek = eloCikkek();
  if (!cikkek.length) return;
  const r = csomag(cikkek, { tema: 'work' });
  assert.equal(r.oldal, Math.round(r.szo / SZO_PER_OLDAL));
  assert.ok(r.szo > 0 && r.oldal > 0, 'a csomag 0 szót/oldalt mért — a számláló romlott el');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} ebook-pack.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
