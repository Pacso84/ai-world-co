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
import { SUGO_TAR_BE, SUGO_FRISS_NAP, MIN_TAR_HOSSZ, jsonSzennyezett, sugoTarKulcs, sugoTarIr, sugoTarOlvas, sugoSzoveg } from './sugo-tar.js';

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

// ── 2. javítókör (11-19): .md-tartalék a JS-héj dokumentációs oldalakra (hamis fetch, hálózat nélkül) ──────────
const HEJ = '<html><title>Welcome - MiniMax Code Docs</title><body><div id="__next">Loading… page scaffolding</div></body></html>';
const MD = '# Welcome to MiniMax Code\n\n' + 'Ez egy kitalált, saját tesztmondat a dokumentációról. '.repeat(20);
// útvonalonként beállítható hamis fetch: { 'url': { ok, ct, text, vegUrl } }; a hívások naplózva
function utasFetch(terkep, naplo) {
  return async (u) => {
    naplo.push(u);
    const x = terkep[u];
    if (!x) return { ok: false, status: 404, headers: { get: () => null }, url: u, text: async () => '' };
    return { ok: x.ok !== false, status: x.ok === false ? 404 : 200, url: x.vegUrl || u, headers: { get: k => (/content-type/i.test(k) ? (x.ct || null) : null) }, text: async () => x.text };
  };
}
const UW = 'https://agent.minimax.io/docs/code/welcome';

