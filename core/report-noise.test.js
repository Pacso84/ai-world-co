// ===================================================================
// TESZT — riport-zajszűrő
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
// A miértet lásd a core/report-noise.js fejlécében (user 2026-08-28:
// „kapok napi jelentést, de amit küld, az nem releváns").
//
// ⚠️ A MINTA A VALÓDI 2026-08-28-I RIPORTBÓL VAN, szó szerint. A projekt
// korábbi tanulsága: a fejből kitalált bemeneti alakra írt teszt az ALAKOT
// ellenőrzi, nem a valóságot (a reel-post első változatához 16 zöld teszt
// tartozott, miközben egyetlen valódi útmutatóra sem illett).
// ===================================================================

import assert from 'assert/strict';
import { szurZajt, csendesSor, dontes, halmazElemek, szamKi, SZABALYOK } from './report-noise.js';

// --- SZÓ SZERINT a 2026-08-28-i riportból ---------------------------
const TOOL = '🔗 Hivatalos link nélküli új eszköz: Picsart — a fejlesztő 1 sorral pótolja (tool-links.json)';
const OSSZEVONAS = '🔗 Összevonás: nem volt (0 cikk, 1 nap)';
const HELYESIRAS = '📝 Helyesírás (821 cikk átnézve) — átnézésre: 200 — priorizált → prioritással rendelkező  · hetszámok → heti sorszámok';
const I18N = '🈳 I18N-ŐRSZEM: 4 felület-folt — hu: for everyone, hu: for everyone…';
const CSONKA = '✂️ CSONKA-ŐRSZEM: 53 elvágott szöveg (11 angol cikk, 42 fordítás) — 821 cikk + 1642 fordítás átnézve';
const HAZMESTER = '🧹 HÁZMESTER: 🧠 halott embedding törölve: 247 elem · 7163 KB → 266 KB (96%-kal kisebb)';
const NEM_TERMEL = '🔎 Nem termel (8): Microsoft Research (hivatalos), Mistral AI (hivatalos), Cohere (hivatalos) — érdemes megnézni, kell-e még';

// Ezeknek MINDIG át kell menniük — ezekért olvassa a user a riportot.
const TARTALOM = '📰 Új tartalom ma: 4 hír + 5 útmutató';
const FB = '📘 Facebook-poszt: 8 kiküldve, mind megjelent';
const PENZ = '💰 Tegnap: $0.61 · ma: $0.00 / $1 · e havi: $12.43 / $25';
const EGYENLEG = '🏦 Egyenleg: $9.93 — kb. 18 napra elég (szept. 15.).';
const MELYSEG = '📖 Olvasási mélység: 1.04 oldal/látogató (7 nap) · előző hét: 1.03 (+0.01)';

const TELJES = [TARTALOM, FB, PENZ, EGYENLEG, TOOL, OSSZEVONAS, HELYESIRAS, I18N, CSONKA, HAZMESTER, NEM_TERMEL, MELYSEG];

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 riport-zajszűrő\n');

t('AZ ELSŐ FUTÁS NÉMA — csak alapot állít', () => {
  // Szándékos: a bevezetés napján ne zúduljon ki minden egyszerre.
  const r = szurZajt(TELJES, {});
  assert.deepEqual(r.sorok, [TARTALOM, FB, PENZ, EGYENLEG, MELYSEG], 'őrszem-sor maradt bent');
  assert.equal(r.csendes.length, 7, 'nem mind a 7 őrszem hallgatott: ' + r.csendes.join(', '));
});

t('a NEM-őrszem sorok ÉRINTETLENÜL, SORRENDBEN mennek tovább', () => {
  // Ez a legfontosabb: a szűrő nem nyúlhat ahhoz, amiért a user olvassa.
  const r = szurZajt(TELJES, {});
  assert.deepEqual(r.sorok, [TARTALOM, FB, PENZ, EGYENLEG, MELYSEG]);
  const r2 = szurZajt([PENZ, TARTALOM, FB], {});
  assert.deepEqual(r2.sorok, [PENZ, TARTALOM, FB], 'átrendezte a sorokat');
});

t('A VALÓDI PANASZ: a második nap UGYANAZZAL már néma', () => {
  // A Picsart-sor 08-24/25/26/28-án szó szerint azonos volt.
  const elso = szurZajt(TELJES, {});
  const masodik = szurZajt(TELJES, elso.allapot);
  assert.deepEqual(masodik.sorok, [TARTALOM, FB, PENZ, EGYENLEG, MELYSEG]);
  assert.equal(masodik.indokok.toolLink, 'nincs új');
});

t('ÚJ eszköz viszont megszólal', () => {
  const elso = szurZajt(TELJES, {});
  const uj = TOOL.replace('Picsart', 'Picsart, Canva');
  const r = szurZajt([uj], elso.allapot);
  assert.ok(r.sorok.includes(uj), 'az új eszköz nem jelent meg');
  assert.ok(r.indokok.toolLink.includes('Canva'), r.indokok.toolLink);
});

t('eltűnt, majd visszatért eszköz ÚJRA hír', () => {
  // Az UTOLSÓ LÁTOTT halmazt tartjuk, nem a valaha látottak unióját.
  let a = szurZajt([TOOL], {}).allapot;                       // Picsart alap
  a = szurZajt(['🔗 Hivatalos link nélküli új eszköz: Canva — x'], a).allapot;  // Picsart eltűnt
  const r = szurZajt([TOOL], a);
  assert.ok(r.sorok.includes(TOOL), 'a visszatérő Picsart néma maradt');
});

