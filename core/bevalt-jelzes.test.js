// core/bevalt-jelzes.js — a „Bevált?” napi riport-sora (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a csendes nap maradjon csendes, de az „elromlott a számláló” és a
// „senki nem szavazott” NE legyen egyforma; a sok 👎-t kapó útmutató név szerint látszódjon.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { bevaltSor } from './bevalt-jelzes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-10-24T08:00:00Z');   // tegnap = 2026-10-23

// 1) csend: nincs adat / 7 napja 0
assert.equal(bevaltSor(null, NOW), '');
assert.equal(bevaltSor({}, NOW), '');
assert.equal(bevaltSor({ '2026-10-23': { 'a-guide': { up: 0, down: 0 } } }, NOW), '');

// 2) hibás export → külön mondat, nem 0
assert.equal(bevaltSor({ error: true }, NOW), '👍 Bevált-jelzés: a számlálót nem sikerült lekérdezni.');

// 3) tegnap + 7 nap; a 8 napnál régebbi nem számít
{
  const fbp = {
    '2026-10-23': { 'a-guide': { up: 3, down: 1 } },
    '2026-10-20': { 'b-guide': { up: 2, down: 0 } },
    '2026-10-15': { 'c-guide': { up: 50, down: 50 } }   // 9 napja → kimarad
  };
  assert.equal(bevaltSor(fbp, NOW), '👍 Bevált? tegnap: 3👍 1👎 · 7 nap: 5👍 1👎');
}

// 4) sok 👎 (7 nap alatt ≥3) → név szerint, a legrosszabb elöl; 2 még nem
{
  const fbp = {
    '2026-10-23': { 'rossz-guide': { up: 0, down: 2 }, 'kicsit-rossz': { up: 1, down: 2 } },
    '2026-10-22': { 'rossz-guide': { up: 0, down: 2 }, 'masik-rossz': { up: 0, down: 3 } }
  };
  assert.equal(bevaltSor(fbp, NOW), '👍 Bevált? tegnap: 1👍 4👎 · 7 nap: 1👍 9👎 · ⚠️ sok 👎: rossz-guide (4), masik-rossz (3)');
}

// 5) BEKÖTÉS-ŐR: a napi riport tényleg kiírja
{
  const dr = readFileSync(join(ROOT, 'core', 'daily-report.js'), 'utf-8');
  assert.match(dr, /import \{ bevaltSor \} from '\.\/bevalt-jelzes\.js'/);
  assert.match(dr, /bevaltSor\(exp\.__fbp\)/);
}

console.log('✅ bevalt-jelzes: riport-sor rendben');
