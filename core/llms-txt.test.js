// ===================================================================
// TESZT — llms.txt nyelv-mondat
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-25): az llms.txt 25 napon át németet és franciát hirdetett,
// pedig azok a nyelvek 07-31 óta 301-gyel az angolra mennek. A mondat kézzel
// volt beírva a build.js-be, tehát semmi nem kötötte a SITE_LANGS-hoz.
// Lásd a core/llms-txt.js fejlécét.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { langSentence } from './llms-txt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KIVEZETETT = ['de', 'fr'];

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 llms.txt nyelv-mondat\n');

t('az élő nyelvlistából születik a mondat', () => {
  assert.equal(langSentence(['en', 'hu', 'es']),
    ' Also available in Hungarian (/hu/) and Spanish (/es/).');
});

t('egyetlen másik nyelvnél nincs "and"', () => {
  assert.equal(langSentence(['en', 'hu']), ' Also available in Hungarian (/hu/).');
});

t('csak angol → nincs mondat (nem hirdetünk nem létezőt)', () => {
  assert.equal(langSentence(['en']), '');
  assert.equal(langSentence([]), '');
  assert.equal(langSentence(null), '');
});

t('ismeretlen nyelvkód nem tűnik el némán', () => {
  // Jobb kiírni a kódot, mint elhallgatni: így LÁTSZIK, ha valaki új nyelvet
  // vesz fel és elfelejti a nevét megadni.
  assert.ok(langSentence(['en', 'it']).includes('it (/it/)'));
});

t('a kivezetett nyelv SOHA nem kerül a mondatba a rendes listából', () => {
  const s = langSentence(['en', 'hu', 'es']);
  for (const l of KIVEZETETT) assert.ok(!s.includes(`/${l}/`), l + ' nem szerepelhet');
});

// --- VALÓDI FÁJLOKON, nem kitalált adaton ---

t('a build.js nem tartalmaz kézzel beírt nyelv-hirdetést', () => {
  const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  // Pontosan az a forma, ami 25 napig kint volt.
  for (const rossz of ['German (/de/)', 'French (/fr/)']) {
    assert.ok(!src.includes(rossz),
      'a build.js-ben megint kézzel írt nyelv-mondat van: ' + rossz);
  }
});

t('a kész llms.txt nem hirdet kivezetett nyelvet', () => {
  const p = join(ROOT, 'website', 'public', 'llms.txt');
  if (!existsSync(p)) {
    // A NÉMA KIHAGYÁS és a néma siker egyformán néz ki — ezért kiírjuk.
    console.log('     ⏭️  kihagyva: még nincs build (website/public/llms.txt)');
    return;
  }
  const s = readFileSync(p, 'utf-8');
  for (const l of KIVEZETETT) {
    assert.ok(!s.includes(`(/${l}/)`), `az élő llms.txt még hirdeti a(z) ${l} nyelvet`);
  }
});

console.log(`\n✅ ${pass} teszt rendben`);
