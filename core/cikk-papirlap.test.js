// 📄 Papírlapos dizájn a cikkoldalakon (2026-10-30, user 10-28: „ez tetszik, de minden oldalra kéne!”). Ingyenes.
// A hír/útmutató „Röviden” doboza (.lede) és az útmutató „Útvonalad” térképe (.g-map) papírlap pecséttel —
// CSAK stílus: a sablon, a szöveg, a „Written by AI” jelölés és a hirdetés helye nem változik.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8').replace(/\r\n/g, '\n');
const blokk = css.slice(css.indexOf('/* 📄 papírlapos dizájn a cikkoldalakon'));

console.log('\n🧪 cikk-papirlap');

t('🧾 a papírlap-blokk a stíluslap VÉGÉN van (később = erősebb, felülírja a régi .lede / .g-map szabályt)', () => {
  assert.ok(blokk.length > 100, 'nincs papírlap-blokk');
  assert.ok(css.lastIndexOf('.lede {') > css.indexOf('.lede {'), 'a papírlap .lede nem a régi után jön');
  assert.ok(css.lastIndexOf('.g-map {') > css.indexOf('.g-map {'), 'a papírlap .g-map nem a régi után jön');
});

t('🌐 a pecsét felirata mindhárom nyelven (nincs angol mondat a nem angol oldalon)', () => {
  assert.match(blokk, /\.lede::after \{ content: '30 seconds'/);
  assert.match(blokk, /:lang\(hu\) \.lede::after \{ content: '30 másodperc'; \}/);
  assert.match(blokk, /:lang\(es\) \.lede::after \{ content: '30 segundos'; \}/);
});

t('📱 telefonon nincs döntés; 🌙 sötét módban a régi áttetsző háttér felülírva', () => {
  assert.match(blokk, /@media \(max-width: 760px\) \{\s*\.lede, \.g-map \{ transform: none; \}/);
  assert.match(blokk, /\[data-theme="dark"\] \.lede \{ background: var\(--card\); \}/);
});

t('🔍 a pecsét felirata olvasható: külön szín világos és sötét módra (10-30 mérve: sötétben 2,9 volt)', () => {
  assert.match(blokk, /\.lede::after, \.g-map__count \{ color: color-mix\(in srgb, var\(--accent-dark\) 80%, var\(--ink\)\); \}/);
  assert.match(blokk, /\[data-theme="dark"\] \.lede::after, \[data-theme="dark"\] \.g-map__count \{ color: color-mix\(in srgb, var\(--accent\) 40%, var\(--ink\)\); \}/);
});

t('🎨 csak a meglévő színváltozók (nincs beégetett szín → világos/sötét mód magától)', () => {
  assert.doesNotMatch(blokk.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,6}\b|rgba?\(/i);
});

if (hiba) { console.log(`\n❌ cikk-papirlap.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ cikk-papirlap.test: mind rendben');
