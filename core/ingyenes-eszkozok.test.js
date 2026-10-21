// 🧰 Ingyenes eszközök (2026-10-21): Biztonságos bemásolás + Promptépítő. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { eszkozMag, eszkozSavHtml, biztonsagosHtml, promptEpitoHtml, ESZKOZ_UTAK } from './ingyenes-eszkozok.js';
import { ESZKOZ_SZ, eszkozSzoveg } from './ingyenes-eszkozok-szoveg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const M = eszkozMag();
const tipusok = sz => M.keres(sz).map(t => t.tipus + ':' + t.ertek);
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 ingyenes-eszkozok');

t('🔎 magyar levél: név, TAJ, telefon, e-mail, kártya, IBAN, lakcím, születési dátum, aláírás', () => {
  const sz = 'Kedves Kovács Anna!\nA TAJ számom 123 456 788, telefon: +36 30 123 4567, e-mail: anna.kovacs@example.com.\nKártya: 4111 1111 1111 1111, IBAN: GB82 WEST 1234 5698 7654 32. Lakcím: Petőfi Sándor utca 12. Született: 1984.05.12.\n\nÜdvözlettel:\nNagy Péter';
  const v = tipusok(sz);
  for (const k of ['nev:Kovács Anna', 'azonosito:123 456 788', 'telefon:+36 30 123 4567', 'email:anna.kovacs@example.com', 'kartya:4111 1111 1111 1111', 'iban:GB82 WEST 1234 5698 7654 32', 'cim:Petőfi Sándor utca 12', 'szuletes:1984.05.12', 'nev:Nagy Péter'])
    assert.ok(v.includes(k), 'hiányzik: ' + k + ' — kaptam: ' + v.join(' | '));
});

t('🔎 spanyol és angol: DNI/NIE, SSN, (555)-szám, utca, születésnap, aláírás', () => {
  const es = tipusok('Hola María López, mi DNI es 12345678Z y mi NIE X1234567L. Vivo en Calle Mayor 12. Saludos,\nJuan');
  for (const k of ['nev:María López', 'azonosito:12345678Z', 'azonosito:X1234567L', 'cim:Calle Mayor 12', 'nev:Juan']) assert.ok(es.includes(k), 'ES: ' + k + ' — ' + es.join(' | '));
  const en = tipusok('Hi John, my SSN is 123-45-6789, call (212) 555-0123. I live at 1600 Pennsylvania Avenue. Born on March 3, 1990.\nThanks,\nSarah Miller');
  for (const k of ['nev:John', 'azonosito:123-45-6789', 'telefon:(212) 555-0123', 'cim:1600 Pennsylvania Avenue', 'szuletes:March 3, 1990', 'nev:Sarah Miller']) assert.ok(en.includes(k), 'EN: ' + k + ' — ' + en.join(' | '));
});

t('🙅 nem jelöl: dátum, ár, rendelésszám, hibás kártyaszám, TAJ-kulcsszó nélküli 9 jegyű szám, köszönő általános szó', () => {
  assert.deepEqual(tipusok('A 2026-10-21-i ülésen 1 234 567 Ft-ot szavaztak meg, rendelésszám 123456789, 3. pont.'), []);
  assert.deepEqual(tipusok('Kártya: 4111 1111 1111 1112'), [], 'Luhn szerint hibás');
  assert.equal(tipusok('Kód: 123 456 788').some(x => x.startsWith('azonosito')), false, 'TAJ csak a „TAJ” szó közelében (telefonnak nézheti: a spanyol mobilszám így néz ki)');
  assert.deepEqual(tipusok('Kedves Ügyfelünk! Hi there, Dear Customer,'), []);
});

t('➕ saját kifejezés: minden előfordulás elrejtve, szóhatáron (a „Bob” nem rejti a „Bobby”-t)', () => {
  const v = M.keres('Acme Kft. és az Acme kft. ügye. Bob és Bobby.', { sajat: ['Acme Kft.', 'Bob'] });
  assert.equal(v.filter(x => x.tipus === 'sajat' && /acme/i.test(x.ertek)).length, 2);
  assert.deepEqual(v.filter(x => /Bob/.test(x.ertek)).map(x => x.ertek), ['Bob']);
});

t('🔁 kitakarás → visszaállítás: ugyanaz az érték ugyanazt a jelet kapja; a válaszban (kis/nagybetű, _) visszaáll', () => {
  const sz = 'Kedves Anna! Hívd a +36 30 123 4567 számot. Anna, a szám: +36 30 123 4567.';
  const k = M.kitakar(sz, M.keres(sz), ESZKOZ_SZ.hu.labels);
  assert.equal(k.szoveg, 'Kedves [NÉV 1]! Hívd a [TELEFON 1] számot. [NÉV 1], a szám: [TELEFON 1].');
  const v = M.visszaallit('Szia [név 1], felhívom a [TELEFON_1] számot.', k.terkep);
  assert.equal(v.szoveg, 'Szia Anna, felhívom a +36 30 123 4567 számot.');
  assert.equal(v.db, 2);
});