t('✂️ A LEZÁRT 53 CSENDBEN MARAD, de az 54. megszólal', () => {
  // A user 2026-08-26-án döntött: „maradjon így". Napi jelentésben egy lezárt
  // döntés zaj — DE egy új csonka szöveg már a keret-mentő romlását jelezné.
  const alap = szurZajt([CSONKA], {}).allapot;
  assert.equal(alap.csonka, 53);
  assert.deepEqual(szurZajt([CSONKA], alap).sorok, [], '53 → 53 mégis megszólalt');

  const tobb = CSONKA.replace(': 53 ', ': 54 ');
  const r = szurZajt([tobb], alap);
  assert.deepEqual(r.sorok, [tobb], 'az 54. csonka szöveg NEM jelent meg — ez új hiba lenne');
  assert.ok(r.indokok.csonka.includes('53 → 54'), r.indokok.csonka);
});

t('📝 a helyesírás-szám JAVULÁSA néma, a CSÚCS fölé menés hangos', () => {
  const alap = szurZajt([HELYESIRAS], {}).allapot;      // 200
  assert.equal(alap.helyesiras, 200);

  const kevesebb = HELYESIRAS.replace('átnézésre: 200', 'átnézésre: 190');
  const a2 = szurZajt([kevesebb], alap);
  assert.deepEqual(a2.sorok, [], 'a javulás riasztott');
  assert.equal(a2.allapot.helyesiras, 200, 'a csúcsot kell tartani, nem az utolsót');

  // A visszakapaszkodás a csúcs ALATT még mindig néma…
  assert.deepEqual(szurZajt([HELYESIRAS.replace('átnézésre: 200', 'átnézésre: 195')], a2.allapot).sorok, []);
  // …a csúcs FÖLÖTT viszont már nem.
  const rosszabb = HELYESIRAS.replace('átnézésre: 200', 'átnézésre: 240');
  assert.deepEqual(szurZajt([rosszabb], a2.allapot).sorok, [rosszabb]);
});

t('⚠️ a helyesírás-sorból a JÓ számot olvassuk ki', () => {
  // A sor ELSŐ száma 821 (az átnézett cikkek), a figyelendő a 200. Ha a naiv
  // "első szám" mintát használnánk, a cikkszám ingadozása riasztana naponta.
  assert.equal(szamKi(HELYESIRAS, SZABALYOK.find(s => s.kulcs === 'helyesiras').szamMinta), 200);
  assert.equal(szamKi(HELYESIRAS), 821, 'a naiv minta tényleg a rosszat fogná');
});

t('🈳 az i18n-sor szöveg-változásra szólal meg', () => {
  const alap = szurZajt([I18N], {}).allapot;
  assert.deepEqual(szurZajt([I18N], alap).sorok, []);
  const mas = I18N.replace('4 felület-folt', '9 felület-folt');
  assert.deepEqual(szurZajt([mas], alap).sorok, [mas]);
});

t('🧹 házmester és 🔗 "Összevonás: nem volt" SOHA nem megy ki', () => {
  // Rutin karbantartás és a "nem történt semmi" nem hír. Első futáskor sem.
  for (const allapot of [{}, { hazmester: 'x', osszevonas: 'y' }]) {
    const r = szurZajt([HAZMESTER, OSSZEVONAS], allapot);
    assert.deepEqual(r.sorok, [], JSON.stringify(allapot));
  }
});

t('DE a valódi összevonás átmegy (más a szövege)', () => {
  const volt = '🔗 Összevonás: 2 hírből 1 cikk lett';
  assert.deepEqual(szurZajt([volt], {}).sorok, [volt], 'elnyelte a valódi összevonást');
});

t('🔇 a csendes sor MEGNEVEZI a lefutott őrszemeket', () => {
  // ⚠️ Enélkül a "nincs változás" és a "elromlott az őrszem" egyformán nézne
  // ki — ez a hiba a témaismétlés-őrnél hónapokig rejtve maradt.
  const r = szurZajt(TELJES, {});
  const sor = csendesSor(r.csendes);
  assert.ok(sor.startsWith('🔇'), sor);
  for (const nev of ['helyesírás', 'csonka szövegek', 'források', 'nyelvi foltok']) {
    assert.ok(sor.includes(nev), 'hiányzik a felsorolásból: ' + nev + ' — ' + sor);
  }
  assert.equal(csendesSor([]), '', 'üresre is írt valamit');
});

t('a bemenet ROSSZ alakja nem dönti el a riportot', () => {
  assert.deepEqual(szurZajt(null, {}).sorok, []);
  assert.deepEqual(szurZajt([TARTALOM], null).sorok, [TARTALOM]);
  assert.deepEqual(szurZajt([undefined, TARTALOM], {}).sorok, [undefined, TARTALOM]);
  // Szám nélküli "novekedes"-sor: ne némuljon el örökre rossz állapottal
  const csonkaSzamNelkul = '✂️ CSONKA-ŐRSZEM: nincs adat';
  assert.doesNotThrow(() => szurZajt([csonkaSzamNelkul], {}));
});

t('minden szabálynak van neve a csendes sorhoz', () => {
  for (const sz of SZABALYOK) {
    assert.ok(sz.nev && sz.nev.length > 2, sz.kulcs + ' névtelen');
    assert.ok(['halmaz', 'novekedes', 'valtozas', 'soha'].includes(sz.mod), sz.kulcs + ' rossz mód');
  }
});

t('halmazElemek a valódi sorokon', () => {
  assert.deepEqual(halmazElemek(TOOL), ['Picsart']);
  assert.deepEqual(halmazElemek(NEM_TERMEL), ['Microsoft Research', 'Mistral AI', 'Cohere']);
});

console.log(`\n✅ ${pass} teszt rendben`);
