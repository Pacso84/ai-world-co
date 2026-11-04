// ===================================================================
// TESZT — a CI időkorlátjai összeférnek-e a job-plafonnal
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-29, hibavadászat): a `.github/workflows/auto.yml` lépéseinek
// saját `timeout-minutes` értékei ÖSSZESEN 131 percet tesznek ki, miközben a
// job-plafon 120 volt. A fájl fejlécében lévő komment még „111 percet" számolt
// — az a szám ELAVULT: a Pipeline 45→55-re nőtt 08-03-án, a Fordítás 30→35-re
// 07-31-én, UGYANAZON a napon, amikor a 120-as plafont épp a „111 perc
// biztonságos" érvvel vezették be. Senki nem számolt utána.
//
// 🔑 MIÉRT SÚLYOS: a workflow SAJÁT kommentje mondja ki, hogy egy MEGSZAKÍTOTT
// (timeout/cancelled) jobnál a GitHub az `if: always()` lépéseket is KIHAGYJA —
// tehát a záró visszacommit sem fut le, és a futás EGÉSZ MUNKÁJA elvész.
// A job-plafon túllépése pont azt a katasztrófát okozná, amit a 60→120 emelés
// meg akart előzni.
//
// Ez a teszt a projekt saját szabályát valósítja meg: „növekvő szám mellé
// mindig őrszem" (a `_redirects` 2026-08-15-i leckéje).
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const YML = join(__dirname, '..', '.github', 'workflows', 'auto.yml');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 CI-időkorlátok\n');

/**
 * A `timeout-minutes:` értékek a behúzás szerint válnak szét:
 * a JOB szintjén 4 szóköz, a LÉPÉSEKnél 8 — a YAML szerkezete ezt garantálja.
 */
function idokorlatok() {
  const sorok = readFileSync(YML, 'utf-8').split(/\r?\n/);
  let job = null; const lepesek = [];
  for (const sor of sorok) {
    const m = sor.match(/^(\s*)timeout-minutes:\s*(\d+)/);
    if (!m) continue;
    const behuzas = m[1].length, ertek = Number(m[2]);
    if (behuzas <= 4) job = ertek; else lepesek.push(ertek);
  }
  return { job, lepesek, osszeg: lepesek.reduce((a, b) => a + b, 0) };
}

t('a mérőeszköz megtalálja a job-plafont és a lépéseket', () => {
  // Előbb hitelesítjük a mérést: ha a YAML szerkezete változik, ez bukik
  // előbb — nem pedig hamis „minden rendben".
  const { job, lepesek } = idokorlatok();
  assert.ok(Number.isFinite(job), 'nem találom a job-szintű timeout-minutes-t');
  assert.ok(lepesek.length >= 5, 'gyanúsan kevés lépés-időkorlát: ' + lepesek.length);
});

t('🕰️ a lépés-időkorlátok ÖSSZEGE belefér a job-plafonba', () => {
  const { job, lepesek, osszeg } = idokorlatok();
  assert.ok(osszeg <= job,
    `a lépések együtt ${osszeg} percet kérhetnek, a job-plafon viszont ${job} — `
    + `egy megszakított jobnál a GitHub az if: always() lépéseket is kihagyja, `
    + `tehát a záró visszacommit sem futna le, és a futás EGÉSZ munkája elveszne. `
    + `Lépések: ${lepesek.join(' + ')}`);
});

t('marad tartalék a plafonig', () => {
  // Nem elég épphogy beférni: a lépés-korlátok közti „üresjárat" (npm install,
  // checkout, a korlát nélküli lépések) is időt visz.
  const { job, osszeg } = idokorlatok();
  assert.ok(job - osszeg >= 5, `csak ${job - osszeg} perc tartalék maradt a plafonig`);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} ci-timeouts.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
