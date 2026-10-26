// Látható módosítás-dátum + kereső-értesítés a módosított/összevont oldalakról (2026-10-19).
// User: „de ne felejtsük el lehessen látni a módosítás dátumát! és ezeket bele kell rakni a
// honlaptérképbe vagy elküldeni a keresőknek". A sitemap lastmod-ja már a valódi dátum
// (core/sitemap-lastmod.js); ez a teszt a LÁTHATÓ sort és az IndexNow-bejelentést őrzi.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { valodiModositas, frissitveNap } from './sitemap-lastmod.js';
import { osszevontUrlek } from './utmutato-osszevonas.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 modositas-datum');

t('🕰️ valódi módosítás: a legkésőbbi TARTALMI változás', () => {
  assert.equal(valodiModositas({ published_at: '2026-08-01T10:00:00Z', howto_upgraded_at: '2026-09-02T10:00:00Z', fresh_updated_at: '2026-10-05T10:00:00Z' }), '2026-10-05T10:00:00Z');
  assert.equal(valodiModositas({ published_at: '2026-08-01T10:00:00Z', fact_checked_at: '2026-09-09T10:00:00Z' }), '2026-09-09T10:00:00Z', 'a tény-ellenőrző javítása módosítás');
  assert.equal(valodiModositas({ published_at: '2026-08-01T10:00:00Z' }), '2026-08-01T10:00:00Z');
  assert.equal(valodiModositas({}), '');
  assert.equal(valodiModositas(null), '');
});

t('🔧 a „Ha elakadsz" doboz megjelenése (elakadas_at) valódi módosítás', () => {
  const alap = { published_at: '2026-10-01T10:00:00Z' };
  assert.equal(valodiModositas({ ...alap, elakadas_at: '2026-10-27T10:00:00Z' }), '2026-10-27T10:00:00Z');
  assert.equal(valodiModositas({ ...alap, fresh_updated_at: '2026-10-30T10:00:00Z', elakadas_at: '2026-10-27T10:00:00Z' }), '2026-10-30T10:00:00Z', 'a későbbi marad');
  assert.equal(valodiModositas(alap), '2026-10-01T10:00:00Z', 'elakadas_at nélkül a régi eredmény');
  assert.equal(valodiModositas({ ...alap, elakadas_at: 'nem-datum' }), '2026-10-01T10:00:00Z', 'érvénytelen dátumot nem fogad el');
});

t('🚩 a tény-ellenőrző MEGJELÖLÉSE nem módosítás (a szöveg nem változott)', () => {
  assert.equal(valodiModositas({ published_at: '2026-08-01T10:00:00Z', fact_checked_at: '2026-10-10T10:00:00Z', fact_check_flag: 'may-be-obsolete' }), '2026-08-01T10:00:00Z');
});

t('🔄 „Frissítve" csak akkor, ha a módosítás KÉSŐBBI NAPON volt, mint a megjelenés', () => {
  assert.equal(frissitveNap('2026-08-01T10:00:00Z', '2026-10-05T09:00:00Z'), '2026-10-05T09:00:00Z');
  assert.equal(frissitveNap('2026-08-01T10:00:00Z', '2026-08-01T22:00:00Z'), null, 'ugyanaznap — nem frissítés');
  assert.equal(frissitveNap('2026-08-01T10:00:00Z', '2026-07-30T10:00:00Z'), null, 'korábbi — hibás adat');
  assert.equal(frissitveNap('2026-08-01T10:00:00Z', ''), null);
  assert.equal(frissitveNap('', '2026-08-01T10:00:00Z'), null);
});

t('🏗️ a build a közös függvényből számol, és MINDKÉT sablon kiírja a sort (hír + útmutató)', () => {
  const b = olvas('website/build.js');
  assert.match(b, /modifiedAt:\s*valodiModositas\(data\._meta\)/, 'a modifiedAt nem a közös függvényből jön');
  const db = (b.match(/\$\{frissitveHtml\(a\)\}/g) || []).length;
  assert.equal(db, 2, `a „Frissítve" sor ${db} sablonban van, 2 kellene`);
  assert.match(b, /function frissitveHtml\(a\)[\s\S]{0,400}frissitveNap\(a\.publishedAt, a\.modifiedAt\)[\s\S]{0,300}<time datetime=/, 'gépileg olvasható <time> kell');
  for (const [nyelv, szo] of [['en', 'Updated'], ['hu', 'Frissítve'], ['es', 'Actualizado']]) {
    assert.ok(new RegExp(`articleUpdated: '${szo}'`).test(b), `hiányzik a(z) ${nyelv} felirat: ${szo}`);
  }
});

t('📣 IndexNow: a MÓDOSÍTOTT cikket is bejelenti, nem csak az újat', () => {
  const src = olvas('core/indexnow.js');
  assert.match(src, /valodiModositas\(d\._meta\)/, 'csak a megjelenés/írás dátumát nézi');
  assert.match(src, /osszevontUrlek\(/, 'az összevont útmutatók címe nem megy ki');
});

t('🔗 összevonás után a RÉGI cím (301) és a megmaradó is kimegy — minden nyelven, csak frissen', () => {
  const most = Date.parse('2026-10-20T03:00:00Z');
  const naplo = { tortenet: [
    { at: '2026-10-20T02:10:00Z', from: 'regi-cim', to: 'megmarado' },
    { at: '2026-10-10T02:10:00Z', from: 'reg-volt', to: 'mar-bejelentve' }
  ] };
  const ki = osszevontUrlek(naplo, 'https://x.test', ['', '/hu', '/es'], most, 48);
  assert.deepEqual(ki.sort(), [
    'https://x.test/article/megmarado', 'https://x.test/article/regi-cim',
    'https://x.test/es/article/megmarado', 'https://x.test/es/article/regi-cim',
    'https://x.test/hu/article/megmarado', 'https://x.test/hu/article/regi-cim'
  ]);
  assert.deepEqual(osszevontUrlek(null, 'https://x.test', [''], most, 48), []);
});

if (hiba) { console.log(`\n❌ modositas-datum.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ modositas-datum.test: mind rendben');
