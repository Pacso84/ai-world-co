// A honlap-SABLON felületi szövegei a megjelenítés nyelvén (2026-10-21, user: „nézd át, spanyol/magyar
// oldalon maradt-e még javítanivaló!”). Élő összevetés az angol párral: a kártya-címke („AI News”,
// „How-To”, „Business”), a sötét mód gomb („Toggle dark mode”, „Light / dark”) és a menügomb („Menu”)
// minden hu/es oldalon angolul állt. Ezeket a fordító-javító nem éri el (nem cikk, hanem sablon).
// Ingyenes, hálózat nélküli: a website/build.js forrását nézi.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 sablon-nyelv');

t('🏷️ minden kategória-címkének van magyar és spanyol neve', () => {
  const kat = src.slice(src.indexOf('const CATEGORIES = {'), src.indexOf('};', src.indexOf('const CATEGORIES = {')));
  const cimkek = [...kat.matchAll(/label: '([^']+)'/g)].map(m => m[1]);
  assert.ok(cimkek.length >= 6, 'nem találom a CATEGORIES címkéit');
  const nev = src.slice(src.indexOf('const CAT_NEV = {'), src.indexOf('};', src.indexOf('const CAT_NEV = {')));
  for (const ny of ['hu', 'es']) {
    const sor = (nev.match(new RegExp(`^\\s*${ny}: \\{(.*)\\},?$`, 'm')) || [])[1] || '';
    for (const c of cimkek) assert.match(sor, new RegExp(`(^|[ ,{])'?${c.replace(/[-]/g, '\\-')}'?: '`), `${ny}: hiányzik a(z) „${c}” fordítása`);
  }
});

t('🧩 a sablon a fordított nevet írja ki (nincs nyers cat.label a kártyán)', () => {
  assert.equal(/\$\{cat\.label\}/.test(src), false, 'maradt ${cat.label} a sablonban');
  assert.ok((src.match(/\$\{catNev\(cat\)\}/g) || []).length >= 2);
});

t('🌗 a sötét mód és a menü gombjának felirata fordított (nincs beégetett angol)', () => {
  assert.equal(src.includes('aria-label="Toggle dark mode"'), false);
  assert.equal(src.includes('title="Light / dark"'), false);
  assert.equal(src.includes('aria-label="Menu"'), false);
  for (const k of ['themeToggle', 'menuLabel']) assert.equal((src.match(new RegExp(`${k}: '`, 'g')) || []).length, 3, `${k}: nincs meg mindhárom nyelven`);
});

if (hiba) { console.log(`\n❌ sablon-nyelv.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ sablon-nyelv.test: mind rendben');
