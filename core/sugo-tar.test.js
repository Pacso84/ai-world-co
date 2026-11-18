// ===================================================================
// TESZT — a súgószöveg privát tára (core/sugo-tar.js)
// ===================================================================
// INGYENES, hálózat nélküli (a fetchFn be van adva); ideiglenes mappába ír. Fut: node core/run-tests.js
//
// MIÉRT VAN: a súgócikkek szövege CSAK a privát tárba (_forrasok/sugo/, .gitignore) kerülhet, és a következő
// futásnak ugyanazt kell látnia — különben a bíráló és a tényellenőrző más szöveget kapna, mint az író.
// A tár hibája SOHA nem állíthat meg futást. A fixtúrák saját, kitalált mondatok, NEM valódi súgószöveg.
// ===================================================================

import assert from 'assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { FORRAS_TAR_DIR } from './forras-cache.js';
import { SUGO_TAR_BE, SUGO_FRISS_NAP, MIN_TAR_HOSSZ, sugoTarKulcs, sugoTarIr, sugoTarOlvas, sugoSzoveg } from './sugo-tar.js';

const dir = mkdtempSync(join(tmpdir(), 'sugo-tar-'));
const regiKornyezet = process.env.SUGO_TAR_DIR;
delete process.env.SUGO_TAR_DIR;
let pass = 0, bukott = 0;
async function t(nev, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${nev}`); }
  catch (e) { bukott++; console.log(`  ✗ ${nev}\n    ${e.message}`); }
}

const U = 'https://support.claude.com/en/articles/1-x';
const lap = szoveg => async () => ({ ok: true, text: async () => `<html><title>Cím</title><body>${szoveg.repeat(40)}</body></html>` });
const elo = lap('Saját tesztmondat. ');
const elo2 = lap('Másik, kitalált tesztmondat. ');
const halott = async () => { throw new Error('nincs net'); };
const most = Date.parse('2026-11-14T12:00:00Z');
const NAP = 864e5;
const metaUtja = (d, url) => join(d, new URL(url).hostname, sugoTarKulcs(url) + '.json');

await t('kill-switch be van kapcsolva, a friss-idő 7 nap', () => {
  assert.equal(SUGO_TAR_BE, true);
  assert.equal(SUGO_FRISS_NAP, 7);
});

await t('🔒 az alapmappa a _forrasok/ privát tár alatt van, és a .gitignore kizárja', () => {
  const gyoker = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  assert.equal(relative(gyoker, join(FORRAS_TAR_DIR, 'sugo')).split(sep).join('/'), '_forrasok/sugo');
  const sorok = readFileSync(join(gyoker, '.gitignore'), 'utf-8').split(/\r?\n/).map(x => x.trim());
  assert.ok(sorok.includes('_forrasok/'), 'a .gitignore-ból kikerült a _forrasok/ — a súgószöveg a nyilvános gitbe menne');
});

await t('kulcs: normalizált (perjel, query, #, nagybetű mindegy), nem https → null', () => {
  assert.match(sugoTarKulcs(U), /^[0-9a-f]{16}$/);
  assert.equal(sugoTarKulcs(U), sugoTarKulcs(U + '/'));
  assert.equal(sugoTarKulcs(U), sugoTarKulcs(U + '?hl=en#lepesek'));
  assert.equal(sugoTarKulcs(U), sugoTarKulcs('https://SUPPORT.claude.com/en/articles/1-x'));
  assert.notEqual(sugoTarKulcs(U), sugoTarKulcs('https://support.claude.com/en/articles/2-y'));
  assert.equal(sugoTarKulcs('http://support.claude.com/x'), null);
  assert.equal(sugoTarKulcs('nem url'), null);
  assert.equal(sugoTarKulcs(''), null);
});

await t('1. élő letöltés → tárba ír (.txt + .json, hash-sel)', async () => {
  const r = await sugoSzoveg(U, { fetchFn: elo, dir, most });
  assert.equal(r.honnan, 'elo');
  assert.ok(r.szoveg.includes('Saját tesztmondat.'));
  const o = sugoTarOlvas(U, { dir });
  assert.ok(o);
  assert.equal(o.szoveg, r.szoveg);
  assert.equal(o.cim, 'Cím');
  assert.equal(o.letoltve, new Date(most).toISOString());
  assert.match(o.hash, /^[0-9a-f]{16}$/);
  const meta = JSON.parse(readFileSync(metaUtja(dir, U), 'utf-8'));
  assert.equal(meta.url, U);
  assert.equal(meta.hossz, r.szoveg.length);
  assert.equal(meta.valtozott, undefined);
});

await t('2. friss tár → nincs letöltés', async () => {
  const r = await sugoSzoveg(U, { fetchFn: halott, dir, most: most + 3 * NAP });
  assert.equal(r.honnan, 'tar');
  assert.ok(r.szoveg.includes('Saját tesztmondat.'));
});

await t('3. elavult tár + halott net → régi tár', async () => {
  const r = await sugoSzoveg(U, { fetchFn: halott, dir, most: most + 30 * NAP });
  assert.equal(r.honnan, 'regi-tar');
  assert.ok(r.szoveg.length > 100);
});

await t('3b. elavult tár + halott net + nincs a tárban → null', async () => {
  const r = await sugoSzoveg('https://support.claude.com/en/articles/9-nincs', { fetchFn: halott, dir, most });
  assert.equal(r, null);
});

await t('4. nem jóváhagyott URL → szöveg jön, tárba nem kerül', async () => {
  const r = await sugoSzoveg('https://example.com/help', { fetchFn: elo, dir, most });
  assert.equal(r.honnan, 'elo');
  assert.equal(sugoTarOlvas('https://example.com/help', { dir }), null);
  assert.equal(sugoTarIr('https://example.com/help', { cim: 'x', szoveg: 'y' }, { dir, most }), false);
  assert.equal(existsSync(join(dir, 'example.com')), false);
});

await t('5. sérült meta → élő letöltés, nincs kivétel', async () => {
  writeFileSync(metaUtja(dir, U), '{rossz');
  assert.equal(sugoTarOlvas(U, { dir }), null);
  const r = await sugoSzoveg(U, { fetchFn: elo, dir, most });
  assert.equal(r.honnan, 'elo');
  assert.ok(sugoTarOlvas(U, { dir }), 'az élő letöltés kijavította a tárat');
});

await t('6. a tár helyén fájl áll → az írás false, a szöveg mégis megjön', async () => {
  const fajlDir = join(dir, 'fajl');
  writeFileSync(fajlDir, 'x');
  assert.equal(sugoTarIr(U, { cim: 'Cím', szoveg: 'valami szöveg' }, { dir: fajlDir, most }), false);
  assert.equal(sugoTarOlvas(U, { dir: fajlDir }), null);
  const r = await sugoSzoveg(U, { fetchFn: elo, dir: fajlDir, most });
  assert.equal(r.honnan, 'elo');
});

await t('7. változás-jelzés: más szöveg ugyanarra az URL-re → valtozott + új hash; azonos újraletöltés nem jelöl', async () => {
  const U7 = 'https://support.claude.com/en/articles/7-valtozas';
  await sugoSzoveg(U7, { fetchFn: elo, dir, most });
  const regiHash = JSON.parse(readFileSync(metaUtja(dir, U7), 'utf-8')).hash;
  // azonos tartalom, 30 nappal később → hash ugyanaz, nincs valtozott
  await sugoSzoveg(U7, { fetchFn: elo, dir, most: most + 30 * NAP });
  let meta = JSON.parse(readFileSync(metaUtja(dir, U7), 'utf-8'));
  assert.equal(meta.hash, regiHash);
  assert.equal(meta.valtozott, undefined);
  assert.equal(meta.letoltve, new Date(most + 30 * NAP).toISOString());
  // más tartalom, újabb 30 nap múlva → valtozott kitöltve, hash eltér
  const kesobb = most + 60 * NAP;
  await sugoSzoveg(U7, { fetchFn: elo2, dir, most: kesobb });
  meta = JSON.parse(readFileSync(metaUtja(dir, U7), 'utf-8'));
  assert.notEqual(meta.hash, regiHash);
  assert.equal(meta.valtozott, new Date(kesobb).toISOString());
  assert.ok(sugoTarOlvas(U7, { dir }).szoveg.includes('Másik, kitalált'));
});

await t('SUGO_TAR_DIR környezeti változó adja az alap mappát, és nem szivárog', async () => {
  const masik = mkdtempSync(join(tmpdir(), 'sugo-tar-env-'));
  try {
    process.env.SUGO_TAR_DIR = masik;
    await sugoSzoveg(U, { fetchFn: elo, most });
    assert.ok(existsSync(metaUtja(masik, U)));
    assert.ok(sugoTarOlvas(U));
  } finally {
    delete process.env.SUGO_TAR_DIR;
    rmSync(masik, { recursive: true, force: true });
  }
});

// ── a tár SOHA nem állíthat meg futást: null opció / váratlan hiba sem dobhat ─────────────────────
await t('kemény: null opció / második argumentum sosem dob (sugoTarIr, sugoTarOlvas, sugoSzoveg)', async () => {
  const UN = 'https://support.claude.com/en/articles/8-null';
  assert.equal(sugoTarIr(UN, null), false);                       // nincs szöveg → false, kivétel nélkül
  assert.equal(sugoTarIr(UN, undefined, null), false);            // nincs szöveg, null harmadik argumentum
  assert.equal(sugoTarOlvas(UN, null), null);                     // nincs mit olvasni → null, kivétel nélkül
  assert.equal(sugoTarOlvas('nem url', null), null);
  // sugoSzoveg null opcióval: nem https cím → hálózat nélkül null (a tesztben élő letöltés TILOS)
  assert.equal(await sugoSzoveg('nem url', null), null);
});

await t('kemény: élő letöltés null-t ad és nincs tár → null, kivétel nélkül', async () => {
  const ures = mkdtempSync(join(tmpdir(), 'sugo-tar-ures-'));
  try {
    const U9 = 'https://support.claude.com/en/articles/9-nincs';
    assert.equal(await sugoSzoveg(U9, { fetchFn: async () => ({ ok: false, text: async () => '' }), dir: ures, most }), null);
    assert.equal(await sugoSzoveg(U9, { fetchFn: halott, dir: ures, most }), null);
  } finally { rmSync(ures, { recursive: true, force: true }); }
});

await t('kemény: váratlan hiba a belsejében (fetchFn nem függvény, rossz idő) → a sugoSzoveg akkor sem dob', async () => {
  const UD = 'https://support.claude.com/en/articles/10-dob';
  const hiba = e => ({ dobott: e.message });
  const r = await sugoSzoveg(UD, { fetchFn: 'nem függvény', dir, most }).catch(hiba);
  assert.ok(r === null || (typeof r.szoveg === 'string'), 'dobott: ' + JSON.stringify(r));
  const r2 = await sugoSzoveg(UD, { fetchFn: elo, dir, most: Symbol('x') }).catch(hiba);
  assert.ok(r2 === null || (typeof r2.szoveg === 'string'), 'dobott: ' + JSON.stringify(r2));
  // ha a tárban régi szöveg van, a hibás hívás a régi szöveget adja vissza (jobb a semminél)
  const UR = 'https://support.claude.com/en/articles/11-regi';
  await sugoSzoveg(UR, { fetchFn: elo, dir, most });
  const r3 = await sugoSzoveg(UR, { fetchFn: 'nem függvény', dir, most: most + 30 * NAP });
  assert.ok(r3 && r3.szoveg.includes('Saját tesztmondat.'));
  assert.equal(r3.honnan, 'regi-tar');
  // a tár-ágban robbanó hívás (a „most” nem szám → a kor-számítás TypeError-t dob) → a régi tárolt szöveg jön
  const r4 = await sugoSzoveg(UR, { fetchFn: elo, dir, most: Symbol('x') }).catch(hiba);
  assert.ok(r4 && r4.szoveg && r4.szoveg.includes('Saját tesztmondat.'), 'dobott vagy üres: ' + JSON.stringify(r4));
  assert.equal(r4.honnan, 'regi-tar');
});

// ── záró átnézés (11-14) ──────────────────────────────────────────────────────────────────────────
await t('I-1: rövid (junk) élő lap jó tárolt szöveg mellett → NEM írja felül a tárat, régi tárolt szöveg jön, nincs valtozott', async () => {
  assert.equal(MIN_TAR_HOSSZ, 300);
  const UJ = 'https://support.claude.com/en/articles/20-rovid';
  await sugoSzoveg(UJ, { fetchFn: elo, dir, most });
  const elotte = readFileSync(metaUtja(dir, UJ), 'utf-8');
  const txtElotte = readFileSync(metaUtja(dir, UJ).replace(/\.json$/, '.txt'), 'utf-8');
  const rovid = async () => ({ ok: true, text: async () => '<html><title>Süti</title><body>Kérjük, engedélyezze a JavaScriptet.</body></html>' });
  const r = await sugoSzoveg(UJ, { fetchFn: rovid, dir, most: most + 30 * NAP });
  assert.equal(r.honnan, 'regi-tar');
  assert.ok(r.szoveg.includes('Saját tesztmondat.'));
  assert.equal(readFileSync(metaUtja(dir, UJ), 'utf-8'), elotte, 'a meta változatlan (nincs új letoltve, nincs valtozott)');
  assert.equal(readFileSync(metaUtja(dir, UJ).replace(/\.json$/, '.txt'), 'utf-8'), txtElotte);
  assert.equal(JSON.parse(readFileSync(metaUtja(dir, UJ), 'utf-8')).valtozott, undefined);
});

await t('I-1: rövid élő lap, nincs tárolt szöveg → élő eredmény tárolás nélkül (nincs fájl)', async () => {
  const UN = 'https://support.claude.com/en/articles/21-rovid-nincs-tar';
  const rovid = async () => ({ ok: true, text: async () => '<html><title>Süti</title><body>Ellenőrzés folyamatban…</body></html>' });
  const r = await sugoSzoveg(UN, { fetchFn: rovid, dir, most });
  assert.ok(r && r.honnan === 'elo');
  assert.ok(r.szoveg.includes('Ellenőrzés'));
  assert.equal(existsSync(metaUtja(dir, UN)), false);
  assert.equal(sugoTarOlvas(UN, { dir }), null);
});

await t('M-3: jövőbeli `letoltve` (negatív kor) nem számít örökké frissnek → újra letöltjük', async () => {
  const UF = 'https://support.claude.com/en/articles/22-jovo';
  await sugoSzoveg(UF, { fetchFn: elo, dir, most: most + 400 * NAP });   // „a jövőben” tárolva
  const r = await sugoSzoveg(UF, { fetchFn: elo2, dir, most });
  assert.equal(r.honnan, 'elo', 'a jövőbeli időbélyeg nem friss');
  assert.ok(r.szoveg.includes('Másik, kitalált'));
});

await t('🔎 felfedezett forrás: csak a jelölt eszköz saját hostján tárolható', async () => {
  const UM = 'https://agent.minimax.io/docs/code/a';
  const adat = { cim: 'A', szoveg: 'x'.repeat(700) };
  assert.equal(sugoTarIr(UM, adat, { dir }), false, 'eszköz-jelölés nélkül nem jóváhagyott → nem tárol');
  assert.equal(sugoTarIr(UM, adat, { dir, felfedezettEszkoz: 'Kimi' }), false, 'más eszköz hostja → nem');
  assert.equal(sugoTarOlvas(UM, { dir }), null);
  assert.equal(sugoTarIr(UM, adat, { dir, felfedezettEszkoz: 'MiniMax Code' }), true);
  assert.equal(sugoTarOlvas(UM, { dir }).szoveg, adat.szoveg);
  // nem súgó-jellegű útvonal a jó hoston sem
  assert.equal(sugoTarIr('https://agent.minimax.io/blog/x', adat, { dir, felfedezettEszkoz: 'MiniMax Code' }), false);
});

await t('🔎 sugoSzoveg: felfedezett forrást a jelölt eszközzel tárol, anélkül csak élőben ad', async () => {
  const UM = 'https://agent.minimax.io/docs/code/b';
  const r0 = await sugoSzoveg(UM, { fetchFn: elo, dir, most });
  assert.equal(r0.honnan, 'elo');
  assert.equal(sugoTarOlvas(UM, { dir }), null, 'eszköz nélkül nem kerül a tárba');
  const r1 = await sugoSzoveg(UM, { fetchFn: elo, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.equal(r1.honnan, 'elo');
  assert.ok(sugoTarOlvas(UM, { dir }), 'az eszközzel tárolódik');
  const r2 = await sugoSzoveg(UM, { fetchFn: halott, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.equal(r2.honnan, 'tar', 'másodszor a tárból jön');
});

rmSync(dir, { recursive: true, force: true });
if (regiKornyezet !== undefined) process.env.SUGO_TAR_DIR = regiKornyezet;
console.log(`\n${bukott === 0 ? '✅' : '❌'} sugo-tar.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