await t('.md-tartalék: a HTML-váz rövid → a `.md` (301 → code.minimax.io, text/markdown) szövege jön, a tárba az EREDETI URL-lel kerül', async () => {
  const naplo = [];
  const f = utasFetch({ [UW]: { ct: 'text/html', text: HEJ }, [UW + '.md']: { ct: 'text/markdown; charset=utf-8', text: MD, vegUrl: 'https://code.minimax.io/docs/code/welcome.md' } }, naplo);
  const r = await sugoSzoveg(UW, { fetchFn: f, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.equal(r.honnan, 'elo');
  assert.ok(r.szoveg.includes('kitalált, saját tesztmondat'), 'a markdown szövege jön');
  assert.equal(r.cim, 'Welcome to MiniMax Code', 'a cím az első # fejlécből');
  assert.ok(r.szoveg.length >= MIN_TAR_HOSSZ && !/\n/.test(r.szoveg), 'sima szöveg: a sortörések szóközzé');
  assert.deepEqual(naplo, [UW, UW + '.md']);
  const t1 = sugoTarOlvas(UW, { dir });
  assert.ok(t1 && t1.szoveg === r.szoveg, 'tárolva az eredeti (tool-hostú) cím kulcsán');
  assert.equal(JSON.parse(readFileSync(metaUtja(dir, UW), 'utf-8')).url, UW);
});

await t('.md-tartalék: HOSSZÚ, de JSON-szennyezett HTML-szöveg (Mintlify manifest, mért eset) → a `.md` tiszta szövege jön', async () => {
  const UMF = 'https://agent.minimax.io/docs/code/mintlify';
  const manifest = '<template data-mint="manifest">{"docsConfig":{"theme":"mint","name":"Docs","colors":{"primary":"#181E25"},"logo":{"light":"x.svg"}}}</template>';
  const hosszuHtml = '<html><title>Welcome</title><body><main>' + 'Olvasható, saját tesztmondat. '.repeat(15) + '</main>' + manifest.repeat(30) + '</body></html>';
  const naplo = [];
  const f = utasFetch({ [UMF]: { ct: 'text/html', text: hosszuHtml }, [UMF + '.md']: { ct: 'text/markdown', text: MD } }, naplo);
  const r = await sugoSzoveg(UMF, { fetchFn: f, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r.szoveg.includes('kitalált, saját tesztmondat') && !r.szoveg.includes('docsConfig'), 'a tiszta markdown jön, JSON nélkül');
  assert.deepEqual(naplo, [UMF, UMF + '.md']);
  // ha a .md nem jó → a HTML-eredmény marad (régi viselkedés)
  const UMG = 'https://agent.minimax.io/docs/code/mintlify2';
  const r2 = await sugoSzoveg(UMG, { fetchFn: utasFetch({ [UMG]: { ct: 'text/html', text: hosszuHtml } }, []), dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r2.szoveg.includes('Olvasható, saját tesztmondat.'));
  // a jsonSzennyezett küszöbe: 1–2 JSON-példa egy cikkben még nem szennyezés
  assert.equal(jsonSzennyezett('Példa: {"name": "x"} és {"id": 1}'), false);
  assert.equal(jsonSzennyezett('{"a":1} {"b":2} {"c":3}'), true);
  assert.equal(jsonSzennyezett(''), false);
});

await t('.md-tartalék: jó HTML-lap (≥ 300 karakter) mellett a `.md`-t NEM kéri le', async () => {
  const naplo = [];
  const UJ2 = 'https://agent.minimax.io/docs/code/jo-lap';
  const f = utasFetch({ [UJ2]: { ct: 'text/html', text: '<html><title>x</title><body>' + 'Saját mondat. '.repeat(40) + '</body></html>' }, [UJ2 + '.md']: { ct: 'text/markdown', text: MD } }, naplo);
  const r = await sugoSzoveg(UJ2, { fetchFn: f, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r.szoveg.includes('Saját mondat.'));
  assert.deepEqual(naplo, [UJ2], 'csak a HTML');
});

await t('.md-tartalék: a `.md` 404 → a régi eredmény (a rövid élő lap, tárolás nélkül); nem markdown content-type → elutasítva', async () => {
  const UA1 = 'https://agent.minimax.io/docs/code/agents/skills';
  // 404
  const f404 = utasFetch({ [UA1]: { ct: 'text/html', text: HEJ } }, []);
  const r1 = await sugoSzoveg(UA1, { fetchFn: f404, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r1 && r1.honnan === 'elo' && r1.szoveg.includes('scaffolding'), 'a régi eredmény');
  assert.equal(sugoTarOlvas(UA1, { dir }), null, 'rövid lap nem kerül a tárba');
  // 200, de HTML content-type (az SPA minden címre ugyanazt a vázat adja) → elutasítva
  const fHtml = utasFetch({ [UA1]: { ct: 'text/html', text: HEJ }, [UA1 + '.md']: { ct: 'text/html; charset=utf-8', text: MD } }, []);
  const r2 = await sugoSzoveg(UA1, { fetchFn: fHtml, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r2.szoveg.includes('scaffolding') && !r2.szoveg.includes('kitalált, saját'), 'HTML content-type → elutasítva');
  // markdown fejléc, de a tartalom HTML → elutasítva
  const fRossz = utasFetch({ [UA1]: { ct: 'text/html', text: HEJ }, [UA1 + '.md']: { ct: 'text/markdown', text: '<!DOCTYPE html><html><body>' + 'x'.repeat(500) + '</body></html>' } }, []);
  const r3 = await sugoSzoveg(UA1, { fetchFn: fRossz, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r3.szoveg.includes('scaffolding'), 'HTML tartalom → elutasítva');
  // túl rövid markdown → elutasítva
  const fRovid = utasFetch({ [UA1]: { ct: 'text/html', text: HEJ }, [UA1 + '.md']: { ct: 'text/plain', text: '# Cím\nrövid' } }, []);
  assert.ok((await sugoSzoveg(UA1, { fetchFn: fRovid, dir, most, felfedezettEszkoz: 'MiniMax Code' })).szoveg.includes('scaffolding'));
  // text/plain elfogadott
  const fPlain = utasFetch({ [UA1]: { ct: 'text/html', text: HEJ }, [UA1 + '.md']: { ct: 'text/plain; charset=utf-8', text: MD } }, []);
  assert.ok((await sugoSzoveg(UA1, { fetchFn: fPlain, dir, most, felfedezettEszkoz: 'MiniMax Code' })).szoveg.includes('kitalált, saját'));
});

await t('.md-tartalék: idegen céges végcím (az átirányítás más domainre visz) → elutasítva; http végcím → elutasítva', async () => {
  const UB = 'https://agent.minimax.io/docs/code/idegen';
  const fIdegen = utasFetch({ [UB]: { ct: 'text/html', text: HEJ }, [UB + '.md']: { ct: 'text/markdown', text: MD, vegUrl: 'https://evil.example.com/x.md' } }, []);
  const r = await sugoSzoveg(UB, { fetchFn: fIdegen, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r.szoveg.includes('scaffolding') && !r.szoveg.includes('kitalált, saját'));
  const fHttp = utasFetch({ [UB]: { ct: 'text/html', text: HEJ }, [UB + '.md']: { ct: 'text/markdown', text: MD, vegUrl: 'http://code.minimax.io/x.md' } }, []);
  assert.ok((await sugoSzoveg(UB, { fetchFn: fHttp, dir, most, felfedezettEszkoz: 'MiniMax Code' })).szoveg.includes('scaffolding'));
  // hasonló nevű, de más regisztrált domain
  const fMas = utasFetch({ [UB]: { ct: 'text/html', text: HEJ }, [UB + '.md']: { ct: 'text/markdown', text: MD, vegUrl: 'https://minimax.io.evil.com/x.md' } }, []);
  assert.ok((await sugoSzoveg(UB, { fetchFn: fMas, dir, most, felfedezettEszkoz: 'MiniMax Code' })).szoveg.includes('scaffolding'));
});

await t('.md-tartalék: NEM tárolható URL-re (nincs jóváhagyás / eszköz-jelölés) nincs `.md`-kérés; a hívás hibája nem dob', async () => {
  const naplo = [];
  const f = utasFetch({ [UW]: { ct: 'text/html', text: HEJ }, [UW + '.md']: { ct: 'text/markdown', text: MD } }, naplo);
  const r = await sugoSzoveg(UW, { fetchFn: f, dir, most });   // eszköz-jelölés nélkül
  assert.ok(r.szoveg.includes('scaffolding'));
  assert.deepEqual(naplo, [UW], 'csak a HTML');
  // a .md-kérés dob → a régi eredmény
  let n = 0;
  const dob = async u => { if (n++ === 0) return { ok: true, text: async () => HEJ }; throw new Error('hálózati hiba'); };
  const r2 = await sugoSzoveg('https://agent.minimax.io/docs/code/dob', { fetchFn: dob, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  assert.ok(r2 && r2.szoveg.includes('scaffolding'));
});

await t('.md-tartalék: a tárolt (jó) példány nem romlik — rövid HTML-váz + hibás `.md` esetén a régi tárolt szöveg jön', async () => {
  const UT = 'https://agent.minimax.io/docs/code/tarolt';
  const jo = utasFetch({ [UT]: { ct: 'text/html', text: HEJ }, [UT + '.md']: { ct: 'text/markdown', text: MD } }, []);
  await sugoSzoveg(UT, { fetchFn: jo, dir, most, felfedezettEszkoz: 'MiniMax Code' });
  const elotte = readFileSync(metaUtja(dir, UT), 'utf-8');
  const rossz = utasFetch({ [UT]: { ct: 'text/html', text: HEJ } }, []);   // a .md most 404
  const r = await sugoSzoveg(UT, { fetchFn: rossz, dir, most: most + 30 * NAP, felfedezettEszkoz: 'MiniMax Code' });
  assert.equal(r.honnan, 'regi-tar');
  assert.ok(r.szoveg.includes('kitalált, saját tesztmondat'));
  assert.equal(readFileSync(metaUtja(dir, UT), 'utf-8'), elotte, 'a meta változatlan');
});

rmSync(dir, { recursive: true, force: true });
if (regiKornyezet !== undefined) process.env.SUGO_TAR_DIR = regiKornyezet;
console.log(`\n${bukott === 0 ? '✅' : '❌'} sugo-tar.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
