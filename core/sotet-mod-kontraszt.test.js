// ===================================================================
// TESZT — sötét módban olvasható-e a „fordított” doboz szövege (2026-11-02)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI VOLT A HIBA
// A sötét dobozok világos módban `background: var(--ink); color: var(--paper)`
// párral fordítanak. Sötét módban a két változó helyet cserél, így ez magától
// rendben van — KIVÉVE ahol egy `[data-theme="dark"]` szabály a hátteret
// FIX feketére (#000) írja: ott a szöveg `var(--paper)` = #17150f maradt,
// fekete háttéren (kontraszt 1,15). Chrome-ban, 390 px-en igazolva:
// a cikkek „What this means for you” dobozának szövege és a lábléc
// „AI WORLD HQ.” felirata olvashatatlan volt (csak a #fff félkövér látszott).
//
// SZABÁLY: ha egy sötét-módos szabály a hátteret fix színre állítja, és az
// alap-szabály szövegszíne var(--paper), akkor a sötét szabálynak SAJÁT
// `color`-t is meg kell adnia.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

// Egyszerű, @media-t is átlépő szabály-gyűjtő: „szelektor { törzs }”.
const szabalyok = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(m => ({ sel: m[1].trim(), body: m[2] }));

const sotetFix = szabalyok.filter(r =>
  /^\[data-theme="dark"\]\s+\S/.test(r.sel) &&
  /background(-color)?:\s*#[0-9a-f]{3,6}\b/i.test(r.body));

t('van legalább egy fix hátterű sötét-módos szabály (a teszt nem üres)', () => {
  assert.ok(sotetFix.length >= 2, `csak ${sotetFix.length} ilyen szabály — elcsúszott a gyűjtő?`);
});

t('🔴 fix sötét háttér mellett a szöveg nem marad var(--paper)', () => {
  const hibas = [];
  for (const r of sotetFix) {
    for (const egy of r.sel.split(',')) {
      const alap = egy.replace(/^\[data-theme="dark"\]\s+/, '').trim();
      const alapSzab = szabalyok.filter(a =>
        a.sel.split(',').map(s => s.trim()).includes(alap));
      const paperSzoveg = alapSzab.some(a => /(^|[;\s])color:\s*var\(--paper\)/.test(a.body));
      const sajatSzin = /(^|[;\s])color:/.test(r.body);
      if (paperSzoveg && !sajatSzin) hibas.push(alap);
    }
  }
  assert.deepEqual(hibas, [],
    '🔴 sötét módban fekete háttéren sötét szöveg (olvashatatlan): ' + hibas.join(', '));
});

console.log(`\n  ${pass} teszt rendben`);