t('🙈 visszaengedett érték (a látogató kattintott rá) nem rejtődik el', () => {
  const v = M.keres('Írj az anna@example.com címre.', { kihagy: ['ANNA@example.com'] });
  assert.deepEqual(v, []);
});

t('🧩 promptépítő: csak a kitöltött sorok; írásjel a feladat végére; „kérdezz vissza” csak tartalom mellé', () => {
  const c = ESZKOZ_SZ.hu.pb.rows;
  assert.equal(M.promptEpit({}, c), '');
  assert.equal(M.promptEpit({ kerdezz: true }, c), '', 'üres promptba nem kerül a „kérdezz vissza”');
  const p = M.promptEpit({ feladat: 'Írj egy e-mailt a főbérlőmnek', hatter: '3 éve lakom itt', hangnem: 'udvarias, hivatalos', formatum: 'e-mail tárgysorral', hossz: 'rövid (100 szó alatt)', kerdezz: true }, c);
  assert.equal(p, 'Írj egy e-mailt a főbérlőmnek.\n\nHáttér: 3 éve lakom itt\nHangnem: udvarias, hivatalos\nFormátum: e-mail tárgysorral, rövid (100 szó alatt)\n\n' + c.kerdezz);
  assert.deepEqual(M.hozzavalok({ feladat: 'x', hangnem: 'y' }), { feladat: true, hatter: false, kinek: true, formatum: false });
});

t('🌍 a 3 nyelv szövegei ugyanazokat a kulcsokat tartalmazzák; a cél-gombok értékei szerepelnek a listákban', () => {
  const kulcsok = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)) ? kulcsok(v, p + k + '.') : [p + k]).sort();
  const en = kulcsok(ESZKOZ_SZ.en);
  for (const ny of ['hu', 'es']) assert.deepEqual(kulcsok(ESZKOZ_SZ[ny]), en, ny + ': eltérő kulcsok');
  for (const ny of ['en', 'hu', 'es']) {
    const p = ESZKOZ_SZ[ny].pb;
    assert.equal(p.goals.length, 6);
    for (const g of p.goals) {
      if (g.hangnem) assert.ok(p.tones.includes(g.hangnem), `${ny}/${g.id}: hangnem nincs a listában`);
      if (g.formatum) assert.ok(p.formats.includes(g.formatum), `${ny}/${g.id}: formátum nincs a listában`);
      if (g.hossz) assert.ok(p.lengths.includes(g.hossz), `${ny}/${g.id}: hossz nincs a listában`);
      assert.match(g.feladat, /\[[^\]]+\]/, `${ny}/${g.id}: nincs kitöltendő [rész]`);
    }
  }
  assert.equal(eszkozSzoveg('de'), ESZKOZ_SZ.en, 'ismeretlen nyelvre angol');
});

t('🧪 a „Kipróbálom egy példán” minta mindhárom nyelven legalább 5 adatot mutat, és csak kitalált adatot használ', () => {
  for (const ny of ['en', 'hu', 'es']) {
    const s = ESZKOZ_SZ[ny].sp.sample;
    assert.ok(M.keres(s).length >= 5, ny + ': kevés találat a mintában: ' + tipusok(s).join(' | '));
    for (const m of s.match(/@[\w-]+(?:\.[\w-]+)+/g) || []) assert.equal(m, '@example.com', ny + ': nem RFC 2606 példa-domain');
    assert.ok(s.includes('4111 1111 1111 1111'), ny + ': a kártya a nyilvános tesztszám legyen');
  }
});

