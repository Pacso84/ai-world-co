// 🪦 Halott-link őr (2026-10-31, user: „ne forduljon elő többet!”). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frissit, esedekes, bejelentve, MASODIK_NAP, MEGORZES_NAP } from './halott-url.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const NAP = 864e5, T0 = Date.parse('2026-10-31T12:00:00Z');

console.log('\n🧪 halott-url');

t('🆕 első futás: csak alapállapot — semmi nem „halott”', () => {
  const a = frissit(null, ['a', 'b'], T0);
  assert.deepEqual(a.elo, ['a', 'b']); assert.deepEqual(esedekes(a, T0), []);
});

t('🪦 BÁRMILYEN okból eltűnt slug sorba kerül (nem kell hozzá törlés-lista)', () => {
  const a = frissit(frissit(null, ['a', 'b', 'c'], T0), ['a'], T0 + 1000);
  assert.deepEqual(esedekes(a, T0 + 1000), ['b', 'c']);
});

t('🔁 elbukott bejelentés után a következő futás PÓTOLJA (kipipálás csak siker után)', () => {
  let a = frissit(frissit(null, ['a', 'b'], T0), ['a'], T0);
  assert.deepEqual(esedekes(a, T0), ['b']);
  a = frissit(a, ['a'], T0 + 8 * 3600e3);   // a futás elbukott → nincs bejelentve()
  assert.deepEqual(esedekes(a, T0 + 8 * 3600e3), ['b'], 'a 48 órás ablak régi hibája: a kimaradt bejelentés elveszett');
});

t('📅 1. bejelentés után csend, 7 nap múlva 2. kör, utána nincs több; 30 nap után kikerül', () => {
  let a = frissit(frissit(null, ['a', 'b'], T0), ['a'], T0);
  a = bejelentve(a, ['b'], T0);
  assert.deepEqual(esedekes(a, T0 + NAP), []);
  assert.deepEqual(esedekes(a, T0 + MASODIK_NAP * NAP), ['b']);
  a = bejelentve(a, ['b'], T0 + MASODIK_NAP * NAP);
  assert.deepEqual(esedekes(a, T0 + 20 * NAP), []);
  a = frissit(a, ['a'], T0 + (MASODIK_NAP + MEGORZES_NAP + 1) * NAP);
  assert.equal(a.sor.b, undefined);
});

t('↩️ ha a slug visszatér, kikerül a sorból', () => {
  let a = frissit(frissit(null, ['a', 'b'], T0), ['a'], T0);
  a = frissit(a, ['a', 'b'], T0 + 1000);
  assert.deepEqual(esedekes(a, T0 + 1000), []);
});

t('🔌 bekötés: az IndexNow-futás a halott slugokat is küldi; kipipálás csak 200/202 után; üres cikkmappa nem „öl meg” mindent', () => {
  const src = readFileSync(join(ROOT, 'core', 'indexnow.js'), 'utf-8');
  assert.match(src, /halottFrissit\(elozo, eloSlugok, now\)/);
  assert.match(src, /if \(eloSlugok\.length > 50\)/);
  const siker = src.indexOf("console.log(`   📣 IndexNow: ${list.length} URL bejelentve");
  assert.ok(siker > 0 && src.indexOf('halottMent(true)', siker) - siker < 120, 'a kipipálás nem közvetlenül a sikeres válasz után van');
  const st = JSON.parse(readFileSync(join(ROOT, 'memory', 'halott-url-allapot.json'), 'utf-8'));
  assert.ok(Array.isArray(st.elo) && st.elo.length > 50, 'nincs alapállapot');
});

if (hiba) { console.log(`\n❌ halott-url.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ halott-url.test: mind rendben');