t('📄 az oldalak böngészős kódja lefordul (szintaxis), és nincs benne külső hívás', () => {
  for (const ny of ['en', 'hu', 'es']) {
    const sz = ESZKOZ_SZ[ny];
    const oldalak = [biztonsagosHtml(sz, { lp: '/' + ny }), promptEpitoHtml(sz, { lp: '/' + ny }), eszkozSavHtml(sz, { lp: '/' + ny })];
    for (const h of oldalak) {
      for (const [, js] of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        new vm.Script(js);   // szintaxishiba → kivétel
        assert.equal(/fetch\(|XMLHttpRequest|https?:\/\//.test(js), false, 'külső hívás a kódban');
      }
    }
  }
});

t('🧠 a böngészőbe ágyazott mag UGYANAZT csinálja, mint a tesztelt (toString-másolat)', () => {
  const html = biztonsagosHtml(ESZKOZ_SZ.hu, {});
  const forras = html.match(/var M = \((function eszkozMag[\s\S]*?)\)\(\);/)[1];
  const Mb = vm.runInNewContext('(' + forras + ')()');
  const sz = 'Kedves Kovács Anna! anna@example.com, +36 30 123 4567';
  assert.deepEqual(JSON.parse(JSON.stringify(Mb.keres(sz))), JSON.parse(JSON.stringify(M.keres(sz))));
});

t('🧪 „fejlesztés alatt” jelzés mindkét eszközön és a Prompt-tár sávjában, mindhárom nyelven (user 10-21)', () => {
  for (const ny of ['en', 'hu', 'es']) {
    const sz = ESZKOZ_SZ[ny];
    for (const [nev, h] of [['sp', biztonsagosHtml(sz, {})], ['pb', promptEpitoHtml(sz, {})], ['sáv', eszkozSavHtml(sz, {})]])
      assert.ok(h.includes(`<span class="fx-beta">🧪 ${sz.beta}</span>`), `${ny}/${nev}: nincs béta-jelzés`);
    assert.ok(biztonsagosHtml(sz, {}).includes(sz.betaTip), ny + ': a bővítés-mondat hiányzik');
  }
});

t('🔗 a Promptépítő a szöveget sessionStorage-ben adja át, NEM az URL-ben', () => {
  const h = promptEpitoHtml(ESZKOZ_SZ.hu, { lp: '/hu' });
  assert.match(h, /sessionStorage\.setItem\(S\.kulcs, utolso\)/);
  assert.match(h, /location\.href = S\.spUrl;/);
  assert.match(h, /"spUrl":"\/hu\/safe-paste"/);
});

t('🧭 bekötés: az eszközök a PROMPT-TÁR tetején (nincs külön menüpont/gyűjtőoldal), 2 oldal, sitemap, egy hirdetés az eszköz alatt, adatvédelmi szöveg', () => {
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.equal(/free-tools|buildFreeToolsPage|ESZKOZ_UTAK\.hub/.test(b), false, 'a külön gyűjtőoldal/menüpont megszűnt (user: „a prompttárral vond össze!”)');
  assert.match(b, /eszkozok: eszkozSavHtml\(eszkozSzoveg\(LANG\), \{ lp: langPrefix\(LANG\) \}\), promptokCim: eszkozSzoveg\(LANG\)\.promptokH/);
  for (const k of ['buildSafePastePage()', 'buildPromptBuilderPage()']) assert.ok(b.includes(k), k);
  // 📢 a Prompt-tár is kap EGY hirdetést (user 10-21: „ide is rakjunk reklámot!”): a „Felkapott és új” UTÁN, a témák ELŐTT
  assert.match(b, /promptokCim: eszkozSzoveg\(LANG\)\.promptokH,\s*hirdetes: hirdetesBlokk\(HIRDETES, LANG\)/);
  const pl = readFileSync(join(ROOT, 'core', 'prompt-library.js'), 'utf-8');
  const ad = pl.indexOf('<div class="pl-ad">');
  assert.ok(ad > pl.indexOf('pl-sec--kiemelt') && ad < pl.indexOf('${tar.temak.map(x => szakasz('), 'a hirdetés helye: a kiemelt szakasz után, a témák előtt');
  assert.equal((pl.match(/pl-ad/g) || []).length, 1, 'egy hirdetés-hely');
  assert.match(b, /for \(const ut of Object\.values\(ESZKOZ_UTAK\)\) sitemapUrls\.push/);
  assert.match(b, /biztonsagosHtml\(sz, \{ lp: langPrefix\(LANG\), hirdetes: hirdetesBlokk\(HIRDETES, LANG\) \}\)/);
  assert.match(b, /Safe Paste, Prompt Builder\) also run only in your browser/);
  assert.deepEqual(ESZKOZ_UTAK, { sp: 'safe-paste', pb: 'prompt-builder' });
  const sav = eszkozSavHtml(ESZKOZ_SZ.hu, { lp: '/hu' });
  assert.ok(sav.includes('href="/hu/safe-paste"') && sav.includes('href="/hu/prompt-builder"'), 'a sáv mindkét eszközre mutat');
  for (const ny of ['en', 'hu', 'es']) assert.ok(biztonsagosHtml(ESZKOZ_SZ[ny], { lp: '/x' }).includes('href="/x/prompts"'), ny + ': nincs vissza-link a Prompt-tárhoz');
  const h = biztonsagosHtml(ESZKOZ_SZ.en, { hirdetes: '<!--AD-->' });
  assert.equal((h.match(/<!--AD-->/g) || []).length, 1);
  assert.ok(h.indexOf('<!--AD-->') > h.indexOf('id="spRestore"'), 'a hirdetés az eszköz alatt');
});

if (hiba) { console.log(`\n❌ ingyenes-eszkozok.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ ingyenes-eszkozok.test: mind rendben');
